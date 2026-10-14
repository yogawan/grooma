// @/lib/errors.ts
import mongoose from "mongoose";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "./logger";

export class AppError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export const Errors = {
  unauthenticated: (message = "Authentication required.") =>
    new AppError("UNAUTHENTICATED", message, 401),

  invalidCredentials: (message = "Invalid username or password.") =>
    new AppError("INVALID_CREDENTIALS", message, 401),

  accountInactive: (
    message = "This account has been deactivated. Contact your administrator.",
  ) => new AppError("ACCOUNT_INACTIVE", message, 403),

  forbidden: (
    message = "You do not have permission to access this resource.",
  ) => new AppError("FORBIDDEN", message, 403),

  validation: (message = "Invalid input.") =>
    new AppError("VALIDATION_ERROR", message, 400),

  notFound: (message = "Resource not found.") =>
    new AppError("NOT_FOUND", message, 404),

  conflict: (message = "Conflict or invalid state transition.") =>
    new AppError("CONFLICT", message, 409),

  businessRule: (message: string) =>
    new AppError("BUSINESS_RULE_VIOLATION", message, 422),

  // §23.4: a HOST whose subscription lapsed is refused everything except
  // /subscription* and /profile. 402 is called for explicitly there, in
  // addition to the §14 status table.
  paymentRequired: (
    message = "Your subscription is not active. Settle the outstanding invoice to restore access.",
  ) => new AppError("PAYMENT_REQUIRED", message, 402),

  rateLimited: (message = "Too many requests. Please try again later.") =>
    new AppError("RATE_LIMITED", message, 429),

  paymentGateway: (message = "Payment gateway communication failure.") =>
    new AppError("PAYMENT_GATEWAY_ERROR", message, 502),
};

export function zodErrorToAppError(error: z.ZodError): AppError {
  const message = error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");

  return new AppError("VALIDATION_ERROR", message, 400);
}

export function mongooseValidationErrorToAppError(
  error: mongoose.Error.ValidationError,
): AppError {
  const message = Object.entries(error.errors)
    .map(([path, err]) => `${path}: ${err.message}`)
    .join("; ");

  return new AppError("VALIDATION_ERROR", message, 400);
}

interface DuplicateKeyError {
  code: 11000;
  keyValue?: Record<string, unknown>;
}

function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === 11000
  );
}

export function duplicateKeyErrorToAppError(
  error: DuplicateKeyError,
): AppError | null {
  if (!isDuplicateKeyError(error)) {
    return null;
  }
  const field = error.keyValue ? Object.keys(error.keyValue)[0] : undefined;
  const message = field
    ? `${field} already exists.`
    : "A record with this value already exists.";

  return new AppError("CONFLICT", message, 409);
}

export async function parseJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw Errors.validation("Invalid JSON body.");
  }
}

export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof z.ZodError) {
    return handleApiError(zodErrorToAppError(error));
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return handleApiError(mongooseValidationErrorToAppError(error));
  }

  if (isDuplicateKeyError(error)) {
    return handleApiError(duplicateKeyErrorToAppError(error));
  }

  logger.error("Unhandled API error", {
    message: error instanceof Error ? error.message : String(error),
  });

  return NextResponse.json(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
    },
    { status: 500 },
  );
}

type RouteContext<T> = { params: Promise<T> };

type RouteHandler<T = Record<string, string>> = (
  request: NextRequest,
  context: RouteContext<T>,
) => Promise<NextResponse>;

export function withErrorHandling<T = Record<string, string>>(
  handler: RouteHandler<T>,
): RouteHandler<T> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return handleApiError(error);
    }
  };
}
