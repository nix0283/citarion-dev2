"use client";

import { useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Activity,
  Target,
  BarChart3,
  Bot,
  Zap,
  AlertTriangle,
  ChevronRight,
  Play,
  Pause,
  Settings,
  RefreshCw,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkline } from "@/components/ui/sparkline";
import { EquityCurve } from "@/components/charts/equity-curve";
import { formatNumber, formatCurrency, formatPercent, formatRelativeTime } from "@/lib/format";
import {
  DEMO_PORTFOLIO,
  DEMO_POSITIONS,
  DEMO_SIGNALS,
  DEMO_EQUITY_CURVE,
  DEMO_BOT_STATS,
  DEMO_SPARKLINES,
} from "@/lib/demo-data-v2";
import { cn } from "@/lib/utils";

// Color constants for Binance-like theme
const COLORS = {
  green: "#0ECB81",
  red: "#F6465D",
  yellow: "#F0B90B",
};

// ============================================
// STAT CARD COMPONENT
// ============================================

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  sparklineData?: number[];
  className?: string;
  valueClassName?: string;
}

function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  sparklineData,
  className,
  valueClassName,
}: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className={cn("text-2xl font-bold font-mono", valueClassName)}>
              {value}
            </p>
            {change !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                {isPositive ? (
                  <TrendingUp className="h-3 w-3" style={{ color: COLORS.green }} />
                ) : (
                  <TrendingDown className="h-3 w-3" style={{ color: COLORS.red }} />
                )}
                <span
                  className="text-xs font-mono"
                  style={{ color: isPositive ? COLORS.green : COLORS.red }}
                >
                  {formatPercent(change)}
                </span>
                {changeLabel && (
                  <span className="text-xs text-muted-foreground">{changeLabel}</span>
                )}
              </div>
            )}
          </div>
          {icon && (
            <div className="p-2 rounded-lg bg-muted/50">{icon}</div>
          )}
        </div>
        {sparklineData && sparklineData.length > 0 && (
          <div className="mt-3 -mx-1">
            <Sparkline
              data={sparklineData}
              type="area"
              color="custom"
              height={32}
              customColor={isPositive ? COLORS.green : COLORS.red}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// POSITION CARD COMPONENT
// ============================================

interface PositionCardProps {
  position: (typeof DEMO_POSITIONS)[0];
}

function PositionCard({ position }: PositionCardProps) {
  const isLong = position.direction === "LONG";
  const isProfit = position.pnl >= 0;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "px-2 py-1 rounded text-xs font-bold",
            isLong ? "bg-[#0ECB81]/20 text-[#0ECB81]" : "bg-[#F6465D]/20 text-[#F6465D]"
          )}
        >
          {position.direction}
        </div>
        <div>
          <p className="font-medium font-mono text-sm">{position.symbol}</p>
          <p className="text-xs text-muted-foreground">
            {position.size} @ ${formatNumber(position.entryPrice, 2)}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p
          className="font-mono font-medium"
          style={{ color: isProfit ? COLORS.green : COLORS.red }}
        >
          {isProfit ? "+" : ""}${formatNumber(position.pnl, 2)}
        </p>
        <p
          className="text-xs font-mono"
          style={{ color: isProfit ? COLORS.green : COLORS.red }}
        >
          {formatPercent(position.pnlPercent)}
        </p>
      </div>
    </div>
  );
}

// ============================================
// SIGNAL CARD COMPONENT
// ============================================

interface SignalCardProps {
  signal: (typeof DEMO_SIGNALS)[0];
}

