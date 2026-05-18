import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecFileSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>(
    "node:child_process",
  );
  return { ...actual, execFileSync: mockExecFileSync };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, readFileSync: mockReadFileSync };
});

import { loadConfig } from "../src/config.js";

// A realistic "file not found" error. Node's readFileSync sets err.code,
// which the loader uses to distinguish "no config file" (fall through)
// from "file present but unusable" (throw loud).
function enoent(): NodeJS.ErrnoException {
  return Object.assign(new Error("ENOENT: no such file or directory"), {
    code: "ENOENT",
  });
}

describe("loadConfig", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockReadFileSync.mockReset();
    delete process.env.SPIFFY_API_KEY;
    delete process.env.SPIFFY_DRY_RUN;
    delete process.env.SPIFFY_BASE_URL;
  });

  it("reads literal API key from SPIFFY_API_KEY env var", async () => {
    process.env.SPIFFY_API_KEY = "sk_literal_abc123";
    mockReadFileSync.mockImplementation(() => {
      throw enoent();
    });
    const config = await loadConfig();
    expect(config.apiKey).toBe("sk_literal_abc123");
    expect(config.baseUrl).toBe("https://api.spiffy.co");
    expect(config.dryRun).toBe(false);
  });

  it("resolves op:// reference via op CLI", async () => {
    process.env.SPIFFY_API_KEY = "op://Team/Spiffy/credential";
    mockExecFileSync.mockReturnValue(Buffer.from("sk_resolved_xyz789\n"));
    const config = await loadConfig();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "op",
      ["read", "op://Team/Spiffy/credential"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(config.apiKey).toBe("sk_resolved_xyz789");
  });

  it("reads api_key from ~/.config/spiffy-plugin/config.toml when env is unset", async () => {
    mockReadFileSync.mockImplementation((path: unknown) => {
      if (String(path).endsWith("spiffy-plugin/config.toml")) {
        return 'api_key = "sk_toml_fallback"\n';
      }
      throw enoent();
    });
    const config = await loadConfig();
    expect(config.apiKey).toBe("sk_toml_fallback");
  });

  it("falls through to the generic error when no config file and no env var exist", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw enoent();
    });
    await expect(loadConfig()).rejects.toThrow(/SPIFFY_API_KEY is not set/);
  });

  it("throws a specific error naming config.toml when it contains dotenv syntax", async () => {
    mockReadFileSync.mockImplementation((path: unknown) => {
      if (String(path).endsWith("spiffy-plugin/config.toml")) {
        return "SPIFFY_API_KEY=0000000000000000000000000000000000000000000000000000000000000000\n";
      }
      throw enoent();
    });
    const err = (await loadConfig().catch((e) => e)) as Error;
    expect(err.message).toMatch(/spiffy-plugin\/config\.toml/);
    expect(err.message).toMatch(/api_key = "/);
    expect(err.message).not.toMatch(/SPIFFY_API_KEY is not set/);
  });

  it("throws a specific error when config.toml is valid TOML but has no api_key", async () => {
    mockReadFileSync.mockImplementation((path: unknown) => {
      if (String(path).endsWith("spiffy-plugin/config.toml")) {
        return 'base_url = "https://api.spiffy.co"\n';
      }
      throw enoent();
    });
    const err = (await loadConfig().catch((e) => e)) as Error;
    expect(err.message).toMatch(/spiffy-plugin\/config\.toml/);
    expect(err.message).toMatch(/api_key/);
    expect(err.message).not.toMatch(/SPIFFY_API_KEY is not set/);
  });

  it("detects the dotenv mistake when config.toml has a SPIFFY_API_KEY key instead of api_key", async () => {
    mockReadFileSync.mockImplementation((path: unknown) => {
      if (String(path).endsWith("spiffy-plugin/config.toml")) {
        return 'SPIFFY_API_KEY = "deadbeefdeadbeefdeadbeefdeadbeef"\n';
      }
      throw enoent();
    });
    const err = (await loadConfig().catch((e) => e)) as Error;
    expect(err.message).toMatch(/spiffy-plugin\/config\.toml/);
    expect(err.message).toMatch(/api_key = "/);
    expect(err.message).not.toMatch(/SPIFFY_API_KEY is not set/);
  });

  it("respects SPIFFY_DRY_RUN=1", async () => {
    process.env.SPIFFY_API_KEY = "sk_live_x";
    process.env.SPIFFY_DRY_RUN = "1";
    mockReadFileSync.mockImplementation(() => {
      throw enoent();
    });
    const config = await loadConfig();
    expect(config.dryRun).toBe(true);
  });

  it("respects SPIFFY_BASE_URL override", async () => {
    process.env.SPIFFY_API_KEY = "sk_live_x";
    process.env.SPIFFY_BASE_URL = "https://api-staging.spiffy.co";
    mockReadFileSync.mockImplementation(() => {
      throw enoent();
    });
    const config = await loadConfig();
    expect(config.baseUrl).toBe("https://api-staging.spiffy.co");
  });
});
