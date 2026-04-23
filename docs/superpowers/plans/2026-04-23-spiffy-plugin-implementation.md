# Spiffy Claude Code Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that lets IDD's support, marketing, and ops teams talk to the Spiffy platform in natural language — 22 read tools + 2 guarded write tools exposed over MCP, 4 prepackaged report skills, and two slash commands (`/spiffy-note`, `/spiffy-promo`) with human-confirmation gates.

**Architecture:** Hybrid. A TypeScript MCP server exposes curated, resource-grouped tools to Claude. Markdown-based skills prompt Claude to produce canonically-formatted reports using those tools. Slash commands wrap write operations with confirmation summaries that get echoed back into required arguments at the MCP boundary — making writes impossible without an explicit human-approved summary in the audit log.

**Tech Stack:**
- Node.js ≥ 18 (MCP SDK requirement)
- TypeScript 5.x
- `@modelcontextprotocol/sdk` (MCP server framework)
- `zod` (runtime schema validation for tool arguments)
- `vitest` (unit tests)
- `@iarna/toml` (parse `config.toml` fallback)
- Build tool: `tsc` (produces `dist/index.js`)
- Distribution: private GitHub repo under IDD org, installed as a Claude Code plugin

**Spec reference:** `/Users/juliandickie/code/spiffy/docs/superpowers/specs/2026-04-23-spiffy-plugin-design.md`
**API reference:** `/Users/juliandickie/code/spiffy/spiffy-openapi.json` (OpenAPI 3.1.0, 140 operations)

---

## File Structure

The repo root is already `/Users/juliandickie/code/spiffy/`. At completion, this plan produces:

```
spiffy/
├── plugin.json                       # Claude Code plugin manifest
├── .mcp.json                         # MCP server registration
├── .env.example                      # Config template
├── .gitignore                        # (already exists)
├── README.md                         # User-facing install + usage guide
├── docs/                             # (specs + plans already here)
├── spiffy-openapi.json               # (already here) reference API spec
├── mcp/
│   ├── package.json                  # TS project dependencies
│   ├── tsconfig.json                 # TypeScript config
│   ├── vitest.config.ts              # Vitest config
│   ├── src/
│   │   ├── index.ts                  # MCP server entrypoint + tool registration
│   │   ├── config.ts                 # API key resolution (env → 1P → toml)
│   │   ├── client.ts                 # Spiffy HTTP client (auth, retry, rate-limit, dry-run)
│   │   ├── errors.ts                 # SpiffyError class + error mapping
│   │   ├── audit.ts                  # Audit log writer for write operations
│   │   ├── types.ts                  # Shared types (pagination, etc.)
│   │   └── tools/
│   │       ├── customers.ts          # 5 customer read tools
│   │       ├── orders.ts             # 2 order read tools
│   │       ├── subscriptions.ts      # 3 subscription read tools
│   │       ├── payments.ts           # 4 payment read tools
│   │       ├── products.ts           # 2 product read tools
│   │       ├── promos.ts             # 2 promo read tools
│   │       ├── affiliates.ts         # 3 affiliate read tools
│   │       ├── meta.ts               # account_get
│   │       └── writes.ts             # customer_add_note, promo_create (with confirmation args)
│   └── tests/
│       ├── config.test.ts
│       ├── client.test.ts
│       ├── errors.test.ts
│       ├── audit.test.ts
│       └── tools/
│           ├── customers.test.ts
│           ├── writes.test.ts
│           └── (other resource tests as created)
├── commands/
│   ├── spiffy-note.md                # /spiffy-note slash command
│   └── spiffy-promo.md               # /spiffy-promo slash command
└── skills/
    ├── spiffy-mrr-snapshot/SKILL.md
    ├── spiffy-affiliate-report/SKILL.md
    ├── spiffy-churn-report/SKILL.md
    └── spiffy-top-products-report/SKILL.md
```

**Responsibility boundaries:**
- `config.ts` is the only file that reads env vars and filesystem config. Everything else takes config as an argument.
- `client.ts` is the only file that calls `fetch`. All tools go through it.
- `errors.ts` is the only place that maps raw HTTP responses to typed errors.
- `audit.ts` is the only file that writes to the audit log.
- Each `tools/*.ts` file registers a related group of MCP tools. Read tools are thin wrappers over `client` calls; write tools additionally call `audit.log()`.
- Slash commands (`commands/*.md`) contain prompts that instruct Claude to use MCP tools in a specific sequence — they don't contain executable code.
- Skills (`skills/*/SKILL.md`) contain prompts for report generation.

---

## Task 1: Initialize the TypeScript MCP project

**Goal:** Create `mcp/package.json`, `tsconfig.json`, `vitest.config.ts`, and install dependencies. Produce an empty buildable project.

**Files:**
- Create: `mcp/package.json`
- Create: `mcp/tsconfig.json`
- Create: `mcp/vitest.config.ts`
- Create: `mcp/src/index.ts` (placeholder)

- [ ] **Step 1: Create `mcp/package.json`**

```json
{
  "name": "spiffy-mcp",
  "version": "0.1.0",
  "private": true,
  "description": "MCP server for the Spiffy API (part of the spiffy Claude Code plugin)",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@iarna/toml": "^2.2.5",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.5.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Create `mcp/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `mcp/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: true,
  },
});
```

- [ ] **Step 4: Create placeholder `mcp/src/index.ts`**

```typescript
// Placeholder. The real server is implemented in Task 9.
console.error("spiffy-mcp placeholder — not yet implemented");
process.exit(1);
```

- [ ] **Step 5: Install dependencies**

Run from `/Users/juliandickie/code/spiffy/mcp`:

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm install
```

Expected: creates `node_modules/` and `package-lock.json` without errors.

- [ ] **Step 6: Verify the project builds**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm run build
```

Expected: creates `dist/index.js`. No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/package.json mcp/tsconfig.json mcp/vitest.config.ts mcp/src/index.ts mcp/package-lock.json && git commit -m "Task 1: initialize TypeScript MCP project"
```

Do NOT commit `node_modules/` or `dist/` — these are in `.gitignore`.

---

## Task 2: Config module — API key resolution

**Goal:** Implement `loadConfig()` that reads `SPIFFY_API_KEY` from three sources in precedence order. Includes resolving `op://…` 1Password references via the `op` CLI.

**Files:**
- Create: `mcp/src/config.ts`
- Create: `mcp/tests/config.test.ts`

- [ ] **Step 1: Write failing test for literal env var**

Create `mcp/tests/config.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig } from "../src/config.js";
import * as child_process from "node:child_process";

describe("loadConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.SPIFFY_API_KEY;
    delete process.env.SPIFFY_DRY_RUN;
  });

  it("reads literal API key from SPIFFY_API_KEY env var", async () => {
    process.env.SPIFFY_API_KEY = "sk_literal_abc123";
    const config = await loadConfig();
    expect(config.apiKey).toBe("sk_literal_abc123");
    expect(config.baseUrl).toBe("https://api.spiffy.co");
    expect(config.dryRun).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/config.test.ts
```

Expected: FAIL — "Cannot find module '../src/config.js'"

- [ ] **Step 3: Write minimal config.ts to pass literal case**

Create `mcp/src/config.ts`:

```typescript
export interface SpiffyConfig {
  apiKey: string;
  baseUrl: string;
  dryRun: boolean;
}

export async function loadConfig(): Promise<SpiffyConfig> {
  const raw = process.env.SPIFFY_API_KEY;
  if (!raw) {
    throw new Error(
      "SPIFFY_API_KEY is not set. See README for configuration options (env var, op:// reference, or ~/.config/spiffy-plugin/config.toml)."
    );
  }
  return {
    apiKey: raw,
    baseUrl: process.env.SPIFFY_BASE_URL ?? "https://api.spiffy.co",
    dryRun: process.env.SPIFFY_DRY_RUN === "1",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/config.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 5: Add failing test for `op://` reference**

Append to `mcp/tests/config.test.ts`:

```typescript
  it("resolves op:// reference via op CLI", async () => {
    process.env.SPIFFY_API_KEY = "op://Team/Spiffy/credential";
    const execFileSync = vi.spyOn(child_process, "execFileSync").mockReturnValue(
      Buffer.from("sk_resolved_xyz789\n")
    );
    const config = await loadConfig();
    expect(execFileSync).toHaveBeenCalledWith(
      "op",
      ["read", "op://Team/Spiffy/credential"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    expect(config.apiKey).toBe("sk_resolved_xyz789");
  });
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/config.test.ts
```

Expected: FAIL — op:// not resolved, apiKey is literal string starting with "op://".

- [ ] **Step 7: Implement op:// resolution**

Replace `mcp/src/config.ts` with:

```typescript
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import TOML from "@iarna/toml";

export interface SpiffyConfig {
  apiKey: string;
  baseUrl: string;
  dryRun: boolean;
}

function resolveOpReference(ref: string): string {
  try {
    const out = execFileSync("op", ["read", ref], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out.toString("utf8").trim();
  } catch (err) {
    throw new Error(
      `Failed to resolve 1Password reference "${ref}". ` +
        `Ensure the 1Password CLI ('op') is installed, you are signed in, and the reference is valid. ` +
        `Underlying error: ${(err as Error).message}`
    );
  }
}

function loadFromTomlFallback(): string | undefined {
  const path = join(homedir(), ".config", "spiffy-plugin", "config.toml");
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = TOML.parse(raw) as { api_key?: string };
    return parsed.api_key;
  } catch {
    return undefined;
  }
}

export async function loadConfig(): Promise<SpiffyConfig> {
  let raw = process.env.SPIFFY_API_KEY;

  if (!raw) {
    raw = loadFromTomlFallback();
  }

  if (!raw) {
    throw new Error(
      "SPIFFY_API_KEY is not set. Configure it one of three ways:\n" +
        "  1. Set SPIFFY_API_KEY env var to your key (e.g., sk_live_...)\n" +
        "  2. Set SPIFFY_API_KEY to a 1Password reference (e.g., op://Vault/Item/credential)\n" +
        "  3. Create ~/.config/spiffy-plugin/config.toml with 'api_key = \"...\"'\n" +
        "See README for details."
    );
  }

  const apiKey = raw.startsWith("op://") ? resolveOpReference(raw) : raw;

  return {
    apiKey,
    baseUrl: process.env.SPIFFY_BASE_URL ?? "https://api.spiffy.co",
    dryRun: process.env.SPIFFY_DRY_RUN === "1",
  };
}
```

