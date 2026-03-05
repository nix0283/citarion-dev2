"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  type?: "line" | "area" | "bar";
  color?: "green" | "red" | "primary" | "custom";
  customColor?: string;
  height?: number;
  width?: number | string;
  className?: string;
  showGradient?: boolean;
  strokeWidth?: number;
}

export function Sparkline({
  data,
  type = "area",
  color = "green",
  customColor,
  height = 40,
  width = "100%",
  className,
  showGradient = true,
  strokeWidth = 1.5,
}: SparklineProps) {
  const chartData = useMemo(() => {
    return data.map((value, index) => ({ value, index }));
  }, [data]);

  const isPositive = data[data.length - 1] >= data[0];

  const colors = useMemo(() => {
    if (customColor) {
      return {
        stroke: customColor,
        fill: customColor,
        gradientStart: customColor,
        gradientEnd: "transparent",
      };
    }

    if (color === "custom") {
      return {
        stroke: isPositive ? "#0ECB81" : "#F6465D",
        fill: isPositive ? "#0ECB81" : "#F6465D",
        gradientStart: isPositive ? "#0ECB81" : "#F6465D",
        gradientEnd: "transparent",
      };
    }

    const colorMap = {
      green: {
        stroke: "#0ECB81",
        fill: "#0ECB81",
        gradientStart: "#0ECB81",
        gradientEnd: "transparent",
      },
      red: {
        stroke: "#F6465D",
        fill: "#F6465D",
        gradientStart: "#F6465D",
        gradientEnd: "transparent",
      },
      primary: {
        stroke: "hsl(var(--primary))",
        fill: "hsl(var(--primary))",
        gradientStart: "hsl(var(--primary))",
        gradientEnd: "transparent",
      },
    };

    return colorMap[color];
  }, [color, customColor, isPositive]);

  const gradientId = useMemo(
    () => `sparkline-gradient-${Math.random().toString(36).slice(2)}`,
    []
  );

  if (type === "bar") {
    return (
      <div className={cn("sparkline", className)} style={{ height, width }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            {showGradient && (
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.gradientStart} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={colors.gradientEnd} stopOpacity={0.05} />
                </linearGradient>
              </defs>
            )}
            <Bar
              dataKey="value"
              fill={showGradient ? `url(#${gradientId})` : colors.fill}
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "line") {
    return (
      <div className={cn("sparkline", className)} style={{ height, width }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <YAxis domain={["auto", "auto"]} hide />
            <Line
              type="monotone"
              dataKey="value"
              stroke={colors.stroke}
              strokeWidth={strokeWidth}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className={cn("sparkline", className)} style={{ height, width }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.gradientStart} stopOpacity={0.3} />
              <stop offset="100%" stopColor={colors.gradientEnd} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis domain={["auto", "auto"]} hide />
          <Area
            type="monotone"
            dataKey="value"
            stroke={colors.stroke}
            strokeWidth={strokeWidth}
            fill={showGradient ? `url(#${gradientId})` : "transparent"}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Preset sparkline components
export function PnLSparkline({ 
  data, 
  className 
}: { 
  data: number[]; 
  className?: string;
}) {
  return (
    <Sparkline
      data={data}
      type="area"
      color="custom"
      height={32}
      className={className}
    />
  );
}

export function BalanceSparkline({ 
  data, 
  className 
}: { 
  data: number[]; 
  className?: string;
}) {
  return (
    <Sparkline
      data={data}
      type="area"
      color="green"
      height={48}
      strokeWidth={2}
      className={className}
    />
  );
}

export function TradesSparkline({ 
  data, 
  className 
}: { 
  data: number[]; 
  className?: string;
}) {
  return (
    <Sparkline
      data={data}
      type="bar"
      color="primary"
      height={28}
      showGradient={false}
      className={className}
    />
  );
}
