#!/usr/bin/env node

/**
 * Payment Reconciliation Script
 *
 * Compares local payment status with Midtrans authoritative status
 * and optionally fixes discrepancies. Useful for:
 * - Detecting missed/duplicated Midtrans webhooks
 * - Recovering from failed webhook processing
 * - Auditing payment state consistency
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/reconcilePayments.ts [--fix] [--limit 100]
 *
 * (Not `bun scripts/reconcilePayments.ts` — Bun's node:v8 shim throws on
 * bson's startup-snapshot check at import time before this script's own
 * code ever runs. tsx runs under Node, which has no such gap, but — unlike
 * Bun — doesn't auto-load .env.local, hence --env-file.)
 *
 * Options:
 *   --fix        Apply fixes (default: dry-run, only report)
 *   --limit N    Maximum payments to check (default: 100)
 *   --status S   Filter by local status: PENDING|PAID|FAILED|EXPIRED|REFUNDED
 */

import mongoose from "mongoose";
import { getTransactionStatus } from "@/lib/midtrans";
import { connectDB } from "@/lib/mongodb";
import PaymentModel from "@/models/Payment";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI environment variable");
}

interface ReconciliationResult {
  total: number;
  matched: number;
  mismatched: number;
  discrepancies: Array<{
    paymentId: string;
    providerOrderId: string;
    localStatus: string;
    remoteStatus: string;
    action: string;
  }>;
}

const args = process.argv.slice(2);
const shouldFix = args.includes("--fix");
const limitArg = args.find((a) => a.startsWith("--limit"));
const limit = limitArg
  ? Number(limitArg.split("=")[1] || args[args.indexOf(limitArg) + 1])
  : 100;
const statusFilter = args.find((a) => a.startsWith("--status"));
const filterStatus = statusFilter ? statusFilter.split("=")[1] : undefined;

async function reconcilePayments(): Promise<ReconciliationResult> {
  await connectDB();

  console.log(`\n🔄 Payment Reconciliation Started`);
  console.log(`   Mode: ${shouldFix ? "APPLY FIXES" : "DRY RUN (no changes)"}`);
  console.log(`   Limit: ${limit} payments`);
  if (filterStatus) {
    console.log(`   Filter: status=${filterStatus}`);
  }
  console.log("");

  const query: Record<string, unknown> = {};
  if (filterStatus) {
    query.status = filterStatus;
  }

  const payments = await PaymentModel.find(query)
    .populate("transaction")
    .limit(limit)
    .sort({ createdAt: -1 });

  console.log(`Found ${payments.length} payments to check\n`);

  const result: ReconciliationResult = {
    total: payments.length,
    matched: 0,
    mismatched: 0,
    discrepancies: [],
  };

  for (const payment of payments) {
    try {
      // Get authoritative status from Midtrans
      const midtransStatus = await getTransactionStatus(
        payment.providerOrderId,
      );

      // Map Midtrans status to local status enum
      const STATUS_MAP: Record<string, string> = {
        capture: "PAID",
        settlement: "PAID",
        pending: "PENDING",
        deny: "FAILED",
        cancel: "EXPIRED",
        expire: "EXPIRED",
        refund: "REFUNDED",
        partial_refund: "REFUNDED",
      };

      const remoteStatus =
        STATUS_MAP[midtransStatus.transactionStatus] ||
        midtransStatus.transactionStatus ||
        "UNKNOWN";

      if (payment.status === remoteStatus) {
        result.matched++;
      } else {
        result.mismatched++;
        result.discrepancies.push({
          paymentId: payment._id.toString(),
          providerOrderId: payment.providerOrderId,
          localStatus: payment.status,
          remoteStatus: remoteStatus,
          action: shouldFix ? "FIXED" : "REPORTED",
        });

        if (shouldFix) {
          // Update to match remote status
          payment.status = remoteStatus;
          if (remoteStatus === "PAID" && !payment.paidAt) {
            payment.paidAt = new Date();
          }
          await payment.save();
          console.log(
            `✅ Fixed ${payment.providerOrderId}: ${payment.status} → ${remoteStatus}`,
          );
        } else {
          console.log(
            `⚠️  Mismatch ${payment.providerOrderId}: ${payment.status} (local) vs ${remoteStatus} (Midtrans)`,
          );
        }
      }
    } catch (error) {
      console.error(
        `❌ Error checking ${payment.providerOrderId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return result;
}

async function main() {
  try {
    const result = await reconcilePayments();

    console.log("\n📊 Reconciliation Summary:");
    console.log(`   Total checked: ${result.total}`);
    console.log(`   Matched: ${result.matched}`);
    console.log(`   Mismatched: ${result.mismatched}`);

    if (result.discrepancies.length > 0) {
      console.log("\n📋 Discrepancies Found:");
      console.table(result.discrepancies);

      if (!shouldFix) {
        console.log("\n💡 Tip: Run with --fix flag to apply corrections:");
        console.log("   bun scripts/reconcilePayments.ts --fix\n");
      } else {
        console.log(`\n✅ Fixed ${result.mismatched} discrepancies\n`);
      }
    } else {
      console.log("✅ All payments match Midtrans status\n");
    }

    process.exit(result.mismatched > 0 && !shouldFix ? 1 : 0);
  } catch (error) {
    console.error(
      "❌ Reconciliation failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