- [ ] **Step 8: Run all config tests**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/config.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 9: Add failing test for config.toml fallback**

Append to `mcp/tests/config.test.ts`:

```typescript
  it("reads api_key from ~/.config/spiffy-plugin/config.toml when env is unset", async () => {
    const fs = await import("node:fs");
    vi.spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      if (String(path).endsWith("spiffy-plugin/config.toml")) {
        return 'api_key = "sk_toml_fallback"\n';
      }
      throw new Error("ENOENT");
    });
    const config = await loadConfig();
    expect(config.apiKey).toBe("sk_toml_fallback");
  });
```

- [ ] **Step 10: Run and verify it passes**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/config.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 11: Add failing test for missing-all-sources error**

Append to `mcp/tests/config.test.ts`:

```typescript
  it("throws a helpful error when no config source is present", async () => {
    const fs = await import("node:fs");
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("ENOENT");
    });
    await expect(loadConfig()).rejects.toThrow(/SPIFFY_API_KEY is not set/);
  });
```

- [ ] **Step 12: Run and verify it passes**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/config.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 13: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/config.ts mcp/tests/config.test.ts && git commit -m "Task 2: implement config loader with env/1P/toml sources"
```

---

## Task 3: Error types and mapping

**Goal:** Define `SpiffyError` class and a helper that maps HTTP responses to typed errors following Spiffy's `{error: {code, message, details}}` shape.

**Files:**
- Create: `mcp/src/errors.ts`
- Create: `mcp/tests/errors.test.ts`

- [ ] **Step 1: Write failing test**

Create `mcp/tests/errors.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { SpiffyError, parseErrorResponse } from "../src/errors.js";

describe("SpiffyError", () => {
  it("carries code, status, message, and details", () => {
    const e = new SpiffyError("validation_error", 422, "Validation failed", {
      fieldErrors: { email: ["required"] },
    });
    expect(e.code).toBe("validation_error");
    expect(e.status).toBe(422);
    expect(e.message).toBe("Validation failed");
    expect(e.details).toEqual({ fieldErrors: { email: ["required"] } });
    expect(e).toBeInstanceOf(Error);
  });
});

describe("parseErrorResponse", () => {
  it("maps structured Spiffy error body to SpiffyError", () => {
    const body = {
      error: {
        code: "not_found",
        message: "Customer not found",
      },
    };
    const err = parseErrorResponse(404, body);
    expect(err).toBeInstanceOf(SpiffyError);
    expect(err.code).toBe("not_found");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Customer not found");
  });

  it("falls back to generic error when body shape is unexpected", () => {
    const err = parseErrorResponse(500, "plain text body" as any);
    expect(err.code).toBe("unknown_error");
    expect(err.status).toBe(500);
    expect(err.message).toMatch(/plain text body/);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/errors.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mcp/src/errors.ts`**

```typescript
export class SpiffyError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SpiffyError";
  }
}

interface StructuredErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

export function parseErrorResponse(status: number, body: unknown): SpiffyError {
  if (body && typeof body === "object" && "error" in body) {
    const structured = body as StructuredErrorBody;
    const code = structured.error?.code ?? "unknown_error";
    const message = structured.error?.message ?? `HTTP ${status}`;
    const details = structured.error?.details;
    return new SpiffyError(code, status, message, details);
  }
  const snippet =
    typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200);
  return new SpiffyError("unknown_error", status, `HTTP ${status}: ${snippet}`);
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/errors.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/errors.ts mcp/tests/errors.test.ts && git commit -m "Task 3: add SpiffyError class and response mapper"
```

---

## Task 4: Spiffy HTTP client — base GET/POST with auth

**Goal:** Thin `SpiffyClient` class wrapping `fetch` with Bearer auth, JSON encoding, and error mapping. Subsequent tasks layer retry, rate-limit, and dry-run on top.

**Files:**
- Create: `mcp/src/client.ts`
- Create: `mcp/tests/client.test.ts`

- [ ] **Step 1: Write failing test**

Create `mcp/tests/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpiffyClient } from "../src/client.js";
import { SpiffyError } from "../src/errors.js";

describe("SpiffyClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("makes a GET request with Bearer auth and returns JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 1 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new SpiffyClient(
      { apiKey: "sk_test", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );

    const result = await client.get<{ data: unknown[] }>("/v2/customers/");
    expect(result).toEqual({ data: [{ id: 1 }] });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/customers/");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test");
  });

  it("encodes query params into the URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    );
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );
    await client.get("/v2/customers/", { search: "jane", per_page: 10 });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/customers/?search=jane&per_page=10");
  });

  it("throws SpiffyError on 4xx responses", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "not_found", message: "nope" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );
    await expect(client.get("/v2/customers/1")).rejects.toBeInstanceOf(SpiffyError);
    await expect(client.get("/v2/customers/1")).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("makes a POST request with a JSON body", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 42 }), {
        status: 201,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );
    const result = await client.post("/v2/customers/1/notes", { notes: "hello" });
    expect(result).toEqual({ id: 42 });
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ notes: "hello" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/client.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mcp/src/client.ts`**

```typescript
import type { SpiffyConfig } from "./config.js";
import { parseErrorResponse, SpiffyError } from "./errors.js";

type FetchFn = typeof fetch;

type QueryValue = string | number | boolean;

export class SpiffyClient {
  constructor(
    private readonly config: SpiffyConfig,
    private readonly fetchImpl: FetchFn = fetch
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
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
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
      let body: unknown;
      const contentType = response.headers.get("content-type") ?? "";
      body = contentType.includes("application/json") ? await response.json() : await response.text();
      throw parseErrorResponse(response.status, body);
    }

    if (response.status === 204) return undefined as unknown as T;
    return (await response.json()) as T;
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/client.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/client.ts mcp/tests/client.test.ts && git commit -m "Task 4: implement SpiffyClient with GET/POST/PUT/PATCH/DELETE and Bearer auth"
```

---

## Task 5: Client — retry with exponential backoff

**Goal:** Retry transient failures (429, 500, 502, 503, 504) up to 3 times with exponential backoff starting at 500ms. Respect `X-RateLimit-Reset` when present.

**Files:**
- Modify: `mcp/src/client.ts`
- Modify: `mcp/tests/client.test.ts`

- [ ] **Step 1: Add failing tests for retry behaviour**

Append to `mcp/tests/client.test.ts`:

```typescript
describe("SpiffyClient retry", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("retries on 429 and succeeds on third attempt", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );
    const result = await client.get<{ ok: boolean }>("/v2/customers/", undefined);
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, 10_000);

  it("throws after maxRetries exhausted", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 503 }));
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );
    await expect(client.get("/v2/customers/")).rejects.toBeInstanceOf(SpiffyError);
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  }, 10_000);

  it("does NOT retry on 4xx other than 429", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "not_found", message: "nope" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );
    await expect(client.get("/v2/customers/1")).rejects.toBeInstanceOf(SpiffyError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests — the retry tests should fail**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/client.test.ts
```

Expected: FAIL on retry tests (current client makes 1 call only).

- [ ] **Step 3: Update `client.ts` to add retry logic**

In `mcp/src/client.ts`, replace the `request` method and add a helper:

```typescript
  private async request<T>(url: string, init: RequestInit, attempt = 0): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      Accept: "application/json",
      ...((init.headers as Record<string, string>) ?? {}),
    };
    const response = await this.fetchImpl(url, { ...init, headers });

    if (this.shouldRetry(response.status) && attempt < 3) {
      const delay = this.retryDelayMs(response, attempt);
      await new Promise((r) => setTimeout(r, delay));
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
    // Exponential backoff: 500ms, 1000ms, 2000ms
    const baseMs = 500 * Math.pow(2, attempt);
    // Respect X-RateLimit-Reset if present
    const reset = response.headers.get("X-RateLimit-Reset");
    if (reset) {
      const resetMs = Number(reset) * 1000 - Date.now();
      if (resetMs > 0 && resetMs < 60_000) return resetMs;
    }
    return baseMs;
  }
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/client.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/client.ts mcp/tests/client.test.ts && git commit -m "Task 5: add retry with exponential backoff to SpiffyClient"
```

---

## Task 6: Client — dry-run mode

**Goal:** When `config.dryRun === true`, non-GET requests log their intent and return a synthetic success response without calling the network. GET requests still execute normally.

**Files:**
- Modify: `mcp/src/client.ts`
- Modify: `mcp/tests/client.test.ts`

- [ ] **Step 1: Add failing test**

Append to `mcp/tests/client.test.ts`:

```typescript
describe("SpiffyClient dry-run", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("skips POST requests in dry-run mode and returns a synthetic response", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: true },
      mockFetch
    );
    const result = await client.post<{ dry_run: boolean }>("/v2/customers/1/notes", { notes: "x" });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dry_run: true });
  });

  it("still executes GET requests in dry-run mode", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: true },
      mockFetch
    );
    const result = await client.get<{ ok: boolean }>("/v2/account");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test — dry-run test should fail**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/client.test.ts
