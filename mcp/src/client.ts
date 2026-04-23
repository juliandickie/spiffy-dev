import type { SpiffyConfig } from "./config.js";
import { parseErrorResponse } from "./errors.js";

type FetchFn = typeof fetch;

type QueryValue = string | number | boolean;

export class SpiffyClient {
  constructor(
    private readonly config: SpiffyConfig,
    private readonly fetchImpl: FetchFn = fetch,
  ) {}

  async get<T>(path: string, params?: Record<string, QueryValue>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>(url, { method: "GET" });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(this.buildUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(this.buildUrl(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(this.buildUrl(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(this.buildUrl(path), { method: "DELETE" });
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

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      Accept: "application/json",
      ...((init.headers as Record<string, string>) ?? {}),
    };
    const response = await this.fetchImpl(url, { ...init, headers });

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
}
