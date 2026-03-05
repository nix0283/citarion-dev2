"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Zap,
  Target,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Shield,
  Settings2,
  Layers,
  Percent,
  Clock,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Filter,
  Play,
  Pause,
  DollarSign,
  Gauge,
  MoveRight,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ==================== TYPES ====================

export interface CornixFeaturesConfig {
  // 1. First Entry as Market
  firstEntryAsMarket: boolean;
  firstEntryMode: "IMMEDIATE" | "WAIT_ENTRY";
  firstEntryMaxPriceCap: number;
  firstEntryOnlyIfNotDefinedByGroup: boolean;

  // 2. Take-Profit Grace
  tpGraceEnabled: boolean;
  tpGraceCapPercent: number;
  tpGraceMaxRetries: number;
  tpGraceRetryInterval: number;
  tpGraceOnlyIfNotDefinedByGroup: boolean;

  // 3. Trailing Stop-Loss
  trailingEnabled: boolean;
  trailingType: "BREAKEVEN" | "MOVING_TARGET" | "MOVING_2_TARGET" | "PERCENT_BELOW_TRIGGERS" | "PERCENT_BELOW_HIGHEST";
  trailingValue: number;
  trailingTriggerType: "TARGET_REACHED" | "PERCENT_ABOVE_ENTRY";
  trailingTriggerValue: number;
  trailingStopPercent: number;
  trailingOnlyIfNotDefinedByGroup: boolean;

  // 4. Trailing Entry
  trailingEntryEnabled: boolean;
  trailingEntryPercent: number;
  trailingEntryOnlyIfNotDefinedByGroup: boolean;

  // 5. Trailing Take-Profit
  tpTrailingEnabled: boolean;
  tpTrailingPercent: number;
  tpTrailingOnlyIfNotDefinedByGroup: boolean;

  // 6. Entry Strategy
  entryStrategy: "EVENLY_DIVIDED" | "ONE_TARGET" | "TWO_TARGETS" | "THREE_TARGETS" | "FIFTY_ON_FIRST" | "DECREASING_EXP" | "INCREASING_EXP" | "SKIP_FIRST" | "CUSTOM_RATIOS";
  entryWeights: number[];
  entryZoneTargets: number;
  entryOnlyIfNotDefinedByGroup: boolean;

  // 7. Take-Profit Strategy
  tpStrategy: "EVENLY_DIVIDED" | "ONE_TARGET" | "TWO_TARGETS" | "THREE_TARGETS" | "FIFTY_ON_FIRST" | "DECREASING_EXP" | "INCREASING_EXP" | "SKIP_FIRST" | "CUSTOM_RATIOS";
  tpTargetCount: number;
  tpCustomRatios: number[];
  tpOnlyIfNotDefinedByGroup: boolean;

  // 8. Moving Take-Profits
  movingTPEnabled: boolean;

  // 9. Stop-Loss Settings
  defaultStopLoss: number | null;
  slBaseline: "AVERAGE_ENTRIES" | "FIRST_ENTRY";
  slTimeout: number;
  slTimeoutUnit: "SECONDS" | "MINUTES" | "HOURS";
  slOrderType: "MARKET" | "LIMIT";
  slLimitPriceReduction: number;
  slOnlyIfNotDefinedByGroup: boolean;

  // 10. Leverage & Margin
  leverage: number;
  leverageOverride: boolean;
  leverageMode: "EXACTLY" | "UP_TO";
  hedgeMode: boolean;
  marginMode: "ISOLATED" | "CROSSED";
  leverageOnlyIfNotDefinedByGroup: boolean;

  // 11. Direction Filter
  directionFilter: "LONG" | "SHORT" | "BOTH";

  // 12. Close on TP/SL Before Entry
  closeOnTPSLBeforeEntry: boolean;
  closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup: boolean;

  // 13. First Entry Grace
  firstEntryGracePercent: number;

  // 14. Auto-Execute
  autoExecuteEnabled: boolean;
  autoExecuteRequiresConfirmation: boolean;