```

Expected: FAIL on dry-run POST test.

- [ ] **Step 3: Add dry-run handling**

In `mcp/src/client.ts`, modify `post`, `put`, `patch`, `delete` to short-circuit when `config.dryRun`. Add this helper and use it in those methods:

```typescript
  private dryRunResponse<T>(method: string, path: string, body: unknown): T {
    const payload = {
      dry_run: true,
      method,
      path,
      body,
      note: "Request was NOT sent to Spiffy because SPIFFY_DRY_RUN=1.",
    };
    console.error(`[spiffy-mcp dry-run] ${method} ${path}: ${JSON.stringify(body)}`);
    return payload as unknown as T;
  }
```

Then update `post`, `put`, `patch`, `delete`:

```typescript
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
    if (this.config.dryRun) return this.dryRunResponse<T>("DELETE", path, undefined);
    return this.request<T>(this.buildUrl(path), { method: "DELETE" });
  }
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/client.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/client.ts mcp/tests/client.test.ts && git commit -m "Task 6: add dry-run mode to SpiffyClient writes"
```

---

## Task 7: Audit log module

**Goal:** Append-only audit log for write operations at `~/.local/share/spiffy-plugin/audit.log`.

**Files:**
- Create: `mcp/src/audit.ts`
- Create: `mcp/tests/audit.test.ts`

- [ ] **Step 1: Write failing test**

Create `mcp/tests/audit.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { writeAuditEntry, formatAuditLine } from "../src/audit.js";
import * as fs from "node:fs";

describe("formatAuditLine", () => {
  it("formats a one-line record with timestamp, operation, and key fields", () => {
    const line = formatAuditLine({
      timestamp: new Date("2026-04-23T14:32:01Z"),
      operator: "julian",
      operation: "promo.create",
      summary: "Create JANE-MAY26-A7KQ 20% off for cus_123",
      responseId: "promo_456",
    });
    expect(line).toBe(
      '2026-04-23T14:32:01.000Z\tjulian\tpromo.create\tresponse_id=promo_456\tsummary="Create JANE-MAY26-A7KQ 20% off for cus_123"\n'
    );
  });

  it("escapes tabs and newlines in the summary", () => {
    const line = formatAuditLine({
      timestamp: new Date("2026-04-23T14:32:01Z"),
      operator: "julian",
      operation: "note.add",
      summary: "Line one\nLine\ttwo",
      responseId: "note_1",
    });
    expect(line).toContain('summary="Line one\\nLine\\ttwo"');
  });
});

describe("writeAuditEntry", () => {
  it("appends a line to the audit log file", () => {
    const appendSpy = vi.spyOn(fs, "appendFileSync").mockImplementation(() => {});
    const mkdirSpy = vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);

    writeAuditEntry({
      timestamp: new Date("2026-04-23T14:32:01Z"),
      operator: "julian",
      operation: "note.add",
      summary: "test",
      responseId: "note_1",
    });

    expect(mkdirSpy).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalledTimes(1);
    const [path, line] = appendSpy.mock.calls[0];
    expect(String(path)).toContain(".local/share/spiffy-plugin/audit.log");
    expect(String(line)).toContain("note.add");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/audit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mcp/src/audit.ts`**

```typescript
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";

export interface AuditEntry {
  timestamp: Date;
  operator: string;
  operation: string;
  summary: string;
  responseId: string;
}

function escapeField(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

export function formatAuditLine(entry: AuditEntry): string {
  const ts = entry.timestamp.toISOString();
  const summary = escapeField(entry.summary);
  return `${ts}\t${entry.operator}\t${entry.operation}\tresponse_id=${entry.responseId}\tsummary="${summary}"\n`;
}

function auditLogPath(): string {
  return join(homedir(), ".local", "share", "spiffy-plugin", "audit.log");
}

export function writeAuditEntry(entry: AuditEntry): void {
  const path = auditLogPath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, formatAuditLine(entry), "utf8");
}

export function currentOperator(): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER ?? "unknown";
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/audit.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/audit.ts mcp/tests/audit.test.ts && git commit -m "Task 7: add audit log module for write operations"
```

---

## Task 8: MCP server entrypoint with startup validation

**Goal:** Wire up the MCP server with stdio transport. On startup, load config, create client, validate credentials via `GET /v2/account`, and register tools. Exit cleanly with helpful error messages on failure.

**Files:**
- Modify: `mcp/src/index.ts` (replace placeholder)
- Create: `mcp/src/tools/meta.ts`

- [ ] **Step 1: Create `mcp/src/tools/meta.ts` with the first real tool (`account_get`)**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";

export function registerMetaTools(server: McpServer, client: SpiffyClient): void {
  server.tool(
    "account_get",
    "Get the currently-authenticated Spiffy account (name, plan, quota usage).",
    {},
    async () => {
      const account = await client.get("/v2/account");
      return {
        content: [{ type: "text", text: JSON.stringify(account, null, 2) }],
      };
    }
  );
}
```

- [ ] **Step 2: Write `mcp/src/index.ts`**

Replace `mcp/src/index.ts` entirely with:

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { SpiffyClient } from "./client.js";
import { SpiffyError } from "./errors.js";
import { registerMetaTools } from "./tools/meta.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const client = new SpiffyClient(config);

  // Startup validation: confirm the API key works.
  try {
    const account = await client.get<{ name?: string }>("/v2/account");
    console.error(
      `[spiffy-mcp] Connected to Spiffy account: ${account.name ?? "(unnamed)"}${
        config.dryRun ? " [DRY RUN — writes disabled]" : ""
      }`
    );
  } catch (err) {
    if (err instanceof SpiffyError && err.status === 401) {
      console.error(
        "[spiffy-mcp] ERROR: API key invalid (401 Unauthorized). " +
          "Regenerate your key at Settings → API in the Spiffy dashboard."
      );
    } else {
      console.error(`[spiffy-mcp] ERROR: could not reach Spiffy API: ${(err as Error).message}`);
    }
    process.exit(1);
  }

  const server = new McpServer({
    name: "spiffy",
    version: "0.1.0",
  });

  registerMetaTools(server, client);
  // More registrations will be added in subsequent tasks.

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(`[spiffy-mcp] Fatal: ${(err as Error).message}`);
  process.exit(1);
});
```

- [ ] **Step 3: Verify the project still builds**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm run build
```

Expected: dist/index.js produced without errors.

- [ ] **Step 4: Smoke test — server starts and exits on missing key**

```bash
cd /Users/juliandickie/code/spiffy/mcp && unset SPIFFY_API_KEY && node dist/index.js
```

Expected output contains: "SPIFFY_API_KEY is not set" and exit code 1.

Verify exit code:

```bash
echo $?
```

Expected: `1`.

- [ ] **Step 5: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/index.ts mcp/src/tools/meta.ts && git commit -m "Task 8: wire up MCP server entrypoint with startup validation and account_get"
```

---

## Task 9: Shared tool utilities

**Goal:** Small helper module for consistent tool responses (JSON → text content) and query-param pass-through from MCP args to `client.get`.

**Files:**
- Create: `mcp/src/tools/util.ts`

- [ ] **Step 1: Write the helper**

Create `mcp/src/tools/util.ts`:

```typescript
export function jsonResult(data: unknown): {
  content: { type: "text"; text: string }[];
} {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/**
 * Convert a flat args object { id: 1, 'filter.email': 'a@b' } into
 * Spiffy filter syntax { id: 1, 'filter[email]': 'a@b' }.
 * Used by list tools that expose filter.* args.
 */
export function normalizeFilterArgs(
  args: Record<string, unknown>
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue;
    const key = k.startsWith("filter.") ? `filter[${k.slice(7)}]` : k;
    out[key] = v as string | number | boolean;
  }
  return out;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/tools/util.ts && git commit -m "Task 9: add shared tool utilities (jsonResult, normalizeFilterArgs)"
```

---

## Task 10: Customer tools (5 read tools)

**Goal:** Register `customer_search`, `customer_get_full_profile`, `customer_list_orders`, `customer_list_subscriptions`, `customer_list_payments`.

**Files:**
- Create: `mcp/src/tools/customers.ts`
- Create: `mcp/tests/tools/customers.test.ts`
- Modify: `mcp/src/index.ts` (register new tools)

- [ ] **Step 1: Write failing tests**

Create `mcp/tests/tools/customers.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { SpiffyClient } from "../../src/client.js";
import { searchCustomers, getFullCustomerProfile } from "../../src/tools/customers.js";

describe("searchCustomers", () => {
  it("calls GET /v2/customers/ with search param", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 1, email: "jane@x.com" }], pagination: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );
    const result = await searchCustomers(client, { query: "jane", limit: 25 });
    expect((result as { data: unknown[] }).data).toHaveLength(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("search=jane");
    expect(url).toContain("per_page=25");
  });
});

