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

  // Group by period (day/week/month/year)
  const dateGrouping: Record<string, unknown> = {};
  switch (query.period) {
    case "DAY":
      dateGrouping.$dateToString = { format: "%Y-%m-%d", date: "$createdAt" };
      break;
    case "WEEK":
      dateGrouping.$week = "$createdAt";
      dateGrouping.$year = "$createdAt";
      break;
    case "MONTH":
      dateGrouping.$month = "$createdAt";
      dateGrouping.$year = "$createdAt";
      break;
    case "YEAR":
      dateGrouping.$year = "$createdAt";
      break;
  }

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