  // 15. Signal Filters
  ignoreSignalsWithoutSL: boolean;
  ignoreSignalsWithoutTP: boolean;
  minRiskRewardRatio: number | null;
  maxOpenTrades: number;
  minTradeInterval: number;
}

const DEFAULT_CONFIG: CornixFeaturesConfig = {
  firstEntryAsMarket: false,
  firstEntryMode: "WAIT_ENTRY",
  firstEntryMaxPriceCap: 1.0,
  firstEntryOnlyIfNotDefinedByGroup: false,

  tpGraceEnabled: false,
  tpGraceCapPercent: 0.5,
  tpGraceMaxRetries: 3,
  tpGraceRetryInterval: 5,
  tpGraceOnlyIfNotDefinedByGroup: false,

  trailingEnabled: false,
  trailingType: "BREAKEVEN",
  trailingValue: 0,
  trailingTriggerType: "TARGET_REACHED",
  trailingTriggerValue: 1,
  trailingStopPercent: 1,
  trailingOnlyIfNotDefinedByGroup: false,

  trailingEntryEnabled: false,
  trailingEntryPercent: 1.0,
  trailingEntryOnlyIfNotDefinedByGroup: false,

  tpTrailingEnabled: false,
  tpTrailingPercent: 1.0,
  tpTrailingOnlyIfNotDefinedByGroup: false,

  entryStrategy: "EVENLY_DIVIDED",
  entryWeights: [],
  entryZoneTargets: 4,
  entryOnlyIfNotDefinedByGroup: false,

  tpStrategy: "EVENLY_DIVIDED",
  tpTargetCount: 1,
  tpCustomRatios: [],
  tpOnlyIfNotDefinedByGroup: false,

  movingTPEnabled: false,

  defaultStopLoss: null,
  slBaseline: "AVERAGE_ENTRIES",
  slTimeout: 0,
  slTimeoutUnit: "SECONDS",
  slOrderType: "MARKET",
  slLimitPriceReduction: 2.0,
  slOnlyIfNotDefinedByGroup: false,

  leverage: 1,
  leverageOverride: false,
  leverageMode: "EXACTLY",
  hedgeMode: false,
  marginMode: "ISOLATED",
  leverageOnlyIfNotDefinedByGroup: false,

  directionFilter: "BOTH",

  closeOnTPSLBeforeEntry: true,
  closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup: false,

  firstEntryGracePercent: 0,

  autoExecuteEnabled: false,
  autoExecuteRequiresConfirmation: true,

  ignoreSignalsWithoutSL: false,
  ignoreSignalsWithoutTP: false,
  minRiskRewardRatio: null,
  maxOpenTrades: 5,
  minTradeInterval: 5,
};

// ==================== FEATURE INFO ====================

