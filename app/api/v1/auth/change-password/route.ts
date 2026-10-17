// @/app/api/v1/auth/change-password/route.ts
import type { NextRequest } from "next/server";
import {
  hashPassword,
  revokeOtherSessions,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from "@/lib/auth";
import { requireAuth } from "@/lib/authorization";
import {
  Errors,
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { checkRateLimit } from "@/lib/rateLimit";
import UserModel from "@/models/User";
import { changePasswordSchema } from "@/validations/authSchema";

const CHANGE_PASSWORD_RATE_LIMIT = 5;
const CHANGE_PASSWORD_RATE_WINDOW_MS = 15 * 60 * 1000;

export const POST = withErrorHandling(async (request: NextRequest) => {
  const sessionUser = await requireAuth(request, {
    subscriptionPolicy: "EXEMPT_ALL",
  });

  const rateLimit = await checkRateLimit(
    `change-password:${sessionUser.id}`,
    CHANGE_PASSWORD_RATE_LIMIT,
    CHANGE_PASSWORD_RATE_WINDOW_MS,
  );
  if (!rateLimit.allowed) {
    throw Errors.rateLimited();
  }

  const parsed = changePasswordSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }
  const { currentPassword, newPassword } = parsed.data;

  await connectDB();
  const user = await UserModel.findById(sessionUser.id).select("+password");

  if (!user) {
    throw Errors.unauthenticated();
  }

  const matches = await verifyPassword(user.password, currentPassword);
  if (!matches) {
    throw Errors.businessRule("Current password is incorrect.");
  }

  user.password = await hashPassword(newPassword);
  await user.save();

  // §M-7: revoke every *other* session for this account. Done after the
  // save so a failed password write never logs anyone out, and the caller's
  // own session is preserved so the device in hand stays signed in.
  const currentToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const revokedSessions = await revokeOtherSessions(
    sessionUser.id,
    currentToken,
  );

  return successResponse({
    message: "Password updated.",
    revokedSessions,
  });
});
