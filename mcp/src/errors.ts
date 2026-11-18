export class SpiffyError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
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
    // Only the message survives the MCP tool boundary, so carry details
    // (e.g. details.reason = PROMO_FOREIGN_TARGET) inside it.
    const full = details ? `${message} (details: ${JSON.stringify(details)})` : message;
    return new SpiffyError(code, status, full, details);
  }
  const snippet =
    typeof body === "string"
      ? body.slice(0, 200)
      : JSON.stringify(body).slice(0, 200);
  return new SpiffyError("unknown_error", status, `HTTP ${status}: ${snippet}`);
}
