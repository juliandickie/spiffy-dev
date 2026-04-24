#!/usr/bin/env node
// Installs the repo's shared git hooks by pointing core.hooksPath at .githooks/.
// Runs automatically on `npm install` in mcp/ (via postinstall).
//
// Idempotent: safe to run multiple times. Silently skips when the repo's
// .git/ directory isn't reachable (e.g., npm install'd from a tarball outside
// a git checkout, or from a shallow CI environment).

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const gitDir = join(repoRoot, ".git");
const hooksDir = join(repoRoot, ".githooks");

if (!existsSync(gitDir)) {
  // Not a git checkout — nothing to do.
  process.exit(0);
}

if (!existsSync(hooksDir)) {
  // Repo structure surprise — fail loudly rather than silently misconfigure.
  console.error(
    `[install-hooks] Expected ${hooksDir} to exist. Skipping hook install.`,
  );
  process.exit(0);
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  console.log("[install-hooks] git core.hooksPath set to .githooks/");
} catch (err) {
  console.error(
    `[install-hooks] Failed to set core.hooksPath: ${err.message}. You can run it manually: cd ${repoRoot} && git config core.hooksPath .githooks`,
  );
  process.exit(0); // don't fail npm install
}