describe("getFullCustomerProfile", () => {
  it("calls GET /v2/customers/{id} with include=cards,stats,fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1, email: "x@y.com" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );
    await getFullCustomerProfile(client, { id: 1 });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/v2/customers/1");
    expect(url).toContain("include=cards%2Cstats%2Cfields");
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/tools/customers.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mcp/src/tools/customers.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";

export async function searchCustomers(
  client: SpiffyClient,
  args: { query: string; limit?: number }
): Promise<unknown> {
  return client.get("/v2/customers/", {
    search: args.query,
    per_page: args.limit ?? 25,
  });
}

export async function getFullCustomerProfile(
  client: SpiffyClient,
  args: { id: number }
): Promise<unknown> {
  return client.get(`/v2/customers/${args.id}`, { include: "cards,stats,fields" });
}

export async function listCustomerOrders(
  client: SpiffyClient,
  args: { customer_id: number; page?: number; per_page?: number }
): Promise<unknown> {
  return client.get("/v2/orders/", {
    "filter[customer_id]": args.customer_id,
    page: args.page ?? 1,
    per_page: args.per_page ?? 25,
  });
}

export async function listCustomerSubscriptions(
  client: SpiffyClient,
  args: { customer_id: number; page?: number; per_page?: number }
): Promise<unknown> {
  return client.get("/v2/subscriptions/", {
    "filter[customer_id]": args.customer_id,
    page: args.page ?? 1,
    per_page: args.per_page ?? 25,
  });
}

export async function listCustomerPayments(
  client: SpiffyClient,
  args: { customer_id: number; page?: number; per_page?: number }
): Promise<unknown> {
  return client.get("/v2/payments/", {
    "filter[customer_id]": args.customer_id,
    page: args.page ?? 1,
    per_page: args.per_page ?? 25,
  });
}

export function registerCustomerTools(server: McpServer, client: SpiffyClient): void {
  server.tool(
    "customer_search",
    "Search customers by email, name, or partial match. Returns up to 25 matches.",
    {
      query: z.string().describe("Search term — email, name, or ID fragment"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results, default 25"),
    },
    async (args) => jsonResult(await searchCustomers(client, args))
  );

  server.tool(
    "customer_get_full_profile",
    "Get a customer with cards, stats, and custom fields included. Use for 'tell me about X' inquiries.",
    {
      id: z.number().int().describe("Customer ID (integer)"),
    },
    async (args) => jsonResult(await getFullCustomerProfile(client, args))
  );

  server.tool(
    "customer_list_orders",
    "List orders placed by a given customer (paginated).",
    {
      customer_id: z.number().int(),
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
    },
    async (args) => jsonResult(await listCustomerOrders(client, args))
  );

  server.tool(
    "customer_list_subscriptions",
    "List subscriptions belonging to a given customer (paginated).",
    {
      customer_id: z.number().int(),
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
    },
    async (args) => jsonResult(await listCustomerSubscriptions(client, args))
  );

  server.tool(
    "customer_list_payments",
    "List payments belonging to a given customer (paginated).",
    {
      customer_id: z.number().int(),
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
    },
    async (args) => jsonResult(await listCustomerPayments(client, args))
  );
}
```

- [ ] **Step 4: Register customer tools in `index.ts`**

Add import and call in `mcp/src/index.ts`:

```typescript
import { registerCustomerTools } from "./tools/customers.js";
```

And after `registerMetaTools(server, client);`:

```typescript
  registerCustomerTools(server, client);
```

- [ ] **Step 5: Run tests to verify pass**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/tools/customers.test.ts && npm run build
```

Expected: 2 tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/tools/customers.ts mcp/src/index.ts mcp/tests/tools/customers.test.ts && git commit -m "Task 10: add 5 customer read tools"
```

---

## Task 11: Order tools (2 read tools)

**Goal:** Register `order_get` and `orders_list`.

**Files:**
- Create: `mcp/src/tools/orders.ts`
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Implement `mcp/src/tools/orders.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";

export function registerOrderTools(server: McpServer, client: SpiffyClient): void {
  server.tool(
    "order_get",
    "Get a single order by ID, including line items.",
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/orders/${args.id}`)),
  );

  server.tool(
    "orders_list",
    "List orders with optional filters. Dates as ISO-8601.",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      search: z.string().optional(),
      "filter.customer_id": z.number().int().optional().describe("Filter by customer ID"),
      "filter.created_at.gte": z.string().optional().describe("Created on or after (ISO-8601)"),
      "filter.created_at.lte": z.string().optional().describe("Created on or before (ISO-8601)"),
      "filter.currency": z.string().optional(),
    },
    async (args) => {
      const params: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(args)) {
        if (v === undefined) continue;
        const key = k.startsWith("filter.") ? `filter[${k.slice(7)}]` : k;
        params[key] = v as string | number | boolean;
      }
      return jsonResult(await client.get("/v2/orders/", params));
    },
  );
}
```

- [ ] **Step 2: Register in `index.ts`**

Add:
```typescript
import { registerOrderTools } from "./tools/orders.js";
```

And after customer tools:
```typescript
  registerOrderTools(server, client);
```

- [ ] **Step 3: Build and typecheck**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm run typecheck && npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/tools/orders.ts mcp/src/index.ts && git commit -m "Task 11: add 2 order read tools"
```

---

## Task 12: Subscription tools (3 read tools)

**Goal:** Register `subscription_get`, `subscriptions_list`, `subscription_billing_schedule`.

**Files:**
- Create: `mcp/src/tools/subscriptions.ts`
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Implement `mcp/src/tools/subscriptions.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";

export function registerSubscriptionTools(server: McpServer, client: SpiffyClient): void {
  server.tool(
    "subscription_get",
    "Get a single subscription by ID (status, current period, next renewal).",
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/subscriptions/${args.id}`)),
  );

  server.tool(
    "subscriptions_list",
    "List subscriptions with optional filters. Useful for churn reports and status dashboards.",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      search: z.string().optional(),
      "filter.customer_id": z.number().int().optional(),
      "filter.status": z.string().optional().describe("e.g. active, canceled, past_due"),
      "filter.created_at.gte": z.string().optional(),
      "filter.created_at.lte": z.string().optional(),
    },
    async (args) => {
      const params: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(args)) {
        if (v === undefined) continue;
        const key = k.startsWith("filter.") ? `filter[${k.slice(7)}]` : k;
        params[key] = v as string | number | boolean;
      }
      return jsonResult(await client.get("/v2/subscriptions/", params));
    },
  );

  server.tool(
    "subscription_billing_schedule",
    "Get a subscription's upcoming billing date and recent billing history.",
    { id: z.number().int() },
    async (args) => {
      // Spiffy returns next_billing_date on the subscription itself.
      // This tool is a focused projection of that data for the LLM.
      const sub = await client.get<Record<string, unknown>>(`/v2/subscriptions/${args.id}`);
      const projection = {
        id: sub.id,
        status: sub.status,
        next_billing_date: sub.next_billing_date,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        price: sub.price,
      };
      return jsonResult(projection);
    },
  );
}
```

- [ ] **Step 2: Register in `index.ts`**

```typescript
import { registerSubscriptionTools } from "./tools/subscriptions.js";
```

```typescript
  registerSubscriptionTools(server, client);
```

- [ ] **Step 3: Build and typecheck**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm run typecheck && npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/tools/subscriptions.ts mcp/src/index.ts && git commit -m "Task 12: add 3 subscription read tools"
```

---

## Task 13: Payment tools (4 read tools)

**Goal:** Register `payment_get`, `payments_list`, `payment_plan_get`, `payment_plans_list`.

**Files:**
- Create: `mcp/src/tools/payments.ts`
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Implement `mcp/src/tools/payments.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";

export function registerPaymentTools(server: McpServer, client: SpiffyClient): void {
  server.tool(
    "payment_get",
    "Get a single payment by ID.",
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/payments/${args.id}`)),
  );

  server.tool(
    "payments_list",
    "List payments. Filter by status ('successful', 'failed', 'refunded', etc.) for failed-payment dashboards.",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      "filter.customer_id": z.number().int().optional(),
      "filter.status": z.string().optional(),
      "filter.created_at.gte": z.string().optional(),
      "filter.created_at.lte": z.string().optional(),
    },
    async (args) => {
      const params: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(args)) {
        if (v === undefined) continue;
        const key = k.startsWith("filter.") ? `filter[${k.slice(7)}]` : k;
        params[key] = v as string | number | boolean;
      }
      return jsonResult(await client.get("/v2/payments/", params));
    },
  );

  server.tool(
    "payment_plan_get",
    "Get a single payment plan (for installment purchases).",
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/paymentplans/${args.id}`)),
  );

  server.tool(
    "payment_plans_list",
    "List payment plans. Useful for arrears reports ('who's behind on installments').",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      "filter.customer_id": z.number().int().optional(),
      "filter.status": z.string().optional(),
    },
    async (args) => {
      const params: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(args)) {
        if (v === undefined) continue;
        const key = k.startsWith("filter.") ? `filter[${k.slice(7)}]` : k;
        params[key] = v as string | number | boolean;
      }
      return jsonResult(await client.get("/v2/paymentplans/", params));
    },
  );
}
```

- [ ] **Step 2: Register in `index.ts`**

```typescript
import { registerPaymentTools } from "./tools/payments.js";
```

```typescript
  registerPaymentTools(server, client);
```

- [ ] **Step 3: Build and typecheck**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm run typecheck && npm run build
```

- [ ] **Step 4: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/tools/payments.ts mcp/src/index.ts && git commit -m "Task 13: add 4 payment read tools"
```

---

## Task 14: Product tools (2 read tools)

**Goal:** Register `product_get` and `products_list`.

**Files:**
- Create: `mcp/src/tools/products.ts`
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Implement `mcp/src/tools/products.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";

export function registerProductTools(server: McpServer, client: SpiffyClient): void {
  server.tool(
    "product_get",
    "Get a single product (course, bundle) by ID.",
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/products/${args.id}`)),
  );

  server.tool(
    "products_list",
    "List all products in the Spiffy account.",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      search: z.string().optional(),
    },
    async (args) => {
      const params: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(args)) {
        if (v !== undefined) params[k] = v as string | number | boolean;
      }
      return jsonResult(await client.get("/v2/products/", params));
    },
  );
}
```

- [ ] **Step 2: Register in `index.ts`**

```typescript
import { registerProductTools } from "./tools/products.js";
```

```typescript
  registerProductTools(server, client);
```

- [ ] **Step 3: Build and typecheck**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm run typecheck && npm run build
```

- [ ] **Step 4: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/tools/products.ts mcp/src/index.ts && git commit -m "Task 14: add 2 product read tools"
```

---

## Task 15: Promo read tools

**Goal:** Register `promo_list` and `promo_get`. (The write tool `promo_create` is in Task 18.)

**Files:**
- Create: `mcp/src/tools/promos.ts`
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Implement `mcp/src/tools/promos.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";

export function registerPromoReadTools(server: McpServer, client: SpiffyClient): void {
  server.tool(
    "promo_list",
    "List all promos (code, discount, uses, expiry, is_expired).",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      search: z.string().optional(),
    },
    async (args) => {
      const params: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(args)) {
        if (v !== undefined) params[k] = v as string | number | boolean;
      }
      return jsonResult(await client.get("/v2/promos/", params));
    },
  );

  server.tool(
    "promo_get",
    "Get a single promo by ID. Includes ordered_count and is_expired.",
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/promos/${args.id}`)),
  );
}
```

- [ ] **Step 2: Register in `index.ts`**

```typescript
import { registerPromoReadTools } from "./tools/promos.js";
```

```typescript
  registerPromoReadTools(server, client);
```

- [ ] **Step 3: Build and typecheck**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm run typecheck && npm run build
```

- [ ] **Step 4: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/tools/promos.ts mcp/src/index.ts && git commit -m "Task 15: add promo read tools"
```

---

## Task 16: Affiliate tools (3 read tools)

**Goal:** Register `affiliate_get`, `affiliates_list`, `affiliate_program_get`.

**Files:**
- Create: `mcp/src/tools/affiliates.ts`
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Implement `mcp/src/tools/affiliates.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";

export function registerAffiliateTools(server: McpServer, client: SpiffyClient): void {
  server.tool(
    "affiliate_get",
    "Get a single affiliate by ID.",
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/affiliates/${args.id}`)),
  );

  server.tool(
    "affiliates_list",
    "List all affiliates.",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      search: z.string().optional(),
    },
    async (args) => {
      const params: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(args)) {
        if (v !== undefined) params[k] = v as string | number | boolean;
      }
      return jsonResult(await client.get("/v2/affiliates/", params));
    },
  );

  server.tool(
    "affiliate_program_get",
    "Get a single affiliate program by ID (contains checkouts, prices, options, links).",
    { program_id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/affiliates/programs/${args.program_id}`)),
  );
}
```

- [ ] **Step 2: Register in `index.ts`**

```typescript
import { registerAffiliateTools } from "./tools/affiliates.js";
```

```typescript
  registerAffiliateTools(server, client);