const FEATURE_INFO = {
  firstEntryAsMarket: {
    name: "First Entry as Market",
    description: "Execute first entry with market-like behavior while protecting against overpaying",
    icon: Zap,
    color: "text-yellow-500",
  },
  tpGrace: {
    name: "Take-Profit Grace",
    description: "Retry partially/unfilled TP orders at adjusted prices",
    icon: Target,
    color: "text-green-500",
  },
  trailingStop: {
    name: "Trailing Stop-Loss",
    description: "Move stop-loss to protect profits as trade becomes profitable",
    icon: TrendingUp,
    color: "text-blue-500",
  },
  trailingEntry: {
    name: "Trailing Entry",
    description: "Create trailing order that follows price before entry",
    icon: ArrowUpDown,
    color: "text-purple-500",
  },
  trailingTP: {
    name: "Trailing Take-Profit",
    description: "Trail TP behind maximum price to capture more upside",
    icon: TrendingDown,
    color: "text-cyan-500",
  },
  entryStrategy: {
    name: "Entry Strategy",
    description: "Define how position is built across multiple entry points",
    icon: Layers,
    color: "text-orange-500",
  },
  tpStrategy: {
    name: "Take-Profit Strategy",
    description: "Define how profits are taken across multiple targets",
    icon: Target,
    color: "text-emerald-500",
  },
  movingTP: {
    name: "Moving Take-Profits",
    description: "Dynamically adjust TP targets based on price action",
    icon: MoveRight,
    color: "text-teal-500",
  },
  stopLoss: {
    name: "Stop-Loss Settings",
    description: "Configure stop-loss behavior",
    icon: Shield,
    color: "text-red-500",
  },
  leverageMargin: {
    name: "Leverage & Margin",
    description: "Configure leverage and margin mode",
    icon: Gauge,
    color: "text-indigo-500",
  },
  directionFilter: {
    name: "Direction Filter",
    description: "Filter signals by direction",
    icon: Filter,
    color: "text-pink-500",
  },
  closeOnTPSL: {
    name: "Close on TP/SL Before Entry",
    description: "Close position if TP or SL reached before all entries complete",
    icon: AlertCircle,
    color: "text-amber-500",
  },
  firstEntryGrace: {
    name: "First Entry Grace",
    description: "Allow entry within % of signal entry price",
    icon: Percent,
    color: "text-lime-500",
  },
  autoExecute: {
    name: "Auto-Execute",
    description: "Automatically execute signals without confirmation",
    icon: Play,
    color: "text-violet-500",
  },
  signalFilters: {
    name: "Signal Filters",
    description: "Filter signals before execution",
    icon: Filter,
    color: "text-rose-500",
  },
};

// ==================== SUB-COMPONENTS ====================

interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
  showFallback?: boolean;
  fallbackEnabled?: boolean;
  onFallbackToggle?: (enabled: boolean) => void;
}

