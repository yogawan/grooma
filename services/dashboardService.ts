// @/services/dashboardService.ts
import type { PipelineStage } from "mongoose";
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

// Dashboard rankings are capped, not paginated (docs/PAGINATION-CONTRACT.md
// §6): asking for page 2 of a "top 10" is incoherent. But a capped list that
// looks identical to a complete one is misleading, so every cap reports the
// untruncated group count alongside the rows.
//
// $facet runs both branches over the same already-$grouped documents, so the
// count costs one extra pass over N groups rather than re-running the $match
// and $group from scratch.
interface CappedResult<T> {
  items: T[];
  limit: number;
  total: number;
  truncated: boolean;
}

// Takes sort and projection separately rather than a free-form stage list so
// the stage order is correct by construction: $limit has to sit between them,
// or the projection is computed for every group and all but `limit` of that
// work is thrown away.
function cappedFacet(
  limit: number,
  sort: Record<string, 1 | -1>,
  project: Record<string, unknown>,
): PipelineStage.Facet {
  return {
    $facet: {
      rows: [{ $sort: sort }, { $limit: limit }, { $project: project }],
      count: [{ $count: "total" }],
    },
  };
}

function readCappedFacet<T>(
  facetOutput: { rows?: T[]; count?: { total: number }[] }[],
  limit: number,
): CappedResult<T> {
  // An empty collection yields one facet document whose branches are both
  // empty arrays — not a missing document — but guard anyway so a shape
  // surprise degrades to "no data" instead of throwing.
  const facet = facetOutput[0] ?? {};
  const items = facet.rows ?? [];
  // $count emits no document at all when there is nothing to count.
  const total = facet.count?.[0]?.total ?? 0;

  return { items, limit, total, truncated: total > items.length };
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
    cappedFacet(
      query.limit,
      { revenue: -1, _id: -1 },
      {
        _id: 1,
        serviceName: 1,
        count: 1,
        revenue: { $round: ["$revenue", 0] },
        avgOrderValue: { $round: ["$avgOrderValue", 0] },
      },
    ),
  ]);

  return readCappedFacet(performance, query.limit);
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
    cappedFacet(
      query.limit,
      { totalRevenue: -1, _id: -1 },
      {
        _id: 1,
        agentName: 1,
        transactionCount: 1,
        totalRevenue: { $round: ["$totalRevenue", 0] },
        agentRevenue: { $round: ["$agentRevenue", 0] },
      },
    ),
  ]);

  return readCappedFacet(performance, query.limit);
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

  // Not a top-N ranking but an actionable worklist, so the untruncated count
  // matters even more here: a HOST with 60 low-stock items used to see 20 with
  // nothing in the response hinting the other 40 existed.
  const [lowStockItems, total] = await Promise.all([
    InventoryModel.find(filter)
      .populate("branch", "name")
      .sort({ quantity: 1, _id: 1 })
      .limit(query.limit),
    InventoryModel.countDocuments(filter),
  ]);

  return {
    items: lowStockItems,
    limit: query.limit,
    total,
    truncated: total > lowStockItems.length,
  };
}
