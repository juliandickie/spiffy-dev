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
        `Underlying error: ${(err as Error).message}`,
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
  let raw = process.env.SPIFFY_API_KEY?.trim();

  if (!raw) {
    raw = loadFromTomlFallback()?.trim();
  }

  if (!raw) {
    throw new Error(
      "SPIFFY_API_KEY is not set. Configure it one of three ways:\n" +
        "  1. Set SPIFFY_API_KEY env var to your key (e.g., sk_live_...)\n" +
        "  2. Set SPIFFY_API_KEY to a 1Password reference (e.g., op://Vault/Item/credential)\n" +
        "  3. Create ~/.config/spiffy-plugin/config.toml with 'api_key = \"...\"'\n" +
        "See README for details.",
    );
  }

  const apiKey = raw.startsWith("op://") ? resolveOpReference(raw).trim() : raw;

  return {
    apiKey,
    baseUrl: process.env.SPIFFY_BASE_URL?.trim() || "https://api.spiffy.co",
    dryRun: process.env.SPIFFY_DRY_RUN === "1",
  };
}