```

- [ ] **Step 3: Build and typecheck**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm run typecheck && npm run build
```

- [ ] **Step 4: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/tools/affiliates.ts mcp/src/index.ts && git commit -m "Task 16: add 3 affiliate read tools"
```

---

## Task 17: Write tool — `customer_add_note` with bypass prevention

**Goal:** Register `customer_add_note` write tool. Requires `confirmed_by_user: true` and a non-empty `confirmation_summary`. Logs to audit.

**Files:**
- Create: `mcp/src/tools/writes.ts`
- Create: `mcp/tests/tools/writes.test.ts`
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `mcp/tests/tools/writes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpiffyClient } from "../../src/client.js";
import { addCustomerNote } from "../../src/tools/writes.js";
import * as audit from "../../src/audit.js";

describe("addCustomerNote", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(audit, "writeAuditEntry").mockImplementation(() => {});
  });

  it("requires confirmed_by_user === true", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );
    await expect(
      addCustomerNote(client, {
        customer_id: 1,
        notes: "test",
        confirmed_by_user: false as unknown as true,
        confirmation_summary: "summary",
      })
    ).rejects.toThrow(/confirmed_by_user must be true/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("requires non-empty confirmation_summary", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );
    await expect(
      addCustomerNote(client, {
        customer_id: 1,
        notes: "test",
        confirmed_by_user: true,
        confirmation_summary: "",
      })
    ).rejects.toThrow(/confirmation_summary/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("posts the note and writes an audit entry when confirmation is valid", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 42 }), {
        status: 201,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );
    const auditSpy = vi.spyOn(audit, "writeAuditEntry");
    const result = await addCustomerNote(client, {
      customer_id: 1,
      notes: "Called about refund",
      confirmed_by_user: true,
      confirmation_summary: "Add note to cus 1: Called about refund",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/customers/1/notes");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ notes: "Called about refund" }));
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 42 });
  });
});
```

- [ ] **Step 2: Run test — should fail**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/tools/writes.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mcp/src/tools/writes.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";
import { currentOperator, writeAuditEntry } from "../audit.js";

const WRITE_WARNING =
  "⚠️ DESTRUCTIVE: This tool writes to Spiffy. Do not call it directly. " +
  "Use the corresponding /spiffy-* slash command, which presents a confirmation summary " +
  "to the user before invoking this tool. Direct invocation without human confirmation is a safety violation.";

function requireConfirmation(confirmed: boolean, summary: string): void {
  if (confirmed !== true) {
    throw new Error(
      "confirmed_by_user must be true. This tool can only be called from the /spiffy-* slash command " +
        "after showing the user a confirmation summary and receiving explicit approval."
    );
  }
  if (!summary || summary.trim().length === 0) {
    throw new Error(
      "confirmation_summary must be a non-empty human-readable description of what the user approved."
    );
  }
}

export interface AddCustomerNoteArgs {
  customer_id: number;
  notes: string;
  confirmed_by_user: true;
  confirmation_summary: string;
}

export async function addCustomerNote(
  client: SpiffyClient,
  args: AddCustomerNoteArgs
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  const response = (await client.post<{ id: number }>(
    `/v2/customers/${args.customer_id}/notes`,
    { notes: args.notes }
  ));
  writeAuditEntry({
    timestamp: new Date(),
    operator: currentOperator(),
    operation: "note.add",
    summary: args.confirmation_summary,
    responseId: String(response.id ?? "unknown"),
  });
  return response;
}

export function registerWriteTools(server: McpServer, client: SpiffyClient): void {
  server.tool(
    "customer_add_note",
    WRITE_WARNING + " — Adds a note to a customer record.",
    {
      customer_id: z.number().int().describe("Customer ID"),
      notes: z.string().min(1).describe("Note text (min 1 char)"),
      confirmed_by_user: z
        .literal(true)
        .describe(
          "MUST be literally true. The slash command sets this AFTER user explicitly confirms."
        ),
      confirmation_summary: z
        .string()
        .min(1)
        .describe(
          "Non-empty human-readable summary the user saw and approved (e.g. 'Add note to Jane Smith: \"Called about refund\"')."
        ),
    },
    async (args) => jsonResult(await addCustomerNote(client, args as AddCustomerNoteArgs))
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/tools/writes.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Register in `index.ts`**

```typescript
import { registerWriteTools } from "./tools/writes.js";
```

```typescript
  registerWriteTools(server, client);
```

- [ ] **Step 6: Build**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm run build
```

- [ ] **Step 7: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/tools/writes.ts mcp/src/index.ts mcp/tests/tools/writes.test.ts && git commit -m "Task 17: add customer_add_note write tool with confirmation gate"
```

---

## Task 18: Write tool — `promo_create` with bypass prevention

**Goal:** Add `promo_create` write tool to the existing `writes.ts`. Same confirmation-gate pattern.

**Files:**
- Modify: `mcp/src/tools/writes.ts`
- Modify: `mcp/tests/tools/writes.test.ts`

- [ ] **Step 1: Add failing test**

Append to `mcp/tests/tools/writes.test.ts`:

```typescript
import { createPromo } from "../../src/tools/writes.js";

