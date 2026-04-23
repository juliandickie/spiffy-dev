import type { SpiffyConfig } from "./config.js";
import { parseErrorResponse } from "./errors.js";

type FetchFn = typeof fetch;
type SleepFn = (ms: number) => Promise<void>;
type QueryValue = string | number | boolean;

const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class SpiffyClient {
  constructor(
    private readonly config: SpiffyConfig,
    private readonly fetchImpl: FetchFn = fetch,
    private readonly sleepImpl: SleepFn = defaultSleep,
  ) {}

  async get<T>(path: string, params?: Record<string, QueryValue>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>(url, { method: "GET" });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    if (this.config.dryRun) return this.dryRunResponse<T>("POST", path, body);
    return this.request<T>(this.buildUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    if (this.config.dryRun) return this.dryRunResponse<T>("PUT", path, body);
    return this.request<T>(this.buildUrl(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    if (this.config.dryRun) return this.dryRunResponse<T>("PATCH", path, body);
    return this.request<T>(this.buildUrl(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async delete<T>(path: string): Promise<T> {
    if (this.config.dryRun)
      return this.dryRunResponse<T>("DELETE", path, undefined);
    return this.request<T>(this.buildUrl(path), { method: "DELETE" });
  }

  private dryRunResponse<T>(method: string, path: string, body: unknown): T {
    const payload = {
      dry_run: true,
      method,
      path,
      body,
      note: "Request was NOT sent to Spiffy because SPIFFY_DRY_RUN=1.",
    };
    console.error(
      `[spiffy-mcp dry-run] ${method} ${path}: ${JSON.stringify(body)}`,
    );
    return payload as unknown as T;
  }

  private buildUrl(path: string, params?: Record<string, QueryValue>): string {
    const base = `${this.config.baseUrl}${path}`;
    if (!params || Object.keys(params).length === 0) return base;
    const qs = Object.entries(params)
      .map(
        ([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      )
      .join("&");
    return `${base}?${qs}`;
  }

  private async request<T>(
    url: string,
    init: RequestInit,
    attempt = 0,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      Accept: "application/json",
      ...((init.headers as Record<string, string>) ?? {}),
    };
    const response = await this.fetchImpl(url, { ...init, headers });

    if (this.shouldRetry(response.status) && attempt < 3) {
      const delay = this.retryDelayMs(response, attempt);
      await this.sleepImpl(delay);
      return this.request<T>(url, init, attempt + 1);
    }

    if (!response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
      throw parseErrorResponse(response.status, body);
    }

    if (response.status === 204) return undefined as unknown as T;
    return (await response.json()) as T;
  }

  private shouldRetry(status: number): boolean {
    return status === 429 || (status >= 500 && status < 600);
  }

  private retryDelayMs(response: Response, attempt: number): number {
    // Exponential backoff: 500ms, 1000ms, 2000ms for attempts 0, 1, 2
    const baseMs = 500 * Math.pow(2, attempt);
    // Respect X-RateLimit-Reset (Unix seconds) if present and within a reasonable range.
    const reset = response.headers.get("X-RateLimit-Reset");
    if (reset) {
      const resetMs = Number(reset) * 1000 - Date.now();
      if (resetMs > 0 && resetMs < 60_000) return resetMs;
    }
    return baseMs;
  }
}
