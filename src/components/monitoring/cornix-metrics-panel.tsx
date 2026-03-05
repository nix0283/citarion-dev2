"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertCircle,
  BarChart3,
  PieChart,
  Zap,
} from "lucide-react";

interface FeatureUsageStats {
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

interface MetricsSummary {
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

interface MetricsData {
  success: boolean;
  summary: MetricsSummary;
  recentMetrics: Array<{
    id: string;
    feature: string;
    command: string;
    success: boolean;
    source: string;
    executionMs: number | null;
    errorMessage: string | null;
    createdAt: Date;
  }>;
}

const FEATURE_NAMES: Record<string, string> = {
  firstentry: "First Entry as Market",
  tpgrace: "TP Grace",
  trailing: "Trailing Stop",
  leverage: "Leverage",
  direction: "Direction Filter",
  entrystrategy: "Entry Strategy",
  tpstrategy: "TP Strategy",
  sl: "Stop Loss",
  filters: "Signal Filters",
  config: "Configuration",
  reset: "Reset Config",
};

const FEATURE_COLORS: Record<string, string> = {
  firstentry: "#0ECB81",
  tpgrace: "#0ECB81",
  trailing: "#0ECB81",
  leverage: "#F59E0B",
  direction: "#0ECB81",
  entrystrategy: "#0ECB81",
  tpstrategy: "#0ECB81",
  sl: "#F6465D",
  filters: "#0ECB81",
  config: "#6366F1",
  reset: "#F6465D",
};

export function CornixMetricsPanel() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await fetch("/api/cornix/metrics?days=30");
      if (!response.ok) throw new Error("Failed to fetch metrics");
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#0ECB81]" />
            Cornix Feature Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading metrics...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#F6465D]" />
            Cornix Feature Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 text-[#F6465D]">
            <AlertCircle className="h-5 w-5 mr-2" />
            {error || "No data available"}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { summary } = data;

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#0ECB81]" />
              <span className="text-sm text-muted-foreground">Total Commands</span>
            </div>
            <div className="text-2xl font-bold mt-2">{summary.totalCommands}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#0ECB81]" />
              <span className="text-sm text-muted-foreground">Success Rate</span>
            </div>
            <div className="text-2xl font-bold mt-2">{summary.successRate.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-[#F59E0B]" />
              <span className="text-sm text-muted-foreground">Oracle Calls</span>
            </div>
            <div className="text-2xl font-bold mt-2">{summary.sourceDistribution.oracle}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">API Calls</span>
            </div>
            <div className="text-2xl font-bold mt-2">{summary.sourceDistribution.api}</div>
          </CardContent>
        </Card>
      </div>

      {/* Feature Usage */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Feature Usage (Top 10)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary.topFeatures.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No feature usage data yet. Start using Cornix commands to see metrics.
            </div>
          ) : (
            <div className="space-y-3">
              {summary.topFeatures.map((feature) => (
                <div key={feature.feature} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: FEATURE_COLORS[feature.feature] || "#888" }}
                      />
                      <span className="text-sm font-medium">
                        {FEATURE_NAMES[feature.feature] || feature.feature}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {feature.totalCalls} calls
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          feature.successRate >= 90
                            ? "text-[#0ECB81] border-[#0ECB81]/30"
                            : feature.successRate >= 70
                            ? "text-[#F59E0B] border-[#F59E0B]/30"
                            : "text-[#F6465D] border-[#F6465D]/30"
                        }
                      >
                        {feature.successRate.toFixed(0)}%
                      </Badge>
                    </div>
                  </div>
                  <Progress
                    value={feature.successRate}
                    className="h-1.5"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Errors */}
      {summary.recentErrors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-[#F6465D]">
              <AlertCircle className="h-4 w-4" />
              Recent Errors ({summary.recentErrors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {summary.recentErrors.slice(0, 5).map((err, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-2 rounded bg-[#F6465D]/5 border border-[#F6465D]/10"
                >
                  <AlertCircle className="h-4 w-4 text-[#F6465D] mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{err.command}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {err.errorMessage || "Unknown error"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(err.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Source Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-[#0ECB81]">
                {summary.sourceDistribution.oracle}
              </div>
              <div className="text-xs text-muted-foreground">Oracle</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-500">
                {summary.sourceDistribution.telegram}
              </div>
              <div className="text-xs text-muted-foreground">Telegram</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-[#F59E0B]">
                {summary.sourceDistribution.api}
              </div>
              <div className="text-xs text-muted-foreground">API</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Usage */}
      {summary.dailyUsage.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Daily Usage (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-20">
              {summary.dailyUsage.slice(-7).map((day) => {
                const maxCount = Math.max(...summary.dailyUsage.map((d) => d.count), 1);
                const height = (day.count / maxCount) * 100;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-[#0ECB81]/20 rounded-t relative"
                      style={{ height: `${Math.max(height, 5)}%` }}
                    >
                      <div
                        className="absolute bottom-0 w-full bg-[#0ECB81] rounded-t transition-all"
                        style={{ height: "100%" }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(day.date).toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
