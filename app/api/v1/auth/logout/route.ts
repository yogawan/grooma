// @/app/api/v1/auth/logout/route.ts
import type { NextRequest } from "next/server";
import {
  clearSessionCookie,
  revokeSession,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { Errors, successResponse, withErrorHandling } from "@/lib/errors";

export const POST = withErrorHandling(async (request: NextRequest) => {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    throw Errors.unauthenticated();
  }

  await revokeSession(token);

  const response = successResponse({});
  clearSessionCookie(response);
  return response;
});