function FeatureCard({
  title,
  description,
  icon: Icon,
  color,
  enabled,
  onToggle,
  children,
  showFallback,
  fallbackEnabled,
  onFallbackToggle,
}: FeatureCardProps) {
  return (
    <Card className={cn(
      "transition-all duration-200",
      enabled && "border-primary/30 bg-primary/5"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg bg-muted", color)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">{title}</CardTitle>
              <CardDescription className="text-xs">{description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showFallback && enabled && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground">Fallback</Label>
                      <Switch
                        checked={fallbackEnabled || false}
                        onCheckedChange={onFallbackToggle}
                        className="scale-75"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Use only if not defined by signal/group</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Switch checked={enabled} onCheckedChange={onToggle} />
          </div>
        </div>
      </CardHeader>
      {enabled && (
        <CardContent className="pt-0">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// ==================== MAIN COMPONENT ====================

interface CornixFeaturesPanelProps {
  config?: Partial<CornixFeaturesConfig>;
  onChange?: (config: CornixFeaturesConfig) => void;
  direction?: "LONG" | "SHORT";
}

export function CornixFeaturesPanel({
  config: initialConfig,
  onChange,
  direction = "LONG",
}: CornixFeaturesPanelProps) {
  const [config, setConfig] = useState<CornixFeaturesConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const updateConfig = <K extends keyof CornixFeaturesConfig>(
    key: K,
    value: CornixFeaturesConfig[K]
  ) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    onChange?.(newConfig);
  };

  const getActiveFeaturesCount = () => {
    let count = 0;
    if (config.firstEntryAsMarket) count++;
    if (config.tpGraceEnabled) count++;
    if (config.trailingEnabled) count++;
    if (config.trailingEntryEnabled) count++;
    if (config.tpTrailingEnabled) count++;
    if (config.movingTPEnabled) count++;
    if (config.autoExecuteEnabled) count++;
    if (config.defaultStopLoss !== null) count++;
    if (config.directionFilter !== "BOTH") count++;
    if (config.firstEntryGracePercent > 0) count++;
    if (config.ignoreSignalsWithoutSL || config.ignoreSignalsWithoutTP) count++;
    if (config.closeOnTPSLBeforeEntry) count++;
    if (config.leverageOverride) count++;
    if (config.entryStrategy !== "EVENLY_DIVIDED") count++;
    if (config.tpStrategy !== "EVENLY_DIVIDED") count++;
    return count;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Cornix Auto-Trading Features
          </h3>
          <p className="text-sm text-muted-foreground">
            15 features from Cornix specification
          </p>
        </div>
        <Badge variant="outline" className="text-primary">
          {getActiveFeaturesCount()} / 15 active
        </Badge>
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Feature utilization</span>
          <span>{Math.round((getActiveFeaturesCount() / 15) * 100)}%</span>
        </div>
        <Progress value={(getActiveFeaturesCount() / 15) * 100} className="h-2" />
      </div>

      {/* Features Grid */}
      <ScrollArea className="h-[calc(100vh-300px)]">
        <div className="space-y-4 pr-4">
          {/* 1. First Entry as Market */}
          <FeatureCard
            {...FEATURE_INFO.firstEntryAsMarket}
            enabled={config.firstEntryAsMarket}
            onToggle={(v) => updateConfig("firstEntryAsMarket", v)}
            showFallback
            fallbackEnabled={config.firstEntryOnlyIfNotDefinedByGroup}
            onFallbackToggle={(v) => updateConfig("firstEntryOnlyIfNotDefinedByGroup", v)}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Activation Mode</Label>
                  <Select
                    value={config.firstEntryMode}
                    onValueChange={(v) => updateConfig("firstEntryMode", v as typeof config.firstEntryMode)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IMMEDIATE">Immediately</SelectItem>
                      <SelectItem value="WAIT_ENTRY">Entry Price Reached</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Max Price Cap (%)</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[config.firstEntryMaxPriceCap]}
                      onValueChange={([v]) => updateConfig("firstEntryMaxPriceCap", v)}
                      min={0.05}
                      max={20}
                      step={0.05}
                      className="flex-1"
                    />
                    <Badge variant="outline" className="font-mono text-xs">
                      {config.firstEntryMaxPriceCap.toFixed(2)}%
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="p-2 rounded bg-muted/50 text-xs text-muted-foreground">
                <Info className="h-3 w-3 inline mr-1" />
                For {direction}: Cap is {direction === "LONG" ? "above" : "below"} entry price.
                Iteratively adjusts by 0.1% until filled.
              </div>
            </div>
          </FeatureCard>

          {/* 2. Take-Profit Grace */}
          <FeatureCard
            {...FEATURE_INFO.tpGrace}
            enabled={config.tpGraceEnabled}
            onToggle={(v) => updateConfig("tpGraceEnabled", v)}
            showFallback
            fallbackEnabled={config.tpGraceOnlyIfNotDefinedByGroup}
            onFallbackToggle={(v) => updateConfig("tpGraceOnlyIfNotDefinedByGroup", v)}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Cap %</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="2"
                    value={config.tpGraceCapPercent}
                    onChange={(e) => updateConfig("tpGraceCapPercent", parseFloat(e.target.value) || 0.5)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Max Retries</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={config.tpGraceMaxRetries}
                    onChange={(e) => updateConfig("tpGraceMaxRetries", parseInt(e.target.value) || 3)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Interval (sec)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    value={config.tpGraceRetryInterval}
                    onChange={(e) => updateConfig("tpGraceRetryInterval", parseInt(e.target.value) || 5)}
                    className="h-8"
                  />
                </div>
              </div>
              <div className="p-2 rounded bg-muted/50 text-xs text-muted-foreground">
                <Info className="h-3 w-3 inline mr-1" />
                For {direction}: {direction === "LONG" ? "Lowers" : "Raises"} TP price on each retry.
              </div>
            </div>
          </FeatureCard>

          {/* 3. Trailing Stop-Loss */}
          <FeatureCard
            {...FEATURE_INFO.trailingStop}
            enabled={config.trailingEnabled}
            onToggle={(v) => updateConfig("trailingEnabled", v)}
            showFallback
            fallbackEnabled={config.trailingOnlyIfNotDefinedByGroup}
            onFallbackToggle={(v) => updateConfig("trailingOnlyIfNotDefinedByGroup", v)}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Trailing Type</Label>
                  <Select
                    value={config.trailingType}
                    onValueChange={(v) => updateConfig("trailingType", v as typeof config.trailingType)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BREAKEVEN">Breakeven</SelectItem>
                      <SelectItem value="MOVING_TARGET">Moving Target</SelectItem>
                      <SelectItem value="MOVING_2_TARGET">Moving 2-Target</SelectItem>
                      <SelectItem value="PERCENT_BELOW_TRIGGERS">% Below Triggers</SelectItem>
                      <SelectItem value="PERCENT_BELOW_HIGHEST">% Below Highest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Trigger Type</Label>
                  <Select
                    value={config.trailingTriggerType}
                    onValueChange={(v) => updateConfig("trailingTriggerType", v as typeof config.trailingTriggerType)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TARGET_REACHED">Target Reached</SelectItem>
                      <SelectItem value="PERCENT_ABOVE_ENTRY">% Above Entry</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {config.trailingType !== "BREAKEVEN" && (
                <div className="space-y-2">
                  <Label className="text-xs">Stop Distance (%)</Label>
                  <Slider
                    value={[config.trailingStopPercent]}
                    onValueChange={([v]) => updateConfig("trailingStopPercent", v)}
                    min={0.1}
                    max={10}
                    step={0.1}
                  />
                </div>
              )}
            </div>
          </FeatureCard>

          {/* 4. Trailing Entry */}
          <FeatureCard
            {...FEATURE_INFO.trailingEntry}
            enabled={config.trailingEntryEnabled}
            onToggle={(v) => updateConfig("trailingEntryEnabled", v)}
            showFallback
            fallbackEnabled={config.trailingEntryOnlyIfNotDefinedByGroup}
            onFallbackToggle={(v) => updateConfig("trailingEntryOnlyIfNotDefinedByGroup", v)}
          >
            <div className="space-y-2">
              <Label className="text-xs">Trail Percentage</Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[config.trailingEntryPercent]}
                  onValueChange={([v]) => updateConfig("trailingEntryPercent", v)}
                  min={0.1}
                  max={5}
                  step={0.1}
                  className="flex-1"
                />
                <Badge variant="outline" className="font-mono text-xs">
                  {config.trailingEntryPercent.toFixed(1)}%
                </Badge>
              </div>
            </div>
          </FeatureCard>

          {/* 5. Trailing Take-Profit */}
          <FeatureCard
            {...FEATURE_INFO.trailingTP}
            enabled={config.tpTrailingEnabled}
            onToggle={(v) => updateConfig("tpTrailingEnabled", v)}
            showFallback
            fallbackEnabled={config.tpTrailingOnlyIfNotDefinedByGroup}
            onFallbackToggle={(v) => updateConfig("tpTrailingOnlyIfNotDefinedByGroup", v)}
          >
            <div className="space-y-2">
              <Label className="text-xs">Trail Behind Max Price (%)</Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[config.tpTrailingPercent]}
                  onValueChange={([v]) => updateConfig("tpTrailingPercent", v)}
                  min={0.1}
                  max={5}
                  step={0.1}
                  className="flex-1"
                />
                <Badge variant="outline" className="font-mono text-xs">
                  {config.tpTrailingPercent.toFixed(1)}%
                </Badge>
              </div>
            </div>
          </FeatureCard>

          {/* 6 & 7. Entry & TP Strategy */}
          <div className="grid grid-cols-2 gap-4">
            <FeatureCard
              {...FEATURE_INFO.entryStrategy}
              enabled={true}
              onToggle={() => {}}
            >
              <div className="space-y-2">
                <Select
                  value={config.entryStrategy}
                  onValueChange={(v) => updateConfig("entryStrategy", v as typeof config.entryStrategy)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EVENLY_DIVIDED">Evenly Divided</SelectItem>
                    <SelectItem value="ONE_TARGET">One Target</SelectItem>
                    <SelectItem value="TWO_TARGETS">Two Targets</SelectItem>
                    <SelectItem value="THREE_TARGETS">Three Targets</SelectItem>
                    <SelectItem value="FIFTY_ON_FIRST">50% on First</SelectItem>
                    <SelectItem value="DECREASING_EXP">Decreasing Exp</SelectItem>
                    <SelectItem value="INCREASING_EXP">Increasing Exp</SelectItem>
                    <SelectItem value="SKIP_FIRST">Skip First</SelectItem>
                    <SelectItem value="CUSTOM_RATIOS">Custom Ratios</SelectItem>
                  </SelectContent>
                </Select>
                <div className="space-y-1">
                  <Label className="text-xs">Zone Targets: {config.entryZoneTargets}</Label>
                  <Slider
                    value={[config.entryZoneTargets]}
                    onValueChange={([v]) => updateConfig("entryZoneTargets", v)}
                    min={1}
                    max={10}
                    step={1}
                  />
                </div>
              </div>
            </FeatureCard>

            <FeatureCard
              {...FEATURE_INFO.tpStrategy}
              enabled={true}
              onToggle={() => {}}
            >
              <div className="space-y-2">
                <Select
                  value={config.tpStrategy}
                  onValueChange={(v) => updateConfig("tpStrategy", v as typeof config.tpStrategy)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EVENLY_DIVIDED">Evenly Divided</SelectItem>
                    <SelectItem value="ONE_TARGET">One Target</SelectItem>
                    <SelectItem value="TWO_TARGETS">Two Targets</SelectItem>
                    <SelectItem value="THREE_TARGETS">Three Targets</SelectItem>
                    <SelectItem value="FIFTY_ON_FIRST">50% on First</SelectItem>
                    <SelectItem value="DECREASING_EXP">Decreasing Exp</SelectItem>
                    <SelectItem value="INCREASING_EXP">Increasing Exp</SelectItem>
                    <SelectItem value="SKIP_FIRST">Skip First</SelectItem>
                    <SelectItem value="CUSTOM_RATIOS">Custom Ratios</SelectItem>
                  </SelectContent>
                </Select>
                <div className="space-y-1">
                  <Label className="text-xs">TP Targets: {config.tpTargetCount}</Label>
                  <Slider
                    value={[config.tpTargetCount]}
                    onValueChange={([v]) => updateConfig("tpTargetCount", v)}
                    min={1}
                    max={10}
                    step={1}
                  />
                </div>
              </div>
            </FeatureCard>
          </div>

          {/* 8. Moving TP */}
          <FeatureCard
            {...FEATURE_INFO.movingTP}
            enabled={config.movingTPEnabled}
            onToggle={(v) => updateConfig("movingTPEnabled", v)}
          >
            <div className="p-2 rounded bg-muted/50 text-xs text-muted-foreground">
              <Info className="h-3 w-3 inline mr-1" />
              Automatically moves remaining TP targets when earlier ones are hit.
            </div>
          </FeatureCard>

          {/* 9. Stop-Loss Settings */}
          <FeatureCard
            {...FEATURE_INFO.stopLoss}
            enabled={config.defaultStopLoss !== null}
            onToggle={(v) => updateConfig("defaultStopLoss", v ? 15 : null)}
            showFallback
            fallbackEnabled={config.slOnlyIfNotDefinedByGroup}
            onFallbackToggle={(v) => updateConfig("slOnlyIfNotDefinedByGroup", v)}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">SL %</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={config.defaultStopLoss || ""}
                    onChange={(e) => updateConfig("defaultStopLoss", parseFloat(e.target.value) || null)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Baseline</Label>
                  <Select
                    value={config.slBaseline}
                    onValueChange={(v) => updateConfig("slBaseline", v as typeof config.slBaseline)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AVERAGE_ENTRIES">Average Entries</SelectItem>
                      <SelectItem value="FIRST_ENTRY">First Entry</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Timeout</Label>
                  <Input
                    type="number"
                    min="0"
                    value={config.slTimeout}
                    onChange={(e) => updateConfig("slTimeout", parseInt(e.target.value) || 0)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Unit</Label>
                  <Select
                    value={config.slTimeoutUnit}
                    onValueChange={(v) => updateConfig("slTimeoutUnit", v as typeof config.slTimeoutUnit)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SECONDS">Seconds</SelectItem>
                      <SelectItem value="MINUTES">Minutes</SelectItem>
                      <SelectItem value="HOURS">Hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Order Type</Label>
                  <Select
                    value={config.slOrderType}
                    onValueChange={(v) => updateConfig("slOrderType", v as typeof config.slOrderType)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MARKET">Market</SelectItem>
                      <SelectItem value="LIMIT">Limit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </FeatureCard>

          {/* 10. Leverage & Margin */}
          <FeatureCard
            {...FEATURE_INFO.leverageMargin}
            enabled={config.leverageOverride}
            onToggle={(v) => updateConfig("leverageOverride", v)}
            showFallback
            fallbackEnabled={config.leverageOnlyIfNotDefinedByGroup}
            onFallbackToggle={(v) => updateConfig("leverageOnlyIfNotDefinedByGroup", v)}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Leverage: {config.leverage}x</Label>
                  <Slider
                    value={[config.leverage]}
                    onValueChange={([v]) => updateConfig("leverage", v)}
                    min={1}
                    max={125}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Mode</Label>
                  <Select
                    value={config.leverageMode}
                    onValueChange={(v) => updateConfig("leverageMode", v as typeof config.leverageMode)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EXACTLY">Exactly</SelectItem>
                      <SelectItem value="UP_TO">Up To</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Margin</Label>
                  <Select
                    value={config.marginMode}
                    onValueChange={(v) => updateConfig("marginMode", v as typeof config.marginMode)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ISOLATED">Isolated</SelectItem>
                      <SelectItem value="CROSSED">Crossed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                <Label className="text-xs">Hedge Mode</Label>
                <Switch
                  checked={config.hedgeMode}
                  onCheckedChange={(v) => updateConfig("hedgeMode", v)}
                />
              </div>
            </div>
          </FeatureCard>

          {/* 11. Direction Filter */}
          <FeatureCard
            {...FEATURE_INFO.directionFilter}
            enabled={config.directionFilter !== "BOTH"}
            onToggle={(v) => updateConfig("directionFilter", v ? direction : "BOTH")}
          >
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={config.directionFilter === "LONG" ? "default" : "outline"}
                className={cn(
                  config.directionFilter === "LONG" && "bg-[#0ECB81] hover:bg-[#0ECB81]/90"
                )}
                onClick={() => updateConfig("directionFilter", "LONG")}
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                LONG Only
              </Button>
              <Button
                variant={config.directionFilter === "SHORT" ? "default" : "outline"}
                className={cn(
                  config.directionFilter === "SHORT" && "bg-[#F6465D] hover:bg-[#F6465D]/90"
                )}
                onClick={() => updateConfig("directionFilter", "SHORT")}
              >
                <TrendingDown className="h-4 w-4 mr-2" />
                SHORT Only
              </Button>
            </div>
          </FeatureCard>

          {/* 12. Close on TP/SL Before Entry */}
          <FeatureCard
            {...FEATURE_INFO.closeOnTPSL}
            enabled={config.closeOnTPSLBeforeEntry}
            onToggle={(v) => updateConfig("closeOnTPSLBeforeEntry", v)}
            showFallback
            fallbackEnabled={config.closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup}
            onFallbackToggle={(v) => updateConfig("closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup", v)}
          >
            <div className="p-2 rounded bg-muted/50 text-xs text-muted-foreground">
              <Info className="h-3 w-3 inline mr-1" />
              Close position if TP or SL is reached before all entries complete.
            </div>
          </FeatureCard>

          {/* 13. First Entry Grace */}
          <FeatureCard
            {...FEATURE_INFO.firstEntryGrace}
            enabled={config.firstEntryGracePercent > 0}
            onToggle={(v) => updateConfig("firstEntryGracePercent", v ? 0.5 : 0)}
          >
            <div className="space-y-2">
              <Label className="text-xs">Grace Percentage</Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[config.firstEntryGracePercent]}
                  onValueChange={([v]) => updateConfig("firstEntryGracePercent", v)}
                  min={0.01}
                  max={5}
                  step={0.01}
                  className="flex-1"
                />
                <Badge variant="outline" className="font-mono text-xs">
                  {config.firstEntryGracePercent.toFixed(2)}%
                </Badge>
              </div>
            </div>
          </FeatureCard>

          {/* 14. Auto-Execute */}
          <FeatureCard
            {...FEATURE_INFO.autoExecute}
            enabled={config.autoExecuteEnabled}
            onToggle={(v) => updateConfig("autoExecuteEnabled", v)}
          >
            <div className="flex items-center justify-between p-2 rounded bg-muted/50">
              <Label className="text-xs">Require Confirmation</Label>
              <Switch
                checked={config.autoExecuteRequiresConfirmation}
                onCheckedChange={(v) => updateConfig("autoExecuteRequiresConfirmation", v)}
              />
            </div>
          </FeatureCard>

          {/* 15. Signal Filters */}
          <FeatureCard
            {...FEATURE_INFO.signalFilters}
            enabled={config.ignoreSignalsWithoutSL || config.ignoreSignalsWithoutTP}
            onToggle={(v) => {
              updateConfig("ignoreSignalsWithoutSL", v);
              updateConfig("ignoreSignalsWithoutTP", v);
            }}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                  <Label className="text-xs">Require SL</Label>
                  <Switch
                    checked={config.ignoreSignalsWithoutSL}
                    onCheckedChange={(v) => updateConfig("ignoreSignalsWithoutSL", v)}
                  />
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                  <Label className="text-xs">Require TP</Label>
                  <Switch
                    checked={config.ignoreSignalsWithoutTP}
                    onCheckedChange={(v) => updateConfig("ignoreSignalsWithoutTP", v)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Min R:R</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={config.minRiskRewardRatio || ""}
                    onChange={(e) => updateConfig("minRiskRewardRatio", parseFloat(e.target.value) || null)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Max Trades</Label>
                  <Input
                    type="number"
                    min="1"
                    value={config.maxOpenTrades}
                    onChange={(e) => updateConfig("maxOpenTrades", parseInt(e.target.value) || 5)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Interval (min)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={config.minTradeInterval}
                    onChange={(e) => updateConfig("minTradeInterval", parseInt(e.target.value) || 5)}
                    className="h-8"
                  />
                </div>
              </div>
            </div>
          </FeatureCard>
        </div>
      </ScrollArea>

      {/* Summary */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Active Features</span>
            <div className="flex gap-1 flex-wrap">
              {config.firstEntryAsMarket && (
                <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 text-xs">
                  First Entry
                </Badge>
              )}
              {config.tpGraceEnabled && (
                <Badge variant="outline" className="text-green-500 border-green-500/30 text-xs">
                  TP Grace
                </Badge>
              )}
              {config.trailingEnabled && (
                <Badge variant="outline" className="text-blue-500 border-blue-500/30 text-xs">
                  Trailing SL
                </Badge>
              )}
              {config.trailingEntryEnabled && (
                <Badge variant="outline" className="text-purple-500 border-purple-500/30 text-xs">
                  Trailing Entry
                </Badge>
              )}
              {config.tpTrailingEnabled && (
                <Badge variant="outline" className="text-cyan-500 border-cyan-500/30 text-xs">
                  Trailing TP
                </Badge>
              )}
              {config.movingTPEnabled && (
                <Badge variant="outline" className="text-teal-500 border-teal-500/30 text-xs">
                  Moving TP
                </Badge>
              )}
              {config.autoExecuteEnabled && (
                <Badge variant="outline" className="text-violet-500 border-violet-500/30 text-xs">
                  Auto-Exec
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CornixFeaturesPanel;
