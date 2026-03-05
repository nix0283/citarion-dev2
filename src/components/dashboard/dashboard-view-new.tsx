"use client";

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Bot,
  Signal,
  Wallet,
  BarChart3,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  DollarSign,
  Zap,
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline, PnLSparkline } from "@/components/ui/sparkline";
import { EquityCurve } from "@/components/charts/equity-curve";
import {
  DEMO_PORTFOLIO,
  DEMO_POSITIONS,
  DEMO_SIGNALS,
  DEMO_SPARKLINES,
  DEMO_BOT_STATS,
  DEMO_EQUITY_CURVE,
} from "@/lib/demo-data-v2";
import { formatNumber } from "@/lib/format";

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatCurrency = (value: number, decimals = 0) => {
  return `$${formatNumber(value, decimals)}`;
};

const formatPercent = (value: number) => {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
};

// ============================================
// STAT CARD COMPONENT
// ============================================

interface StatCardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  sparkline?: number[];
  trend?: "up" | "down" | "neutral";
  className?: string;
}

function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  sparkline,
  trend = "neutral",
  className,
}: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">{title}</p>

            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-2xl font-bold font-mono tracking-tight truncate">
                {value}
              </p>

              {change !== undefined && (
                <div className="flex items-center gap-0.5 text-xs">
                  {isPositive ? (
                    <ArrowUpRight className="h-4 w-4 text-[#0ECB81]" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-[#F6465D]" />
                  )}
                  <span
                    className={cn(
                      "font-medium",
                      isPositive ? "text-[#0ECB81]" : "text-[#F6465D]"
                    )}
                  >
                    {isPositive ? "+" : ""}
                    {change.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>

            {changeLabel && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{changeLabel}</p>
            )}
          </div>

          {icon && (
            <div
              className={cn(
                "p-2 rounded-lg",
                trend === "up" && "bg-[#0ECB81]/10",
                trend === "down" && "bg-[#F6465D]/10",
                trend === "neutral" && "bg-muted/50"
              )}
            >
              <div
                className={cn(
                  trend === "up" && "text-[#0ECB81]",
                  trend === "down" && "text-[#F6465D]",
                  trend === "neutral" && "text-muted-foreground"
                )}
              >
                {icon}
              </div>
            </div>
          )}
        </div>

        {sparkline && (
          <div className="mt-3 -mx-1">
            <PnLSparkline data={sparkline} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// POSITION ROW COMPONENT
// ============================================

function PositionRow({ position }: { position: typeof DEMO_POSITIONS[0] }) {
  const isPositive = position.pnl >= 0;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          className={cn(
            "font-mono text-xs",
            position.direction === "LONG"
              ? "text-[#0ECB81] border-[#0ECB81]/30"
              : "text-[#F6465D] border-[#F6465D]/30"
          )}
        >
          {position.direction === "LONG" ? (
            <TrendingUp className="h-3 w-3 mr-1" />
          ) : (
            <TrendingDown className="h-3 w-3 mr-1" />
          )}
          {position.symbol.replace("USDT", "")}
        </Badge>

        <div className="text-sm">
          <span className="font-mono">${formatNumber(position.entryPrice, 2)}</span>
          <span className="text-muted-foreground mx-1">→</span>
          <span
            className={cn(
              "font-mono",
              isPositive ? "text-[#0ECB81]" : "text-[#F6465D]"
            )}
          >
            ${formatNumber(position.markPrice, 2)}
          </span>
        </div>

        <Badge variant="outline" className="text-[10px] font-mono">
          {position.leverage}x
        </Badge>
      </div>

      <div className="text-right">
        <div
          className={cn(
            "text-sm font-mono font-medium",
            isPositive ? "text-[#0ECB81]" : "text-[#F6465D]"
          )}
        >
          {isPositive ? "+" : ""}${formatNumber(position.pnl, 0)}
        </div>
        <div
          className={cn(
            "text-[10px] font-mono",
            isPositive ? "text-[#0ECB81]/70" : "text-[#F6465D]/70"
          )}
        >
          {isPositive ? "+" : ""}{position.pnlPercent.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

// ============================================
// SIGNAL CARD COMPONENT
// ============================================

function SignalCard({ signal }: { signal: typeof DEMO_SIGNALS[0] }) {
  const isPositive = signal.pnl >= 0;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const timeAgo = useMemo(() => {
    if (!mounted) return "--";
    const diff = Date.now() - new Date(signal.receivedAt).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m ago`;
    return `${minutes}m ago`;
  }, [mounted, signal.receivedAt]);

  return (
    <div className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "font-mono text-xs",
              signal.direction === "LONG"
                ? "text-[#0ECB81] border-[#0ECB81]/30"
                : "text-[#F6465D] border-[#F6465D]/30"
            )}
          >
            {signal.direction === "LONG" ? (
              <TrendingUp className="h-3 w-3 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1" />
            )}
            {signal.symbol.replace("USDT", "")}
          </Badge>

          <span className="text-xs text-muted-foreground">{signal.signalSource}</span>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {timeAgo}
        </div>
      </div>

      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground">Progress to TP</span>
          <span className="text-[10px] font-mono font-medium">{signal.progress}%</span>
        </div>
        <Progress value={signal.progress} className="h-1" />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-muted-foreground">
            Entry: ${formatNumber(signal.entryPrice, 2)}
          </span>
          <span className="text-muted-foreground">
            TP: ${formatNumber(signal.targetPrice, 0)}
          </span>
        </div>

        <div
          className={cn(
            "text-sm font-mono font-medium",
            isPositive ? "text-[#0ECB81]" : "text-[#F6465D]"
          )}
        >
          {isPositive ? "+" : ""}${formatNumber(signal.pnl, 0)}
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN DASHBOARD VIEW
// ============================================

export function DashboardViewNew() {
  const activeSignalsCount = DEMO_SIGNALS.length;
  const activePositionsCount = DEMO_POSITIONS.length;
  const activeBotsCount = Object.values(DEMO_BOT_STATS).filter(b => b.status === "running").length;

  return (
    <div className="flex flex-col h-full gap-4 overflow-auto">
      {/* Top Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title="Total Balance"
          value={formatCurrency(DEMO_PORTFOLIO.totalBalance)}
          change={DEMO_PORTFOLIO.weekPnlPercent}
          changeLabel="this week"
          icon={<Wallet className="h-4 w-4" />}
          sparkline={DEMO_SPARKLINES.balance}
          trend="up"
        />
        <StatCard
          title="Today's P&L"
          value={formatCurrency(Math.abs(DEMO_PORTFOLIO.todayPnl))}
          change={DEMO_PORTFOLIO.todayPnlPercent}
          icon={<DollarSign className="h-4 w-4" />}
          sparkline={DEMO_SPARKLINES.pnl}
          trend={DEMO_PORTFOLIO.todayPnl >= 0 ? "up" : "down"}
        />
        <StatCard
          title="Win Rate"
          value={`${DEMO_PORTFOLIO.winRate}%`}
          icon={<Target className="h-4 w-4" />}
          trend="up"
        />
        <StatCard
          title="Sharpe Ratio"
          value={DEMO_PORTFOLIO.sharpeRatio.toFixed(2)}
          icon={<BarChart3 className="h-4 w-4" />}
          trend="up"
        />
      </div>

      {/* Main Content Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        {/* Left Column - Charts */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          {/* Equity Curve */}
          <EquityCurve height={280} />

          {/* Active Positions */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#0ECB81]" />
                  Active Positions
                  <Badge variant="outline" className="text-xs">
                    {activePositionsCount}
                  </Badge>
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs">
                  View All <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {DEMO_POSITIONS.slice(0, 4).map((position) => (
                  <PositionRow key={position.id} position={position} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Active Signals */}
          <Card className="flex-1 min-h-0 flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Signal className="h-4 w-4 text-blue-500" />
                  Active Signals
                  <Badge variant="outline" className="text-xs">
                    {activeSignalsCount}
                  </Badge>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              <ScrollArea className="h-full">
                <div className="space-y-2 pr-2">
                  {DEMO_SIGNALS.map((signal) => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Bot Performance */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-amber-500" />
                  Active Bots
                </CardTitle>
                <Badge variant="outline" className="text-xs text-[#0ECB81] border-[#0ECB81]/30">
                  {activeBotsCount} running
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(DEMO_BOT_STATS).slice(0, 3).map(([key, bot]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full",
                          bot.status === "running" ? "bg-[#0ECB81]" : "bg-muted-foreground"
                        )}
                      />
                      <span className="text-sm font-medium truncate max-w-[140px]">
                        {bot.name.split(" (")[0]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{bot.totalTrades}t</span>
                      <span
                        className={cn(
                          "text-sm font-mono font-medium",
                          bot.totalProfit >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                        )}
                      >
                        {bot.totalProfit >= 0 ? "+" : ""}${formatNumber(bot.totalProfit, 0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardContent className="p-3">
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" className="h-auto py-3 flex-col gap-1">
                  <Shield className="h-5 w-5 text-[#0ECB81]" />
                  <span className="text-[10px]">Risk</span>
                </Button>
                <Button variant="outline" className="h-auto py-3 flex-col gap-1">
                  <Zap className="h-5 w-5 text-amber-500" />
                  <span className="text-[10px]">Quick Trade</span>
                </Button>
                <Button variant="outline" className="h-auto py-3 flex-col gap-1">
                  <BarChart3 className="h-5 w-5 text-purple-500" />
                  <span className="text-[10px]">Analytics</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default DashboardViewNew;
