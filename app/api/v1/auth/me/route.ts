// @/app/api/v1/auth/me/route.ts
import type { NextRequest } from "next/server";
import { serializeSessionUser } from "@/lib/auth";
import { requireAuth } from "@/lib/authorization";
import { successResponse, withErrorHandling } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import BranchModel from "@/models/Branch";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request, { subscriptionPolicy: "EXEMPT_ALL" });

  let branchName: string | null = null;
  if (user.branch) {
    await connectDB();
    const branch = await BranchModel.findById(user.branch)
      .select("name")
      .lean();
    branchName = branch?.name ?? null;
  }

  return successResponse({ user: serializeSessionUser(user, branchName) });
});
