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
    expect(e.name).toBe("SpiffyError");
  });

  it("works without details", () => {
    const e = new SpiffyError("not_found", 404, "Customer not found");
    expect(e.details).toBeUndefined();
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

  it("preserves details when provided", () => {
    const body = {
      error: {
        code: "validation_error",
        message: "Validation failed",
        details: { fieldErrors: { name: ["required"] } },
      },
    };
    const err = parseErrorResponse(422, body);
    expect(err.details).toEqual({ fieldErrors: { name: ["required"] } });
  });

  it("falls back to generic error when body shape is unexpected", () => {
    const err = parseErrorResponse(500, "plain text body" as unknown);
    expect(err.code).toBe("unknown_error");
    expect(err.status).toBe(500);
    expect(err.message).toMatch(/plain text body/);
  });

  it("truncates long non-structured bodies to 200 chars", () => {
    const longBody = "x".repeat(500);
    const err = parseErrorResponse(503, longBody);
    expect(err.message.length).toBeLessThan(250);
  });
});