function SignalCard({ signal }: SignalCardProps) {
  const isLong = signal.direction === "LONG";
  const isProfit = signal.pnl >= 0;

  return (
    <div className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "px-2 py-0.5 rounded text-xs font-bold",
              isLong ? "bg-[#0ECB81]/20 text-[#0ECB81]" : "bg-[#F6465D]/20 text-[#F6465D]"
            )}
          >
            {signal.direction}
          </div>
          <span className="font-mono font-medium text-sm">{signal.symbol}</span>
          <Badge variant="outline" className="text-xs">
            {signal.timeframe}
          </Badge>
        </div>
        <div className="text-right">
          <p
            className="font-mono font-medium text-sm"
            style={{ color: isProfit ? COLORS.green : COLORS.red }}
          >
            {isProfit ? "+" : ""}${formatNumber(signal.pnl, 2)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress to TP</span>
          <span className="font-mono">{signal.progress}%</span>
        </div>
        <Progress
          value={signal.progress}
          className="h-1.5"
        />

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Source:</span>
          <span className="font-medium">{signal.signalSource}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Confidence:</span>
          <span
            className="font-medium font-mono"
            style={{
              color:
                signal.confidence >= 80
                  ? COLORS.green
                  : signal.confidence >= 60
                  ? COLORS.yellow
                  : COLORS.red,
            }}
          >
            {signal.confidence}%
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">R:R:</span>
          <span className="font-medium font-mono">1:{signal.riskReward}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// BOT PERFORMANCE WIDGET
// ============================================

interface BotWidgetProps {
  botKey: keyof typeof DEMO_BOT_STATS;
}

function BotWidget({ botKey }: BotWidgetProps) {
  const bot = DEMO_BOT_STATS[botKey];
  const isRunning = bot.status === "running";
  const isPaused = bot.status === "paused";

  return (
    <div className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              isRunning ? "bg-[#0ECB81] animate-pulse" : isPaused ? "bg-[#F0B90B]" : "bg-muted-foreground"
            )}
          />
          <span className="font-medium text-sm">{bot.name}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          {isRunning ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div>
          <p className="text-muted-foreground">Total PnL</p>
          <p className="font-mono font-medium text-[#0ECB81]">
            +${formatNumber(bot.totalProfit, 2)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Win Rate</p>
          <p className="font-mono font-medium">{bot.winRate}%</p>
        </div>
        <div>
          <p className="text-muted-foreground">Trades</p>
          <p className="font-mono">{bot.totalTrades}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Sharpe</p>
          <p className="font-mono">{bot.sharpe}</p>
        </div>
      </div>

      <div className="h-12">
        <Sparkline
          data={bot.dailyPnl}
          type="bar"
          color="custom"
          height={48}
          customColor={COLORS.green}
        />
      </div>
    </div>
  );
}

// ============================================
// QUICK ACTIONS
// ============================================

function QuickActions() {
  const actions = [
    { icon: <Bot className="h-4 w-4" />, label: "New Bot", color: COLORS.green },
    { icon: <Target className="h-4 w-4" />, label: "New Signal", color: COLORS.yellow },
    { icon: <RefreshCw className="h-4 w-4" />, label: "Sync", color: COLORS.green },
    { icon: <Settings className="h-4 w-4" />, label: "Settings", color: COLORS.yellow },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {actions.map((action) => (
        <Button
          key={action.label}
          variant="outline"
          className="h-auto py-3 flex-col gap-1 hover:border-primary/50"
        >
          <span style={{ color: action.color }}>{action.icon}</span>
          <span className="text-xs">{action.label}</span>
        </Button>
      ))}
    </div>
  );
}

// ============================================
// MAIN DASHBOARD VIEW
// ============================================

export function DashboardView() {
  const totalPnl = useMemo(() => {
    return DEMO_POSITIONS.reduce((acc, pos) => acc + pos.pnl, 0);
  }, []);

  const activeSignalsCount = useMemo(() => {
    return DEMO_SIGNALS.filter((s) => s.status === "active").length;
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Portfolio Overview & Trading Activity
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1 text-[#0ECB81] border-[#0ECB81]/30"
              >
                <span className="w-2 h-2 rounded-full bg-[#0ECB81] animate-pulse" />
                Live
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Balance"
            value={formatCurrency(DEMO_PORTFOLIO.totalBalance)}
            change={DEMO_PORTFOLIO.todayPnlPercent}
            changeLabel="today"
            icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
            sparklineData={DEMO_SPARKLINES.balance}
          />
          <StatCard
            title="Today's PnL"
            value={formatCurrency(DEMO_PORTFOLIO.todayPnl)}
            change={DEMO_PORTFOLIO.todayPnlPercent}
            icon={<Activity className="h-4 w-4 text-muted-foreground" />}
            sparklineData={DEMO_SPARKLINES.pnl}
            valueClassName="text-[#0ECB81]"
          />
          <StatCard
            title="Win Rate"
            value={`${DEMO_PORTFOLIO.winRate}%`}
            icon={<Target className="h-4 w-4 text-muted-foreground" />}
          />
          <StatCard
            title="Total Trades"
            value={formatNumber(DEMO_PORTFOLIO.totalTrades, 0)}
            icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
            sparklineData={DEMO_SPARKLINES.trades}
          />
        </div>

        {/* Quick Actions */}
        <QuickActions />

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Equity Curve */}
          <div className="lg:col-span-2 space-y-6">
            <EquityCurve
              data={DEMO_EQUITY_CURVE}
              title="Portfolio Performance"
              height={280}
            />

            {/* Active Positions */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Active Positions
                    <Badge variant="secondary" className="ml-1">
                      {DEMO_POSITIONS.length}
                    </Badge>
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="gap-1">
                    View All
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <ScrollArea className="max-h-64">
                  <div className="space-y-2">
                    {DEMO_POSITIONS.map((position) => (
                      <PositionCard key={position.id} position={position} />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Performance Metrics */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Profit Factor</p>
                    <p className="text-lg font-mono font-bold">{DEMO_PORTFOLIO.profitFactor}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Sharpe Ratio</p>
                    <p className="text-lg font-mono font-bold">{DEMO_PORTFOLIO.sharpeRatio}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Max Drawdown</p>
                    <p className="text-lg font-mono font-bold text-[#F6465D]">
                      -{DEMO_PORTFOLIO.maxDrawdown}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Avg Win/Loss</p>
                    <p className="text-lg font-mono font-bold">
                      <span className="text-[#0ECB81]">${formatNumber(DEMO_PORTFOLIO.avgWin, 0)}</span>
                      <span className="text-muted-foreground mx-1">/</span>
                      <span className="text-[#F6465D]">-${formatNumber(DEMO_PORTFOLIO.avgLoss, 0)}</span>
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Best Trade</p>
                    <p className="text-lg font-mono font-bold text-[#0ECB81]">
                      +${formatNumber(DEMO_PORTFOLIO.bestTrade, 0)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Worst Trade</p>
                    <p className="text-lg font-mono font-bold text-[#F6465D]">
                      -${formatNumber(Math.abs(DEMO_PORTFOLIO.worstTrade), 0)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Sortino Ratio</p>
                    <p className="text-lg font-mono font-bold">{DEMO_PORTFOLIO.sortinoRatio}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Calmar Ratio</p>
                    <p className="text-lg font-mono font-bold">{DEMO_PORTFOLIO.calmarRatio}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Active Signals */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4" style={{ color: COLORS.yellow }} />
                    Active Signals
                    <Badge variant="secondary" className="ml-1">
                      {activeSignalsCount}
                    </Badge>
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="gap-1">
                    View All
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <ScrollArea className="max-h-80">
                  <div className="space-y-3">
                    {DEMO_SIGNALS.slice(0, 4).map((signal) => (
                      <SignalCard key={signal.id} signal={signal} />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Bot Performance */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    Bot Performance
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="gap-1">
                    Manage
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="space-y-3">
                  <BotWidget botKey="gridBot" />
                  <BotWidget botKey="dcaBot" />
                  <BotWidget botKey="signalBot" />
                </div>
              </CardContent>
            </Card>

            {/* Risk Warning */}
            <Card className="border-[#F0B90B]/30 bg-[#F0B90B]/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-[#F0B90B] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm mb-1">Risk Management</p>
                    <p className="text-xs text-muted-foreground">
                      Current exposure: <span className="font-mono">23.5%</span> of portfolio.
                      Drawdown alert threshold: <span className="font-mono">15%</span>.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardView;