describe("createPromo", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(audit, "writeAuditEntry").mockImplementation(() => {});
  });

  it("rejects missing confirmation", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );
    await expect(
      createPromo(client, {
        code: "TEST-ABC",
        onetime_discount_type: "percent",
        onetime_discount_offset: 20,
        order_limit: 1,
        expire_at: "2026-05-01",
        confirmed_by_user: false as unknown as true,
        confirmation_summary: "x",
      })
    ).rejects.toThrow(/confirmed_by_user/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("posts the promo and writes an audit entry when confirmation is valid", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 99, code: "TEST-ABC" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new SpiffyClient(
      { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false },
      mockFetch
    );
    const auditSpy = vi.spyOn(audit, "writeAuditEntry");
    const result = await createPromo(client, {
      code: "TEST-ABC",
      onetime_discount_type: "percent",
      onetime_discount_offset: 20,
      order_limit: 1,
      expire_at: "2026-05-01",
      confirmed_by_user: true,
      confirmation_summary: "Create TEST-ABC 20% off single-use",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/promos/");
    expect(init.method).toBe("POST");
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 99, code: "TEST-ABC" });
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/tools/writes.test.ts
```

Expected: FAIL — `createPromo` not exported.

- [ ] **Step 3: Add `createPromo` to `mcp/src/tools/writes.ts`**

Append to `mcp/src/tools/writes.ts`:

```typescript
export interface CreatePromoArgs {
  code: string;
  onetime_discount_type?: "percent" | "amount";
  onetime_discount_offset?: number;
  subscription_discount_type?: "percent" | "amount";
  subscription_discount_offset?: number;
  subscription_duration_in_months?: number;
  expire_at?: string;
  order_limit?: number;
  per_customer_limit?: number;
  confirmed_by_user: true;
  confirmation_summary: string;
}

export async function createPromo(
  client: SpiffyClient,
  args: CreatePromoArgs
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  const {
    confirmed_by_user: _c,
    confirmation_summary: _s,
    ...body
  } = args;
  const response = (await client.post<{ id: number; code: string }>(
    "/v2/promos/",
    body
  ));
  writeAuditEntry({
    timestamp: new Date(),
    operator: currentOperator(),
    operation: "promo.create",
    summary: args.confirmation_summary,
    responseId: String(response.id ?? "unknown"),
  });
  return response;
}
```

And in the same file, extend `registerWriteTools` with a second `server.tool(...)` call:

```typescript
  server.tool(
    "promo_create",
    WRITE_WARNING +
      " — Creates a promo code. Only the bare promo is created; linking to checkouts and scoping to products must be done in the Spiffy dashboard after creation (see /spiffy-promo command for the full workflow).",
    {
      code: z.string().min(1).describe("Promo code (will be uppercased by Spiffy)"),
      onetime_discount_type: z.enum(["percent", "amount"]).optional(),
      onetime_discount_offset: z.number().optional(),
      subscription_discount_type: z.enum(["percent", "amount"]).optional(),
      subscription_discount_offset: z.number().optional(),
      subscription_duration_in_months: z.number().optional().describe("0 = forever"),
      expire_at: z.string().optional().describe("ISO-8601 expiry"),
      order_limit: z.number().optional().describe("Max total orders (0 = unlimited). For single-use, set to 1."),
      per_customer_limit: z.number().optional(),
      confirmed_by_user: z.literal(true),
      confirmation_summary: z.string().min(1),
    },
    async (args) => jsonResult(await createPromo(client, args as CreatePromoArgs))
  );
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test -- tests/tools/writes.test.ts
```

Expected: PASS (5 tests total).

- [ ] **Step 5: Build**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm run build
```

- [ ] **Step 6: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add mcp/src/tools/writes.ts mcp/tests/tools/writes.test.ts && git commit -m "Task 18: add promo_create write tool with confirmation gate"
```

---

## Task 19: Plugin manifest and MCP registration

**Goal:** Create the plugin-level files so Claude Code can load the plugin: `plugin.json`, `.mcp.json`, `.env.example`.

**Files:**
- Create: `plugin.json`
- Create: `.mcp.json`
- Create: `.env.example`

- [ ] **Step 1: Create `plugin.json`**

```json
{
  "name": "spiffy",
  "version": "0.1.0",
  "description": "Talk to the Spiffy platform from Claude Code — customer lookup, reports, notes, one-off promo codes."
}
```

- [ ] **Step 2: Create `.mcp.json`**

```json
{
  "mcpServers": {
    "spiffy": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/dist/index.js"],
      "env": {
        "SPIFFY_API_KEY": "${SPIFFY_API_KEY}"
      }
    }
  }
}
```

- [ ] **Step 3: Create `.env.example`**

```bash
# Spiffy API key. Three ways to configure:
#
# 1. Paste your key directly:
# SPIFFY_API_KEY=sk_live_your_key_here
#
# 2. Reference 1Password (requires `op` CLI installed + signed in):
# SPIFFY_API_KEY=op://YourVault/Spiffy API/credential
#
# 3. Skip this file and use ~/.config/spiffy-plugin/config.toml instead:
#    api_key = "sk_live_your_key_here"
#
# Optional:
# SPIFFY_BASE_URL=https://api.spiffy.co
# SPIFFY_DRY_RUN=0   # Set to 1 to block all writes (for testing)
```

- [ ] **Step 4: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add plugin.json .mcp.json .env.example && git commit -m "Task 19: add plugin manifest, MCP registration, and env.example"
```

---

## Task 20: `/spiffy-note` slash command

**Goal:** Create the `commands/spiffy-note.md` slash command. The command is a markdown prompt telling Claude how to orchestrate the note-addition flow with confirmation.

**Files:**
- Create: `commands/spiffy-note.md`

- [ ] **Step 1: Write `commands/spiffy-note.md`**

```markdown
---
description: Add a note to a Spiffy customer (or order/subscription/payment-plan) after showing a confirmation summary.
argument-hint: <customer-email-or-id> [note text]
---

You are executing the /spiffy-note slash command. Your job is to add a note to a Spiffy record on the user's behalf, with explicit confirmation before any write.

## Arguments

The user invoked: `/spiffy-note $ARGUMENTS`

Parse `$ARGUMENTS` as follows:
- First token: the target. Either a customer email (contains `@`), a numeric customer ID, or a prefixed ID like `ord_…`, `sub_…`, `plan_…`.
- Remaining tokens: the note text. If the remainder is empty, ask the user what text to add.

## Workflow (execute in order)

1. **Resolve the target.**
   - If the first token contains `@` or is non-numeric and not prefixed: treat as a customer search query. Call `customer_search` with `query` set to that token. If exactly one result, use it. If multiple, show the user the matches and ask which to use (by row number). If none, tell the user and stop.
   - If it's a plain integer: treat as a customer ID. Call `customer_get_full_profile` to confirm it exists and get the customer's name.
   - If prefixed (`ord_`, `sub_`, `plan_`): treat as the corresponding resource. Retrieve it via `order_get`, `subscription_get`, or `payment_plan_get` to confirm it exists. **Note: the v2 API currently only supports notes on customers via the `customer_add_note` MCP tool. For orders, subscriptions, and payment plans, tell the user that MVP only supports customer notes and direct them to add the note in the Spiffy dashboard.**

2. **Obtain the note text.** If not provided in arguments, ask: "What note would you like to add?"

3. **Show the confirmation summary and WAIT for explicit user approval.** Do NOT proceed without a clear "yes", "y", "confirm", or "proceed" from the user. Format:

   > **About to add note to [Customer Name] &lt;[email]&gt; (ID: [id]):**
   >
   > _"[full note text]"_
   >
   > Proceed? (y/n)

4. **On confirmation, call `customer_add_note`** with:
   - `customer_id`: the resolved customer ID
   - `notes`: the note text
   - `confirmed_by_user`: `true`
   - `confirmation_summary`: a human-readable one-line summary matching what the user saw, e.g. `"Add note to Jane Smith <jane@idd.com> (cus 123): 'Called about refund'"`

5. **Report success.** Show:

   > ✅ Note added (ID: [note_id]).

6. **On confirmation = no:** Tell the user "Cancelled — no note added." and stop. Do not call the write tool.

## Safety rules (never break these)

- Do NOT call `customer_add_note` without displaying the confirmation summary first and receiving explicit yes/y/confirm.
- Do NOT call `customer_add_note` with `confirmed_by_user: false` — the tool will refuse.
- Do NOT fabricate a `confirmation_summary` — always derive it from what you actually showed the user.
- If the user's reply is ambiguous ("maybe", "I guess"), ask for explicit confirmation again.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add commands/spiffy-note.md && git commit -m "Task 20: add /spiffy-note slash command"
```

---

## Task 21: `/spiffy-promo` slash command

**Goal:** Create the `commands/spiffy-promo.md` slash command implementing the full MVP promo flow (step 1 automated, 2–3 handed off to dashboard).

**Files:**
- Create: `commands/spiffy-promo.md`

- [ ] **Step 1: Write `commands/spiffy-promo.md`**

```markdown
---
description: Create a one-off promo code for a specific customer with confirmation, audit, and dashboard-handoff instructions.
argument-hint: <customer> [--percent N | --amount N] [--expires 7d|YYYY-MM-DD] [--uses N] [--code CODE] [--checkout-url URL] [--applies-to one-time|subscription|both] [--dry-run]
---

You are executing the /spiffy-promo slash command. Your job is to (1) create a bare promo code via the Spiffy API, (2) give the user clear dashboard-finish instructions, and (3) draft a ready-to-send customer message — all with explicit confirmation before any write.

## Arguments

The user invoked: `/spiffy-promo $ARGUMENTS`

Parse flags from `$ARGUMENTS`:
- First non-flag token: customer reference (email, numeric ID, or name).
- `--percent N` or `--amount N` (mutually exclusive; exactly one required).
- `--expires <duration-or-date>`: e.g. `7d`, `2026-05-15`, `end-of-month`. Default `7d`.
- `--uses N`: max total orders. Default `1` (single-use).
- `--per-customer N`: per-customer cap. Default `0` (no cap).
- `--code CODE`: override auto-generated code. Otherwise generate `{FIRST-NAME}-{MMM-YY}-{4-random-alphanumerics}`.
- `--checkout-url URL`: optional base checkout URL (e.g. `https://checkout.spiffy.co/advanced-endo`). If provided, the draft customer message uses it.
- `--applies-to one-time|subscription|both`: default `one-time`.
- `--dry-run`: if present, show what would be created but don't call the API.

If any required field is missing (customer or discount), ask the user for it before continuing.

## Workflow

1. **Resolve the customer.** Call `customer_search` with the reference. If multiple matches, ask which. If none, stop with an explanation.

2. **Build the code.**
   - If `--code` provided, use it as-is (uppercased).
   - Otherwise, take the customer's first name (or first word of their name), uppercase, add `-{MMM-YY}` (e.g. `-MAY26` for May 2026), and a 4-character random alphanumeric suffix. Example: `JANE-MAY26-A7KQ`.
   - Before using the code, call `promo_list` and check whether the code already exists. If it does, regenerate (up to 5 attempts). If still colliding, ask the user for a custom code.

3. **Compute `expire_at`.** Convert `--expires` to an ISO-8601 date:
   - `Nd` → today + N days.
   - `end-of-month` → last day of current month.
   - `YYYY-MM-DD` → as given.

4. **Build the promo request body** per `POST /v2/promos`:
   - `code`: the computed code.
   - If `--applies-to one-time` or `both`: set `onetime_discount_type` to `percent` or `amount` per flag, and `onetime_discount_offset` to the value.
   - If `--applies-to subscription` or `both`: set `subscription_discount_type` and `subscription_discount_offset` similarly.
   - `order_limit`: from `--uses` (default 1).
   - `per_customer_limit`: from `--per-customer` (default 0).
   - `expire_at`: computed.

5. **Show the confirmation summary and wait for explicit approval.** Format:

   > **About to create promo `[CODE]`:**
   > - [20% | $50] off [one-time purchases | subscriptions | both]
   > - Max [N] total orders[, per-customer limit [M]]
   > - Expires [YYYY-MM-DD] ([N days])
   > - For customer **[Name]** &lt;[email]&gt; (ID: [id])
   >
   > **After creation, you'll need to open the Spiffy dashboard (~1 min) to:**
   > 1. Open the promo: https://app.spiffy.co/promos/[ID-after-creation]
   > 2. Add the promo to the checkout containing the customer's course
   > 3. Select which product(s) or option(s) the promo applies to
   > 4. Save
   >
   > Proceed with creation? (y/n)

6. **On confirmation:**
   - If `--dry-run`: print the full request body JSON and the intended dashboard URL; stop. Do not call the API.
   - Otherwise: call `promo_create` with:
     - All the request-body fields above
     - `confirmed_by_user: true`
     - `confirmation_summary`: a one-line recap e.g. `"Create JANE-MAY26-A7KQ 20% off one-time, single-use, expires 2026-05-01, for Jane Smith <jane@idd.com> (cus 123)"`.

7. **On success, output two parts:**

   **Part A — Dashboard finish steps:**

   > ✅ Created promo `[CODE]` (ID: [id]).
   >
   > **Finish setup in the dashboard (~1 min):**
   > 1. Open https://app.spiffy.co/promos/[id]
   > 2. Add this promo to the checkout containing the customer's desired course
   > 3. Select which product(s) or option(s) the promo applies to
   > 4. Save

   **Part B — Draft customer message (send AFTER the dashboard steps):**

   If `--checkout-url` was provided:
   > Hi [First name] — here's your [N]% off discount: [checkout-url]?c=[CODE]
   > [Single-use | Unlimited uses], expires [Month Day].

   If not:
   > Hi [First name] — here's your [N]% off discount: [YOUR-CHECKOUT-URL]?c=[CODE]
   > (Replace [YOUR-CHECKOUT-URL] with the checkout URL from step 1 of the dashboard steps.)
   > [Single-use | Unlimited uses], expires [Month Day].

8. **On confirmation = no:** Tell the user "Cancelled — no promo created." and stop.

## Safety rules (never break these)

- Never call `promo_create` without showing the full confirmation summary first.
- Never call `promo_create` with `confirmed_by_user: false`.
- Never fabricate a confirmation_summary — derive it from what the user saw.
- If the user asks for a variation mid-flow ("make it 30% instead"), re-run the confirmation step from scratch with the new values.
- Never tell the user the promo is "ready to send" — always frame it as "code created, finish in dashboard, then send message."
```

- [ ] **Step 2: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add commands/spiffy-promo.md && git commit -m "Task 21: add /spiffy-promo slash command"
```

---

## Task 22: Report skill — MRR snapshot

**Goal:** Create a skill that produces a canonical MRR snapshot report.

**Files:**
- Create: `skills/spiffy-mrr-snapshot/SKILL.md`

- [ ] **Step 1: Write `skills/spiffy-mrr-snapshot/SKILL.md`**

```markdown
---
name: spiffy-mrr-snapshot
description: Generate a canonical MRR (monthly recurring revenue) snapshot for a given period. Use when the user says "MRR", "monthly recurring revenue", "revenue snapshot", or asks for a subscription-revenue overview.
---

# Spiffy MRR Snapshot

Produce a markdown MRR report. Always use the canonical format below so multiple runs are comparable.

## Inputs (from the user or default)
- **Period**: default "this month" (current calendar month). Accept `this month`, `last month`, `2025-Q1`, `YYYY-MM`, or an explicit `YYYY-MM-DD..YYYY-MM-DD` range.

## Data sources (Spiffy MCP tools)
Use the following MCP tools — compose them to gather the data:

1. `subscriptions_list` with `filter.status=active`, paginate to get every active subscription.
2. For delta vs prior period: call again with `filter.created_at.lte` set to the start of the current period and `filter.status=active` to get "active at start of period".

## Calculation
- **MRR** = sum of normalized monthly price across all active subscriptions.
  - If a subscription's interval is `month` with price P: contributes P.
  - If `year` with price P: contributes P / 12.
  - If `week` with price P: contributes P × 4.345.
- **Active subscription count** = number of subs with status=`active`.
- **Delta vs prior period** = current MRR − prior MRR (absolute and percent).

## Output format (always use this, verbatim structure)

```markdown
# Spiffy MRR Snapshot — {period label}

**Generated {YYYY-MM-DD HH:MM UTC}** • Data from api.spiffy.co

## Summary

- **Current MRR:** ${X,XXX.XX}
- **Active subscriptions:** {N}
- **Delta vs prior period:** {+/-}${X.XX} ({+/-}X.X%)

## Breakdown by plan (if multiple plans)

| Plan | Subs | MRR contribution |
|---|---:|---:|
| Basic | 42 | $420.00 |
| Pro | 18 | $1,800.00 |

## Notes
- Figures normalized to monthly ({conversion rules applied}).
- {Any caveats — e.g. "3 subs had null price; excluded."}
```

Always include the "Generated ... Data from api.spiffy.co" footer.

## Failure modes
- If no active subscriptions exist, output the report with `$0.00` and "0 active subscriptions" rather than erroring.
- If pagination would require more than 10 pages of `subscriptions_list`, stop at 10 pages and add a note: "Truncated at 1,000 subscriptions — contact support if you have more."
```

- [ ] **Step 2: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add skills/spiffy-mrr-snapshot/SKILL.md && git commit -m "Task 22: add spiffy-mrr-snapshot report skill"
```

---

## Task 23: Report skill — Affiliate report

**Goal:** Canonical affiliate performance report.

**Files:**
- Create: `skills/spiffy-affiliate-report/SKILL.md`

- [ ] **Step 1: Write the skill**

```markdown
---
name: spiffy-affiliate-report
description: Rank affiliates by revenue, signups, and commissions for a given period. Use when the user says "affiliate report", "affiliate performance", "top affiliates", or asks "who's driving the most revenue".
---

# Spiffy Affiliate Performance Report

Produce a canonical ranked report of affiliate performance.

## Inputs
- **Period**: default last 30 days. Accept any standard range notation.
- **Top N**: default 10.

## Data sources
1. `affiliates_list` — paginate all affiliates.
2. `orders_list` with `filter.created_at.gte` and `filter.created_at.lte` for the period. Orders have an affiliate association; group by affiliate_id.
3. `affiliate_program_get` for commission rules (if needed to compute commission).

## Output format

```markdown
# Spiffy Affiliate Report — {period label}

**Generated {YYYY-MM-DD HH:MM UTC}** • Data from api.spiffy.co

## Summary
- **Total affiliate-driven revenue:** ${X,XXX.XX}
- **Total signups from affiliates:** {N}
- **Active affiliates (drove ≥1 order):** {N}

## Top {N} affiliates by revenue

| Rank | Affiliate | Signups | Revenue | Commission owed |
|---:|---|---:|---:|---:|
| 1 | {name} | {n} | ${X.XX} | ${X.XX} |

## Notes
- Commission computed using program `{program_name}` rules (`{rule_desc}`).
- {Any caveats}
```

## Failure modes
- If no affiliate-tagged orders in the period, produce the report with zero values and "No affiliate-driven orders in this period".
- Affiliates with no orders in the period are listed in a collapsed "Inactive in period" footer count.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add skills/spiffy-affiliate-report/SKILL.md && git commit -m "Task 23: add spiffy-affiliate-report skill"
```

---

## Task 24: Report skill — Churn report

**Goal:** Cancellations + failed renewals for a period.

**Files:**
- Create: `skills/spiffy-churn-report/SKILL.md`

- [ ] **Step 1: Write the skill**

```markdown
---
name: spiffy-churn-report
description: Report subscription churn for a given period — cancellations, failed renewals, retention rate. Use when the user says "churn", "cancellations", "failed renewals", or "retention".
---

# Spiffy Churn Report

Produce a canonical churn + retention report.

## Inputs
- **Period**: default last 30 days.

## Data sources
1. `subscriptions_list` with `filter.status=canceled` and `filter.canceled_at.gte/lte` for cancellations.
2. `payments_list` with `filter.status=failed` and `filter.created_at.gte/lte` for failed charges.
3. `subscriptions_list` with `filter.status=active` to compute retention denominator.

## Calculation
- **Cancelled in period**: count of subs with canceled_at in range.
- **Failed renewals**: count of failed payments that are subscription-related in range.
- **Retention rate** = (active at period start − cancellations in period) / active at period start.

## Output format

```markdown
# Spiffy Churn Report — {period label}

**Generated {YYYY-MM-DD HH:MM UTC}** • Data from api.spiffy.co

## Summary
- **Cancellations:** {N}
- **Failed renewals:** {N}
- **Retention rate:** {X.X}%
- **Active subscriptions (end of period):** {N}

## At-risk subscriptions (past-due)

| Customer | Subscription | Days past due | MRR at stake |
|---|---|---:|---:|
| {name} | {sub_id} | {d} | ${X.XX} |

## Cancellations in period

| Customer | Cancelled on | Plan | Reason (if provided) |
|---|---|---|---|
| {name} | {date} | {plan} | {reason or '—'} |

## Notes
- {Caveats e.g. "Cancellation reason not available via v2 API — shown as '—'."}
```

## Failure modes
- If zero cancellations and zero failed renewals, produce the report with zeros and "No churn detected in this period." in the Summary.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add skills/spiffy-churn-report/SKILL.md && git commit -m "Task 24: add spiffy-churn-report skill"
```

---

## Task 25: Report skill — Top products

**Goal:** Bestsellers by units and revenue.

**Files:**
- Create: `skills/spiffy-top-products-report/SKILL.md`

- [ ] **Step 1: Write the skill**

```markdown
---
name: spiffy-top-products-report
description: Rank products (courses) by units sold or revenue for a given period. Use when the user says "top products", "bestsellers", "product revenue", or "best-selling courses".
---

# Spiffy Top Products Report

Produce a canonical ranked bestsellers report.

## Inputs
- **Period**: default this month.
- **Metric**: `revenue` (default) or `units`.
- **Top N**: default 10.

## Data sources
1. `orders_list` with `filter.created_at.gte/lte` for the period (paginate).
2. For each order, inspect line items (product_id, quantity, price).
3. Aggregate by product_id.
4. `product_get` or `products_list` to resolve product names.

## Output format

```markdown
# Spiffy Top Products — {period label}

**Generated {YYYY-MM-DD HH:MM UTC}** • Data from api.spiffy.co

## Summary
- **Total orders:** {N}
- **Total revenue:** ${X,XXX.XX}
- **Distinct products sold:** {N}

## Top {N} by {metric}

| Rank | Product | Units | Revenue | Avg. order value |
|---:|---|---:|---:|---:|
| 1 | {name} | {u} | ${X.XX} | ${X.XX} |

## Notes
- {Caveats e.g. "2 orders had missing line items and were excluded."}
```

## Failure modes
- If no orders in period, produce zero-value report with "No orders in this period."
- If pagination would exceed 10 pages, truncate and note.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add skills/spiffy-top-products-report/SKILL.md && git commit -m "Task 25: add spiffy-top-products-report skill"
```

---

## Task 26: README — installation and usage

**Goal:** User-facing README covering install, configuration (three options), first-use verification, and troubleshooting. This file is the external face of the plugin for both IDD team members and future public users.

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Spiffy Claude Code Plugin

Talk to the [Spiffy](https://spiffy.co) platform from Claude Code. Look up customers, generate reports, add notes, and create one-off promo codes — all in natural language.

## What it does

- **Customer lookup** — "look up jane@example.com" returns her orders, subscriptions, payments, and notes.
- **Reports** — MRR snapshots, affiliate performance, churn, top products, all with canonical markdown output.
- **Add notes** — `/spiffy-note <customer> "<text>"` with confirmation gate.
- **Create promo codes** — `/spiffy-promo <customer> --percent 20 --expires 7d` creates the code and gives you a dashboard link + draft customer message.

## Requirements

- Claude Code installed and working
- Node.js ≥ 18
- A Spiffy API key (get one from Settings → API in your Spiffy dashboard)
- *(Optional)* 1Password CLI (`op`) if you want to store the key there instead of in an env file

## Install

1. **Clone the repo:**

   ```bash
   git clone https://github.com/institute-of-digital-dentistry/spiffy-plugin.git
   cd spiffy-plugin
   ```

2. **Build the MCP server:**

   ```bash
   cd mcp && npm install && npm run build && cd ..
   ```

3. **Add the plugin to Claude Code** (follow your Claude Code plugin install docs — typically `claude plugin install <path-to-this-repo>` or adding the repo to your plugin marketplace config).

## Configure your API key

Choose one of three methods:

### Option A: environment variable (simplest)

```bash
export SPIFFY_API_KEY=sk_live_your_key_here
```

Add it to your `~/.zshrc` or `~/.bashrc` to persist.

### Option B: 1Password reference (recommended for teams)

Store your key in 1Password, then:

```bash
export SPIFFY_API_KEY=op://YourVault/Spiffy\ API/credential
```

Requires the [1Password CLI](https://developer.1password.com/docs/cli/) installed and signed in (`op signin`).

### Option C: config.toml fallback

Create `~/.config/spiffy-plugin/config.toml`:

```toml
api_key = "sk_live_your_key_here"
```

This is read if `SPIFFY_API_KEY` is not set.

## Verify it works

Launch Claude Code and ask:

> "Use the Spiffy plugin to look up my account."

Claude should call the `account_get` tool and return your account name, plan, and quota.

## Usage examples

**Customer inquiry:**
> "Find jane@example.com in Spiffy and show me her subscription status and recent payments."

**Add a note:**
> `/spiffy-note jane@example.com She called today about a refund, approved for $99.`

**Generate a promo:**
> `/spiffy-promo jane@example.com --percent 25 --expires 7d --checkout-url https://checkout.spiffy.co/advanced-endo`

**Run a report:**
> "Run the MRR snapshot for this month."
> "Show me the top 5 courses by revenue in Q1 2026."

## Configuration reference

| Env var | Default | Purpose |
|---|---|---|
| `SPIFFY_API_KEY` | — | **Required.** Your Spiffy API key (literal or `op://` reference). |
| `SPIFFY_BASE_URL` | `https://api.spiffy.co` | Override for testing. |
| `SPIFFY_DRY_RUN` | unset | Set to `1` to block all writes and return synthetic responses (for testing). |

## Troubleshooting

**"SPIFFY_API_KEY is not set"** — see Configure section. Check that the env var is visible to Claude Code (re-launch it after setting).

**"API key invalid (401 Unauthorized)"** — regenerate your key in the Spiffy dashboard at Settings → API, then update your env var or 1Password entry.

**"Failed to resolve 1Password reference"** — install `op` CLI and sign in with `op signin`. Verify the reference is valid: `op read "op://Vault/Item/field"`.

**Promo was created but doesn't apply at checkout** — the v2 Spiffy API currently only creates the bare promo code. You still need to open the Spiffy dashboard to (1) add the promo to the correct checkout and (2) choose which products/options it applies to. The `/spiffy-promo` command includes a direct link to do this.

## Audit log

Every write operation (notes, promo creation) is logged to:

```
~/.local/share/spiffy-plugin/audit.log
```

One line per operation: timestamp, operator, action, response ID, and the confirmation summary the user approved. Rotate or archive periodically.

## License

MIT (subject to IDD confirmation before open-sourcing).

## Development

```bash
cd mcp
npm run test          # run unit tests
npm run test:watch    # watch mode
npm run typecheck     # TypeScript check only
npm run build         # compile to dist/
npm run dev           # run via tsx (no build needed)
```

## Contributing

Currently closed for external contributions while we validate internally at IDD. Once open-sourced, we'll accept issues and PRs via the GitHub repository.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/juliandickie/code/spiffy && git add README.md && git commit -m "Task 26: add README with install, config, usage, and troubleshooting"
```

---

## Task 27: End-to-end smoke verification

**Goal:** Confirm the full plugin installs and boots cleanly against a real Spiffy API key, with `account_get` returning sane output. This is a manual verification task — not code.

**Files:**
- Modify: (no files; verification only)

- [ ] **Step 1: Build the MCP server**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm run build
```

Expected: clean build.

- [ ] **Step 2: Run all tests**

```bash
cd /Users/juliandickie/code/spiffy/mcp && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Manual boot test with real key (Julian runs this)**

```bash
cd /Users/juliandickie/code/spiffy
export SPIFFY_API_KEY=sk_live_...   # Julian pastes his real key
node mcp/dist/index.js &
# Wait 2 seconds; server should print "Connected to Spiffy account: <IDD name>"
```

Expected: "[spiffy-mcp] Connected to Spiffy account: Institute of Digital Dentistry" (or similar).

Kill the background server after verification:

```bash
pkill -f "node mcp/dist/index.js"
```

- [ ] **Step 4: Install as a plugin in Claude Code and run a read query**

Follow Claude Code's plugin install process for this repo. Then in a Claude Code session, ask:

> "Use the Spiffy plugin to look up my account."

Expected: Claude calls `account_get` and returns your account name/plan.

- [ ] **Step 5: Dry-run a write**

```bash
export SPIFFY_DRY_RUN=1
```

In Claude Code:

> `/spiffy-note julian@instituteofdigitaldentistry.com "This is a test"`

Expected: Claude shows the confirmation summary. On confirm, the underlying `customer_add_note` call short-circuits via dry-run and returns `{dry_run: true, ...}`. No real note created.

- [ ] **Step 6: Commit the success marker**

```bash
cd /Users/juliandickie/code/spiffy && git commit --allow-empty -m "Task 27: end-to-end smoke verification passed"
```

---

## Summary of deliverables at plan completion

- `plugin.json` + `.mcp.json` — Claude Code plugin wiring
- `mcp/` — TypeScript MCP server with:
  - Config loader (env → 1P → config.toml)
  - HTTP client (auth, retry, rate-limit, dry-run)
  - Audit log
  - 22 read tools
  - 2 write tools with `confirmed_by_user` + `confirmation_summary` gating
- `commands/spiffy-note.md`, `commands/spiffy-promo.md` — slash commands
- `skills/spiffy-mrr-snapshot`, `skills/spiffy-affiliate-report`, `skills/spiffy-churn-report`, `skills/spiffy-top-products-report` — report skills
- `README.md` — install, config, usage, troubleshooting
- Unit tests covering config, client, errors, audit, customer tools, and write-tool confirmation enforcement

## Not in this plan (deferred to later)

- Refunds, subscription cancellations, payment-plan changes (other money-moving writes)
- Full 3-step promo automation (awaiting clarification of `/v2/promos/{id}/actions` and checkouts-under-programs behaviour — see spec §12)
- Customer creation / merging
- Webhook endpoint management tools
- Slack or web-frontend wrappers
- **Proactive rate-limit refusal** (spec §7: "refuse new requests for 5s if `X-RateLimit-Remaining` drops to zero"). Not worth it for ≤3 users — Task 5's reactive retry-on-429 with `X-RateLimit-Reset` respect already handles rate-limit events gracefully. Revisit if we ever deploy this server in an automated / multi-user context where runaway loops are a real concern.
- **CI dry-run pipeline** (spec §11: automated PR checks running writes in dry-run mode). Defer until repo is open-sourced and has GitHub Actions configured. For now, Task 27's manual smoke test covers the need.
- **Contract tests against a real Spiffy sandbox.** Deferred until we confirm sandbox availability (spec §12 Open Question #3 in revised spec, sandbox availability).
- **Snapshot tests for report skills.** Manual review of report output is sufficient for MVP; add fixture-based snapshot tests after the skills have been used in anger for ~30 days and we have a clear sense of what "correct" output looks like.
