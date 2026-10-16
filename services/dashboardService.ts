// @/services/dashboardService.ts
import type { SessionUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import InventoryModel from "@/models/Inventory";
import TransactionModel from "@/models/Transaction";
import type {
  AgentPerformanceQuery,
  InventoryQuery,
  Period,
  RevenueQuery,
  ServicePerformanceQuery,
  SummaryQuery,
  TransactionStatsQuery,
} from "@/validations/dashboardSchema";

// Determine the date range based on period and optional from/to
function getDateRange(
  period: Period,
  from?: Date,
  to?: Date,
): { from: Date; to: Date } {
  const end = to || new Date();
  let start: Date;

  if (from) {
    start = from;
  } else {
    const d = new Date(end);
    switch (period) {
      case "DAY":
        d.setDate(d.getDate() - 1);
        break;
      case "WEEK":
        d.setDate(d.getDate() - 7);
        break;
      case "MONTH":
        d.setMonth(d.getMonth() - 1);
        break;
      case "YEAR":
        d.setFullYear(d.getFullYear() - 1);
        break;
    }
    start = d;
  }

  return { from: start, to: end };
}

// Builds the $group _id expression for bucketing by period. Exported (not
// just inlined in getRevenue) so it's unit-testable without a real MongoDB
// connection: a MongoDB expression object may have at most one operator key
// (one field starting with $) at any given nesting level — { $month: ...,
// $year: ... } throws "must have exactly one field" at aggregation
// execution time, not at any validation step this codebase runs before
// that, so a mistake here surfaces in production as a bare 500 with no
// indication of which period triggered it. WEEK/MONTH need two components
// (year disambiguates e.g. week 1 of 2025 from week 1 of 2026), so each
// goes under its own plain (non-$) field name instead of colliding in one
// object.
export function buildPeriodGroupingId(period: Period): Record<string, unknown> {
  switch (period) {
    case "DAY":
      return { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
    case "WEEK":
      return { year: { $year: "$createdAt" }, week: { $week: "$createdAt" } };
    case "MONTH":
      return {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
      };
    case "YEAR":
      return { $year: "$createdAt" };
  }
}

// §12.4: exclude CANCELLED, don't count PENDING as received
function baseTransactionMatch(branchId?: string) {
  const match: Record<string, unknown> = {
    transactionStatus: { $ne: "CANCELLED" },
  };
  if (branchId) {
    match.branch = branchId;
  }
  return match;
}

export async function getSummary(user: SessionUser, query: SummaryQuery) {
  await connectDB();

  const { from, to } = getDateRange(query.period, query.from, query.to);
  const branchId =
    user.role === "HOST" ? query.branchId : user.branch || undefined;

  const match = {
    ...baseTransactionMatch(branchId),
    createdAt: { $gte: from, $lte: to },
  };

  const stats = await TransactionModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "PAID"] }, "$total", 0],
          },
        },
        transactionCount: { $sum: 1 },
        avgOrderValue: { $avg: "$total" },
        uniqueCustomers: { $addToSet: "$customer" },
      },
    },
    {
      $project: {
        _id: 0,
        totalRevenue: 1,
        transactionCount: 1,
        avgOrderValue: { $round: ["$avgOrderValue", 0] },
        uniqueCustomers: {
          $size: {
            $filter: { input: "$uniqueCustomers", as: "c", cond: "$$c" },
          },
        },
      },
    },
  ]);

  return (
    stats[0] || {
      totalRevenue: 0,
      transactionCount: 0,
      avgOrderValue: 0,
      uniqueCustomers: 0,
    }
  );
}

export async function getRevenue(user: SessionUser, query: RevenueQuery) {
  await connectDB();

  const { from, to } = getDateRange(query.period, query.from, query.to);
  const branchId =
    user.role === "HOST" ? query.branchId : user.branch || undefined;

  const match = {
    ...baseTransactionMatch(branchId),
    createdAt: { $gte: from, $lte: to },
  };

  const dateGrouping = buildPeriodGroupingId(query.period);

  const revenueByPeriod = await TransactionModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: dateGrouping,
        revenue: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "PAID"] }, "$total", 0],
          },
        },
        transactionCount: { $sum: 1 },
        ownerRevenue: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "PAID"] }, "$ownerRevenue", 0],
          },
        },
        agentRevenue: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "PAID"] }, "$employeeRevenue", 0],
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Payment method breakdown
  const paymentBreakdown = await TransactionModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$paymentMethod",
        count: { $sum: 1 },
        revenue: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "PAID"] }, "$total", 0],
          },
        },
      },
    },
  ]);

  return {
    byPeriod: revenueByPeriod,
    paymentBreakdown,
  };
}

