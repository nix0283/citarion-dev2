/**
 * Cornix Feature Metrics Service
 * Tracks usage of Cornix auto-trading features for monitoring and analytics
 */

import { db } from "@/lib/db";

// ==================== TYPES ====================

export interface CornixMetricData {
  feature: string;
  command: string;
  userId?: string;
  source: "ORACLE" | "TELEGRAM" | "API";
  success: boolean;
  errorMessage?: string;
  executionMs?: number;
  configBefore?: Record<string, unknown>;
  configAfter?: Record<string, unknown>;
}

export interface FeatureUsageStats {
  feature: string;
  totalCalls: number;
  successRate: number;
  avgExecutionMs: number;
  lastUsed: Date | null;
  sources: {
    oracle: number;
    telegram: number;
    api: number;
  };
}

export interface MetricsSummary {
  totalCommands: number;
  successRate: number;
  topFeatures: FeatureUsageStats[];
  recentErrors: Array<{
    feature: string;
    command: string;
    errorMessage: string | null;
    createdAt: Date;
  }>;
  dailyUsage: Array<{
    date: string;
    count: number;
  }>;
  sourceDistribution: {
    oracle: number;
    telegram: number;
    api: number;
  };
}

// ==================== METRICS SERVICE ====================

export class CornixMetricsService {
  /**
   * Record a Cornix feature usage metric
   */
  static async recordMetric(data: CornixMetricData): Promise<void> {
    try {
      await db.cornixFeatureMetric.create({
        data: {
          feature: data.feature,
          command: data.command,
          userId: data.userId,
          source: data.source,
          success: data.success,
          errorMessage: data.errorMessage,
          executionMs: data.executionMs,
          configBefore: data.configBefore ? JSON.stringify(data.configBefore) : null,
          configAfter: data.configAfter ? JSON.stringify(data.configAfter) : null,
        },
      });
    } catch (error) {
      console.error("[CornixMetrics] Failed to record metric:", error);
    }
  }

  /**
   * Get usage statistics for a specific feature
   */
  static async getFeatureStats(
    feature: string,
    days: number = 30
  ): Promise<FeatureUsageStats | null> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
      const metrics = await db.cornixFeatureMetric.findMany({
        where: {
          feature,
          createdAt: { gte: since },
        },
      });

      if (metrics.length === 0) {
        return null;
      }

      const totalCalls = metrics.length;
      const successCount = metrics.filter((m) => m.success).length;
      const executionTimes = metrics
        .filter((m) => m.executionMs !== null)
        .map((m) => m.executionMs as number);

      const sources = metrics.reduce(
        (acc, m) => {
          if (m.source === "ORACLE") acc.oracle++;
          else if (m.source === "TELEGRAM") acc.telegram++;
          else if (m.source === "API") acc.api++;
          return acc;
        },
        { oracle: 0, telegram: 0, api: 0 }
      );

