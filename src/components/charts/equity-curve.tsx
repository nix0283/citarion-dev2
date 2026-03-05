"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, TrendingDown, Maximize2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMO_EQUITY_CURVE } from "@/lib/demo-data-v2";

interface EquityCurveProps {
  data?: Array<{
    date: string;
    balance: number;
    pnl: number;
    drawdown: number;
  }>;
  title?: string;
  showControls?: boolean;
  height?: number;
  className?: string;
}

export function EquityCurve({
  data = DEMO_EQUITY_CURVE,
  title = "Equity Curve",
  showControls = true,
  height = 300,
  className,
}: EquityCurveProps) {
  const stats = useMemo(() => {
    if (data.length === 0) return null;
    
    const first = data[0];
    const last = data[data.length - 1];
    const maxBalance = Math.max(...data.map(d => d.balance));
    const minBalance = Math.min(...data.map(d => d.balance));
    const maxDrawdown = Math.max(...data.map(d => Math.abs(d.drawdown)));
    
    return {
      totalReturn: ((last.balance - first.balance) / first.balance) * 100,
      maxBalance,
      minBalance,
      maxDrawdown,
      currentBalance: last.balance,
    };
  }, [data]);

  const formatValue = (value: number) => {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base font-medium">{title}</CardTitle>
            {stats && (
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono",
                    stats.totalReturn >= 0
                      ? "text-[#0ECB81] border-[#0ECB81]/30"
                      : "text-[#F6465D] border-[#F6465D]/30"
                  )}
                >
                  {stats.totalReturn >= 0 ? (
                    <TrendingUp className="h-3 w-3 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-1" />
                  )}
                  {stats.totalReturn >= 0 ? "+" : ""}
                  {stats.totalReturn.toFixed(1)}%
                </Badge>
                <Badge variant="outline" className="font-mono text-xs">
                  Max DD: {stats.maxDrawdown.toFixed(1)}%
                </Badge>
              </div>
            )}
          </div>
          
          {showControls && (
            <div className="flex items-center gap-2">
              <Select defaultValue="1m">
                <SelectTrigger className="w-[100px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1w">1 Week</SelectItem>
                  <SelectItem value="1m">1 Month</SelectItem>
                  <SelectItem value="3m">3 Months</SelectItem>
                  <SelectItem value="1y">1 Year</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div style={{ height }} className="px-4 pb-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ECB81" stopOpacity={0.4} />
                  <stop offset="50%" stopColor="#0ECB81" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#0ECB81" stopOpacity={0} />
                </linearGradient>
              </defs>
              
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatValue(v).replace("$", "")}
                domain={["dataMin - 1000", "dataMax + 1000"]}
              />
              
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                      <p className="text-xs text-muted-foreground mb-2">
                        {formatDate(data.date)}
                      </p>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs text-muted-foreground">Balance</span>
                          <span className="text-sm font-medium font-mono">
                            {formatValue(data.balance)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs text-muted-foreground">PnL</span>
                          <span
                            className={cn(
                              "text-sm font-medium font-mono",
                              data.pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                            )}
                          >
                            {data.pnl >= 0 ? "+" : ""}
                            {formatValue(data.pnl)}
                          </span>
                        </div>
                        {data.drawdown < 0 && (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-muted-foreground">Drawdown</span>
                            <span className="text-sm font-medium font-mono text-[#F6465D]">
                              {formatValue(data.drawdown)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
              
              <ReferenceLine
                y={50000}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                opacity={0.5}
              />
              
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#0ECB81"
                strokeWidth={2}
                fill="url(#equityGradient)"
                animationDuration={1000}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
