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
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
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