      const lastUsed = metrics.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )[0]?.createdAt;

      return {
        feature,
        totalCalls,
        successRate: (successCount / totalCalls) * 100,
        avgExecutionMs:
          executionTimes.length > 0
            ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
            : 0,
        lastUsed,
        sources,
      };
    } catch (error) {
      console.error("[CornixMetrics] Failed to get feature stats:", error);
      return null;
    }
  }

  /**
   * Get overall metrics summary
   */
  static async getSummary(days: number = 30): Promise<MetricsSummary> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
      const metrics = await db.cornixFeatureMetric.findMany({
        where: {
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
      });

      const totalCommands = metrics.length;
      const successCount = metrics.filter((m) => m.success).length;

      // Group by feature
      const featureGroups = new Map<string, typeof metrics>();
      for (const m of metrics) {
        const existing = featureGroups.get(m.feature) || [];
        existing.push(m);
        featureGroups.set(m.feature, existing);
      }

      // Calculate top features
      const topFeatures: FeatureUsageStats[] = [];
      for (const [feature, featureMetrics] of featureGroups) {
        const successRate =
          (featureMetrics.filter((m) => m.success).length / featureMetrics.length) * 100;
        const executionTimes = featureMetrics
          .filter((m) => m.executionMs !== null)
          .map((m) => m.executionMs as number);
        const sources = featureMetrics.reduce(
          (acc, m) => {
            if (m.source === "ORACLE") acc.oracle++;
            else if (m.source === "TELEGRAM") acc.telegram++;
            else if (m.source === "API") acc.api++;
            return acc;
          },
          { oracle: 0, telegram: 0, api: 0 }
        );

        topFeatures.push({
          feature,
          totalCalls: featureMetrics.length,
          successRate,
          avgExecutionMs:
            executionTimes.length > 0
              ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
              : 0,
          lastUsed: featureMetrics[0]?.createdAt || null,
          sources,
        });
      }

      // Sort by total calls
      topFeatures.sort((a, b) => b.totalCalls - a.totalCalls);

      // Recent errors
      const recentErrors = metrics
        .filter((m) => !m.success)
        .slice(0, 10)
        .map((m) => ({
          feature: m.feature,
          command: m.command,
          errorMessage: m.errorMessage,
          createdAt: m.createdAt,
        }));

      // Daily usage
      const dailyMap = new Map<string, number>();
      for (const m of metrics) {
        const date = m.createdAt.toISOString().split("T")[0];
        dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
      }
      const dailyUsage = Array.from(dailyMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Source distribution
      const sourceDistribution = metrics.reduce(
        (acc, m) => {
          if (m.source === "ORACLE") acc.oracle++;
          else if (m.source === "TELEGRAM") acc.telegram++;
          else if (m.source === "API") acc.api++;
          return acc;
        },
        { oracle: 0, telegram: 0, api: 0 }
      );

      return {
        totalCommands,
        successRate: totalCommands > 0 ? (successCount / totalCommands) * 100 : 0,
        topFeatures: topFeatures.slice(0, 10),
        recentErrors,
        dailyUsage,
        sourceDistribution,
      };
    } catch (error) {
      console.error("[CornixMetrics] Failed to get summary:", error);
      return {
        totalCommands: 0,
        successRate: 0,
        topFeatures: [],
        recentErrors: [],
        dailyUsage: [],
        sourceDistribution: { oracle: 0, telegram: 0, api: 0 },
      };
    }
  }

  /**
   * Get recent metrics for a feature
   */
  static async getRecentMetrics(
    feature?: string,
    limit: number = 50
  ): Promise<Array<{
    id: string;
    feature: string;
    command: string;
    success: boolean;
    source: string;
    executionMs: number | null;
    errorMessage: string | null;
    createdAt: Date;
  }>> {
    try {
      const metrics = await db.cornixFeatureMetric.findMany({
        where: feature ? { feature } : undefined,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          feature: true,
          command: true,
          success: true,
          source: true,
          executionMs: true,
          errorMessage: true,
          createdAt: true,
        },
      });

      return metrics;
    } catch (error) {
      console.error("[CornixMetrics] Failed to get recent metrics:", error);
      return [];
    }
  }

  /**
   * Clear old metrics (cleanup)
   */
  static async clearOldMetrics(daysToKeep: number = 90): Promise<number> {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    try {
      const result = await db.cornixFeatureMetric.deleteMany({
        where: {
          createdAt: { lt: cutoff },
        },
      });

      return result.count;
    } catch (error) {
      console.error("[CornixMetrics] Failed to clear old metrics:", error);
      return 0;
    }
  }
}

// ==================== FEATURE LIST ====================

export const CORNIX_FEATURES = [
  { id: "firstentry", name: "First Entry as Market", category: "entry" },
  { id: "tpgrace", name: "TP Grace", category: "exit" },
  { id: "trailing", name: "Trailing Stop", category: "risk" },
  { id: "leverage", name: "Leverage", category: "margin" },
  { id: "direction", name: "Direction Filter", category: "filter" },
  { id: "entrystrategy", name: "Entry Strategy", category: "entry" },
  { id: "tpstrategy", name: "TP Strategy", category: "exit" },
  { id: "sl", name: "Stop Loss", category: "risk" },
  { id: "filters", name: "Signal Filters", category: "filter" },
  { id: "config", name: "Configuration", category: "system" },
  { id: "reset", name: "Reset Config", category: "system" },
] as const;

export type CornixFeatureId = (typeof CORNIX_FEATURES)[number]["id"];