export async function getServicePerformance(
  user: SessionUser,
  query: ServicePerformanceQuery,
) {
  await connectDB();

  const { from, to } = getDateRange(query.period, query.from, query.to);
  const branchId =
    user.role === "HOST" ? query.branchId : user.branch || undefined;

  const match = {
    ...baseTransactionMatch(branchId),
    createdAt: { $gte: from, $lte: to },
  };

  const performance = await TransactionModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$service",
        serviceName: { $first: "$serviceSnapshot.name" },
        count: { $sum: 1 },
        revenue: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "PAID"] }, "$total", 0],
          },
        },
        avgOrderValue: { $avg: "$total" },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 10 },
    {
      $project: {
        _id: 1,
        serviceName: 1,
        count: 1,
        revenue: { $round: ["$revenue", 0] },
        avgOrderValue: { $round: ["$avgOrderValue", 0] },
      },
    },
  ]);

  return performance;
}

export async function getAgentPerformance(
  user: SessionUser,
  query: AgentPerformanceQuery,
) {
  await connectDB();

  const { from, to } = getDateRange(query.period, query.from, query.to);
  const branchId =
    user.role === "HOST" ? query.branchId : user.branch || undefined;
  const baseMatch = baseTransactionMatch(branchId);
  const match: Record<string, unknown> = {
    ...baseMatch,
    createdAt: { $gte: from, $lte: to },
  };

  // §12.3: AGENT sees only themselves
  if (user.role === "AGENT") {
    match.agent = user.id;
  } else if (query.agentId) {
    match.agent = query.agentId;
  }

  const performance = await TransactionModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$agent",
        agentName: { $first: "$agent" },
        transactionCount: { $sum: 1 },
        totalRevenue: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "PAID"] }, "$total", 0],
          },
        },
        agentRevenue: {
          $sum: {
            $cond: [{ $eq: ["$paymentStatus", "PAID"] }, "$employeeRevenue", 0],
          },
        },
      },
    },
    { $sort: { totalRevenue: -1 } },
    {
      $project: {
        _id: 1,
        agentName: 1,
        transactionCount: 1,
        totalRevenue: { $round: ["$totalRevenue", 0] },
        agentRevenue: { $round: ["$agentRevenue", 0] },
      },
    },
  ]);

  return performance;
}

export async function getTransactionStats(
  user: SessionUser,
  query: TransactionStatsQuery,
) {
  await connectDB();

  const { from, to } = getDateRange(query.period, query.from, query.to);
  const branchId =
    user.role === "HOST" ? query.branchId : user.branch || undefined;

  const match = {
    ...baseTransactionMatch(branchId),
    createdAt: { $gte: from, $lte: to },
  };

  const stats = await TransactionModel.aggregate([
    { $match: match },
    {
      $facet: {
        byStatus: [
          { $group: { _id: "$transactionStatus", count: { $sum: 1 } } },
        ],
        byPaymentStatus: [
          { $group: { _id: "$paymentStatus", count: { $sum: 1 } } },
        ],
        byPaymentMethod: [
          { $group: { _id: "$paymentMethod", count: { $sum: 1 } } },
        ],
      },
    },
  ]);

  return stats[0] || { byStatus: [], byPaymentStatus: [], byPaymentMethod: [] };
}

export async function getInventorySummary(
  user: SessionUser,
  query: InventoryQuery,
) {
  await connectDB();

  const filter: Record<string, unknown> = {
    isActive: true,
    $expr: { $lte: ["$quantity", "$minimumStock"] },
  };

  if (user.role === "HOST" && query.branchId) {
    filter.branch = query.branchId;
  } else if (user.role === "AGENT" && user.branch) {
    filter.branch = user.branch;
  }

  const lowStockItems = await InventoryModel.find(filter)
    .populate("branch", "name")
    .sort({ quantity: 1 })
    .limit(20);

  return lowStockItems;
}
