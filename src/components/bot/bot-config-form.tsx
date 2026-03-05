"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DollarSign,
  TrendingUp,
  Target,
  Shield,
  Filter,
  Zap,
  Bell,
  Save,
  RotateCcw,
  Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Types for bot configuration
interface BotConfigData {
  // General
  tradeAmount: number;
  amountType: "FIXED" | "PERCENTAGE";
  amountOverride: boolean;
  closeOnTPSLBeforeEntry: boolean;
  firstEntryGracePercent: number;
  
  // First Entry as Market
  firstEntryMode: "IMMEDIATE" | "WAIT_ENTRY";
  firstEntryMaxPriceCap: number;
  firstEntryAsMarket: boolean;
  
  // Trailing
  trailingEnabled: boolean;
  trailingType: "BREAKEVEN" | "MOVING_TARGET" | "MOVING_2_TARGET" | "PERCENT_BELOW_HIGHEST";
  trailingTriggerType: "TARGET_REACHED" | "PERCENT_ABOVE_ENTRY";
  trailingTriggerValue: number;
  trailingStopPercent: number;
  
  // Entry Strategy
  entryStrategy: "EVENLY_DIVIDED" | "CUSTOM_RATIOS" | "DECREASING_EXP" | "INCREASING_EXP";
  entryWeights: number[];
  entryZoneTargets: number;
  
  // Take-Profit
  tpStrategy: "ONE_TARGET" | "MULTIPLE_TARGETS" | "ALL_TARGETS";
  tpTargetCount: number;
  tpCustomRatios: number[];
  
  // Take-Profit Grace
  tpGraceEnabled: boolean;
  tpGraceCapPercent: number;
  tpGraceMaxRetries: number;
  
  // Stop-Loss
  defaultStopLoss: number | null;
  slTimeout: number;
  slTimeoutUnit: "SECONDS" | "MINUTES" | "HOURS";
  slOrderType: "MARKET" | "LIMIT";
  
  // Margin
  leverage: number;
  leverageOverride: boolean;
  hedgeMode: boolean;
  marginMode: "ISOLATED" | "CROSSED";
  
  // Filters
  maxOpenTrades: number;
  minTradeInterval: number;
  blacklistedSymbols: string[];
  
  // Fee Settings (Customizable)
  useCustomFees: boolean;
  spotMakerFee: number;      // 0.001 = 0.1%
  spotTakerFee: number;      // 0.001 = 0.1%
  futuresMakerFee: number;   // 0.0002 = 0.02%
  futuresTakerFee: number;   // 0.0004 = 0.04%
  slippagePercent: number;   // 0.0005 = 0.05%
  
  // Notifications
  notifyOnEntry: boolean;
  notifyOnExit: boolean;
  notifyOnSL: boolean;
  notifyOnTP: boolean;
  notifyOnError: boolean;
}

const DEFAULT_CONFIG: BotConfigData = {
  tradeAmount: 100,
  amountType: "FIXED",
  amountOverride: false,
  closeOnTPSLBeforeEntry: true,
  firstEntryGracePercent: 0,
  
  // First Entry as Market
  firstEntryMode: "WAIT_ENTRY",
  firstEntryMaxPriceCap: 0.5,
  firstEntryAsMarket: false,
  
  trailingEnabled: false,
  trailingType: "BREAKEVEN",
  trailingTriggerType: "TARGET_REACHED",
  trailingTriggerValue: 2,
  trailingStopPercent: 1,
  
  entryStrategy: "EVENLY_DIVIDED",
  entryWeights: [],
  entryZoneTargets: 1,
  
  tpStrategy: "ONE_TARGET",
  tpTargetCount: 1,
  tpCustomRatios: [],
  
  // Take-Profit Grace
  tpGraceEnabled: false,
  tpGraceCapPercent: 0.5,
  tpGraceMaxRetries: 3,
  
  defaultStopLoss: 15,
  slTimeout: 0,
  slTimeoutUnit: "MINUTES",
  slOrderType: "MARKET",
  
  leverage: 10,
  leverageOverride: false,
  hedgeMode: false,
  marginMode: "ISOLATED",
  
  maxOpenTrades: 5,
  minTradeInterval: 5,
  blacklistedSymbols: [],
  
  // Fee Settings (Default values)
  useCustomFees: false,
  spotMakerFee: 0.001,       // 0.1%
  spotTakerFee: 0.001,       // 0.1%
  futuresMakerFee: 0.0002,   // 0.02%
  futuresTakerFee: 0.0004,   // 0.04%
  slippagePercent: 0.0005,   // 0.05%
  
  notifyOnEntry: true,
  notifyOnExit: true,
  notifyOnSL: true,
  notifyOnTP: true,
  notifyOnError: true,
};

export function BotConfigForm() {
  const [config, setConfig] = useState<BotConfigData>(DEFAULT_CONFIG);
  const [hasChanges, setHasChanges] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const updateConfig = <K extends keyof BotConfigData>(key: K, value: BotConfigData[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      toast.success("Настройки бота сохранены");
      setHasChanges(false);
    } catch {
      toast.error("Ошибка при сохранении");
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    setHasChanges(false);
    setShowResetDialog(false);
    toast.info("Настройки сброшены");
  };

  return (
    <div className="space-y-4">
      {/* Header with Save Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Конфигурация бота</h2>
          <p className="text-sm text-muted-foreground">
            Настройте параметры автоматической торговли
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-amber-500 border-amber-500/30">
              Несохранённые изменения
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowResetDialog(true)}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Сбросить
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges}>
            <Save className="h-4 w-4 mr-1" />
            Сохранить
          </Button>
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["general", "trailing", "strategies", "stoploss", "filters", "margin", "fees"]} className="space-y-4">
        
        {/* ==================== GENERAL SETTINGS ==================== */}
        <AccordionItem value="general" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <span className="font-medium">General (Общие настройки)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Amount per Trade */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Amount per Trade</Label>
                  <Select
                    value={config.amountType}
                    onValueChange={(v) => updateConfig("amountType", v as "FIXED" | "PERCENTAGE")}
                  >
                    <SelectTrigger className="w-[140px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED">Fixed (USDT)</SelectItem>
                      <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    value={config.tradeAmount}
                    onChange={(e) => updateConfig("tradeAmount", parseFloat(e.target.value))}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">
                    {config.amountType === "PERCENTAGE" ? "% от баланса" : "USDT"}
                  </span>
                </div>
                
                {/* Override Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div>
                    <p className="text-sm font-medium">Override</p>
                    <p className="text-xs text-muted-foreground">
                      Использовать вашу настройку вместо сигнала канала
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className={cn("text-xs", !config.amountOverride && "text-muted-foreground")}>
                      No
                    </Label>
                    <Switch
                      checked={config.amountOverride}
                      onCheckedChange={(v) => updateConfig("amountOverride", v)}
                    />
                    <Label className={cn("text-xs", config.amountOverride && "text-primary")}>
                      Yes
                    </Label>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Close Trade on TP/SL before Entry */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Close Trade on TP/SL before Entry</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Автоматически закрывать сделку при достижении TP/SL без входа
                  </p>
                </div>
                <Switch
                  checked={config.closeOnTPSLBeforeEntry}
                  onCheckedChange={(v) => updateConfig("closeOnTPSLBeforeEntry", v)}
                />
              </div>

              <Separator />

              {/* First Entry Grace Percentage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">First Entry Grace Percentage</Label>
                  <Badge variant="outline" className="text-xs">
                    {config.firstEntryGracePercent === 0 ? "Disabled" : `${config.firstEntryGracePercent}%`}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Расширяет диапазон цены первого входа для увеличения вероятности исполнения
                </p>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[config.firstEntryGracePercent]}
                    onValueChange={([v]) => updateConfig("firstEntryGracePercent", v)}
                    max={5}
                    min={0}
                    step={0.01}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono w-12 text-right">
                    {config.firstEntryGracePercent}%
                  </span>
                </div>
              </div>

              <Separator />

              {/* First Entry as Market */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">First Entry as Market</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Использовать лимитные ордера для имитации рыночного входа с защитой цены
                    </p>
                  </div>
                  <Switch
                    checked={config.firstEntryAsMarket}
                    onCheckedChange={(v) => updateConfig("firstEntryAsMarket", v)}
                  />
                </div>

                {config.firstEntryAsMarket && (
                  <div className="space-y-4 p-4 rounded-lg bg-secondary/30 border border-primary/10">
                    {/* Entry Mode */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Режим входа</Label>
                      <p className="text-xs text-muted-foreground">
                        Когда исполнять первый вход
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => updateConfig("firstEntryMode", "IMMEDIATE")}
                          className={cn(
                            "p-3 rounded-lg border text-left transition-colors",
                            config.firstEntryMode === "IMMEDIATE"
                              ? "border-[#0ECB81] bg-[#0ECB81]/10"
                              : "border-border hover:bg-secondary/50"
                          )}
                        >
                          <p className="font-medium text-sm text-[#0ECB81]">Immediate</p>
                          <p className="text-xs text-muted-foreground">
                            Войти немедленно по текущей цене
                          </p>
                        </button>
                        <button
                          onClick={() => updateConfig("firstEntryMode", "WAIT_ENTRY")}
                          className={cn(
                            "p-3 rounded-lg border text-left transition-colors",
                            config.firstEntryMode === "WAIT_ENTRY"
                              ? "border-[#0ECB81] bg-[#0ECB81]/10"
                              : "border-border hover:bg-secondary/50"
                          )}
                        >
                          <p className="font-medium text-sm text-[#0ECB81]">Wait for Entry</p>
                          <p className="text-xs text-muted-foreground">
                            Ждать достижения цены входа из сигнала
                          </p>
                        </button>
                      </div>
                    </div>

                    {/* Max Price Cap */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Maximum Entry Price Cap</Label>
                        <Badge variant="outline" className="text-xs text-[#0ECB81] border-[#0ECB81]/30">
                          {config.firstEntryMaxPriceCap}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Макс. % выше цены входа, при котором будет заполнен ордер
                      </p>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[config.firstEntryMaxPriceCap]}
                          onValueChange={([v]) => updateConfig("firstEntryMaxPriceCap", v)}
                          max={5}
                          min={0.01}
                          step={0.01}
                          className="flex-1"
                        />
                        <span className="text-sm font-mono w-12 text-right">
                          {config.firstEntryMaxPriceCap}%
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#0ECB81]/5 border border-[#0ECB81]/20">
                      <p className="text-xs text-muted-foreground">
                        <span className="text-[#0ECB81] font-medium">ℹ️ Note:</span> First Entry as Market использует лимитные ордера для имитации рыночного поведения, гарантируя что вы не войдёте выше установленного капа и не купите выше цены TP на первом входе.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== TRAILING SETTINGS ==================== */}
        <AccordionItem value="trailing" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="font-medium">Trailing (Трейлинг)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Trailing Enable */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Включить Trailing Stop</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Стоп-лосс будет перемещаться вслед за ценой
                  </p>
                </div>
                <Switch
                  checked={config.trailingEnabled}
                  onCheckedChange={(v) => updateConfig("trailingEnabled", v)}
                />
              </div>

              {config.trailingEnabled && (
                <>
                  <Separator />
                  
                  {/* Trailing Type */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Тип трейлинга</Label>
                    <Select
                      value={config.trailingType}
                      onValueChange={(v) => updateConfig("trailingType", v as BotConfigData["trailingType"])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BREAKEVEN">Breakeven (Безубыток)</SelectItem>
                        <SelectItem value="MOVING_TARGET">Moving Target</SelectItem>
                        <SelectItem value="MOVING_2_TARGET">Moving 2-Target</SelectItem>
                        <SelectItem value="PERCENT_BELOW_HIGHEST">Percent Below Highest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Trigger Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Условие активации</Label>
                      <Select
                        value={config.trailingTriggerType}
                        onValueChange={(v) => updateConfig("trailingTriggerType", v as BotConfigData["trailingTriggerType"])}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TARGET_REACHED">Target достигнут</SelectItem>
                          <SelectItem value="PERCENT_ABOVE_ENTRY">% выше входа</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Значение триггера</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={config.trailingTriggerValue}
                          onChange={(e) => updateConfig("trailingTriggerValue", parseFloat(e.target.value))}
                          className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">
                          {config.trailingTriggerType === "TARGET_REACHED" ? "Target #" : "%"}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== STRATEGIES ==================== */}
        <AccordionItem value="strategies" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <span className="font-medium">Strategies (Стратегии)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Entry Zone Targets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Entry Zone - Number of Targets</Label>
                  <Badge variant="outline">{config.entryZoneTargets}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  На сколько частей разделить зону входа
                </p>
                <Slider
                  value={[config.entryZoneTargets]}
                  onValueChange={([v]) => updateConfig("entryZoneTargets", v)}
                  max={10}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>

              <Separator />

              {/* Entry Strategy */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Entry Strategy</Label>
                <p className="text-xs text-muted-foreground">
                  Распределение объема между ордерами входа
                </p>
                <Select
                  value={config.entryStrategy}
                  onValueChange={(v) => updateConfig("entryStrategy", v as BotConfigData["entryStrategy"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EVENLY_DIVIDED">Evenly Divided (Равномерно)</SelectItem>
                    <SelectItem value="CUSTOM_RATIOS">Custom Ratios (10-3-5-7...)</SelectItem>
                    <SelectItem value="DECREASING_EXP">Decreasing Exponential</SelectItem>
                    <SelectItem value="INCREASING_EXP">Increasing Exponential</SelectItem>
                  </SelectContent>
                </Select>
                
                {config.entryStrategy === "CUSTOM_RATIOS" && (
                  <div className="mt-2 p-3 rounded-lg bg-secondary/50">
                    <Label className="text-xs">Проценты для каждого ордера (сумма = 100%)</Label>
                    <Input
                      placeholder="10, 30, 40, 20"
                      className="mt-1"
                    />
                  </div>
                )}
              </div>

              <Separator />

              {/* Take-Profit Strategy */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Take-Profit Strategy</Label>
                <p className="text-xs text-muted-foreground">
                  Стратегия фиксации прибыли
                </p>
                <Select
                  value={config.tpStrategy}
                  onValueChange={(v) => updateConfig("tpStrategy", v as BotConfigData["tpStrategy"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ONE_TARGET">One Target (Весь объем сразу)</SelectItem>
                    <SelectItem value="MULTIPLE_TARGETS">Multiple Targets (Частями)</SelectItem>
                    <SelectItem value="ALL_TARGETS">All Targets (По всем целям)</SelectItem>
                  </SelectContent>
                </Select>
                
                {config.tpStrategy === "MULTIPLE_TARGETS" && (
                  <div className="flex items-center gap-2 mt-2">
                    <Label className="text-xs">Кол-во целей:</Label>
                    <Input
                      type="number"
                      value={config.tpTargetCount}
                      onChange={(e) => updateConfig("tpTargetCount", parseInt(e.target.value))}
                      className="w-20"
                      min={1}
                      max={10}
                    />
                  </div>
                )}
              </div>

              <Separator />

              {/* Take-Profit Grace */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Take-Profit Grace</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Автоматические повторы TP ордеров при частичном/полном неисполнении
                    </p>
                  </div>
                  <Switch
                    checked={config.tpGraceEnabled}
                    onCheckedChange={(v) => updateConfig("tpGraceEnabled", v)}
                  />
                </div>

                {config.tpGraceEnabled && (
                  <div className="space-y-4 p-4 rounded-lg bg-secondary/30 border border-primary/10">
                    {/* Grace Cap Percent */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Cap % per Retry</Label>
                        <Badge variant="outline" className="text-xs text-[#0ECB81] border-[#0ECB81]/30">
                          {config.tpGraceCapPercent}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Насколько снизить (LONG) / повысить (SHORT) цену TP при каждой попытке
                      </p>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[config.tpGraceCapPercent]}
                          onValueChange={([v]) => updateConfig("tpGraceCapPercent", v)}
                          max={2}
                          min={0.01}
                          step={0.01}
                          className="flex-1"
                        />
                        <span className="text-sm font-mono w-12 text-right">
                          {config.tpGraceCapPercent}%
                        </span>
                      </div>
                    </div>

                    {/* Max Retries */}
                    <div className="space-y-2">
                      <Label className="text-sm">Max Retry Attempts</Label>
                      <p className="text-xs text-muted-foreground">
                        Макс. количество повторных попыток для каждого TP
                      </p>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={config.tpGraceMaxRetries}
                          onChange={(e) => updateConfig("tpGraceMaxRetries", parseInt(e.target.value))}
                          className="w-20"
                          min={1}
                          max={10}
                        />
                        <span className="text-sm text-muted-foreground">попыток</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#0ECB81]/5 border border-[#0ECB81]/20">
                      <p className="text-xs text-muted-foreground">
                        <span className="text-[#0ECB81] font-medium">ℹ️ How it works:</span> Если TP ордер не исполнился или исполнен частично, Cornix автоматически разместит новый TP ордер по скорректированной цене. Для LONG позиций цена будет снижена, для SHORT - повышена. Попытки продолжаются пока весь объём не будет закрыт или не достигнут лимит.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== STOP-LOSS ==================== */}
        <AccordionItem value="stoploss" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-medium">Stop-Loss (Стоп-лосс)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Default Stop-Loss */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Default Stop-Loss</Label>
                  <Switch
                    checked={config.defaultStopLoss !== null}
                    onCheckedChange={(v) => updateConfig("defaultStopLoss", v ? 15 : null)}
                  />
                </div>
                
                {config.defaultStopLoss !== null && (
                  <div className="flex items-center gap-4">
                    <Input
                      type="number"
                      value={config.defaultStopLoss}
                      onChange={(e) => updateConfig("defaultStopLoss", parseFloat(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">% от цены входа</span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Stop Timeout */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Stop Timeout</Label>
                <p className="text-xs text-muted-foreground">
                  Задержка перед срабатыванием SL (избегание проколов)
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={config.slTimeout}
                    onChange={(e) => updateConfig("slTimeout", parseInt(e.target.value))}
                    className="w-24"
                    min={0}
                  />
                  <Select
                    value={config.slTimeoutUnit}
                    onValueChange={(v) => updateConfig("slTimeoutUnit", v as BotConfigData["slTimeoutUnit"])}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SECONDS">Секунд</SelectItem>
                      <SelectItem value="MINUTES">Минут</SelectItem>
                      <SelectItem value="HOURS">Часов</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Stop Type */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Stop Order Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateConfig("slOrderType", "MARKET")}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-colors",
                      config.slOrderType === "MARKET"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/50"
                    )}
                  >
                    <p className="font-medium text-sm">Market</p>
                    <p className="text-xs text-muted-foreground">
                      Гарантирует исполнение
                    </p>
                  </button>
                  <button
                    onClick={() => updateConfig("slOrderType", "LIMIT")}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-colors",
                      config.slOrderType === "LIMIT"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/50"
                    )}
                  >
                    <p className="font-medium text-sm">Limit</p>
                    <p className="text-xs text-muted-foreground">
                      Гарантирует цену
                    </p>
                  </button>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== MARGIN ==================== */}
        <AccordionItem value="margin" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <span className="font-medium">Margin (Маржа)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Leverage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Leverage (Плечо)</Label>
                  <Badge variant="outline">{config.leverage}x</Badge>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[1, 2, 3, 5, 10, 20, 50, 100, 125].map((lev) => (
                    <Button
                      key={lev}
                      variant={config.leverage === lev ? "default" : "outline"}
                      size="sm"
                      className="w-12 h-8"
                      onClick={() => updateConfig("leverage", lev)}
                    >
                      {lev}x
                    </Button>
                  ))}
                </div>
                
                {/* Leverage Override */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 mt-2">
                  <div>
                    <p className="text-sm font-medium">Override</p>
                    <p className="text-xs text-muted-foreground">
                      Использовать ваше плечо вместо сигнала
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className={cn("text-xs", !config.leverageOverride && "text-muted-foreground")}>
                      No
                    </Label>
                    <Switch
                      checked={config.leverageOverride}
                      onCheckedChange={(v) => updateConfig("leverageOverride", v)}
                    />
                    <Label className={cn("text-xs", config.leverageOverride && "text-primary")}>
                      Yes
                    </Label>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Hedge Mode */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Mode (Hedge)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateConfig("hedgeMode", false)}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-colors",
                      !config.hedgeMode
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/50"
                    )}
                  >
                    <p className="font-medium text-sm">One-Way</p>
                    <p className="text-xs text-muted-foreground">
                      Только одна позиция (Long или Short)
                    </p>
                  </button>
                  <button
                    onClick={() => updateConfig("hedgeMode", true)}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-colors",
                      config.hedgeMode
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/50"
                    )}
                  >
                    <p className="font-medium text-sm">Hedge Mode</p>
                    <p className="text-xs text-muted-foreground">
                      Long и Short одновременно
                    </p>
                  </button>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== FILTERS ==================== */}
        <AccordionItem value="filters" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              <span className="font-medium">Auto-trading Filters</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Max Trades */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Max Trades</Label>
                  <Badge variant="outline">{config.maxOpenTrades}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Макс. количество одновременно открытых сделок
                </p>
                <Slider
                  value={[config.maxOpenTrades]}
                  onValueChange={([v]) => updateConfig("maxOpenTrades", v)}
                  max={20}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>

              <Separator />

              {/* Interval Between Trades */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Interval Between Trades</Label>
                  <Badge variant="outline">{config.minTradeInterval} мин</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Мин. интервал между сделками по одной паре
                </p>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[config.minTradeInterval]}
                    onValueChange={([v]) => updateConfig("minTradeInterval", v)}
                    max={60}
                    min={0}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono">{config.minTradeInterval} мин</span>
                </div>
              </div>

              <Separator />

              {/* Blacklisted Symbols */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Blacklisted Symbols/Pairs</Label>
                <p className="text-xs text-muted-foreground">
                  Монеты, которые бот должен игнорировать
                </p>
                <Input placeholder="BTCUSDT, ETHUSDT, DOGEUSDT..." />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== FEE SETTINGS ==================== */}
        <AccordionItem value="fees" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" />
              <span className="font-medium">Комиссии и проскальзывание</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-6 pt-2">
              
              {/* Use Custom Fees Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div>
                  <p className="text-sm font-medium">Свои комиссии</p>
                  <p className="text-xs text-muted-foreground">
                    Использовать свои значения вместо биржевых по умолчанию
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Label className={cn("text-xs", !config.useCustomFees && "text-muted-foreground")}>
                    Нет
                  </Label>
                  <Switch
                    checked={config.useCustomFees}
                    onCheckedChange={(v) => updateConfig("useCustomFees", v)}
                  />
                  <Label className={cn("text-xs", config.useCustomFees && "text-primary")}>
                    Да
                  </Label>
                </div>
              </div>

              {config.useCustomFees && (
                <>
                  <Separator />
                  
                  {/* Spot Fees */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">SPOT</Badge>
                      <span className="text-sm text-muted-foreground">Комиссии для спотовой торговли</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Maker Fee</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={(config.spotMakerFee * 100).toFixed(2)}
                            onChange={(e) => updateConfig("spotMakerFee", parseFloat(e.target.value) / 100)}
                            className="w-24"
                            step="0.01"
                            min="0"
                            max="1"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Limit ордера</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Taker Fee</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={(config.spotTakerFee * 100).toFixed(2)}
                            onChange={(e) => updateConfig("spotTakerFee", parseFloat(e.target.value) / 100)}
                            className="w-24"
                            step="0.01"
                            min="0"
                            max="1"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Market ордера</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Futures Fees */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500">FUTURES</Badge>
                      <span className="text-sm text-muted-foreground">Комиссии для фьючерсной торговли</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Maker Fee</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={(config.futuresMakerFee * 100).toFixed(3)}
                            onChange={(e) => updateConfig("futuresMakerFee", parseFloat(e.target.value) / 100)}
                            className="w-24"
                            step="0.001"
                            min="0"
                            max="1"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Limit ордера</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Taker Fee</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={(config.futuresTakerFee * 100).toFixed(3)}
                            onChange={(e) => updateConfig("futuresTakerFee", parseFloat(e.target.value) / 100)}
                            className="w-24"
                            step="0.001"
                            min="0"
                            max="1"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Market ордера</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Slippage */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500">DEMO</Badge>
                      <span className="text-sm text-muted-foreground">Проскальзывание для демо-торговли</span>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Slippage (проскальзывание)</Label>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[config.slippagePercent * 100]}
                          onValueChange={([v]) => updateConfig("slippagePercent", v / 100)}
                          max={1}
                          min={0}
                          step={0.01}
                          className="flex-1"
                        />
                        <span className="text-sm font-mono w-16">
                          {(config.slippagePercent * 100).toFixed(2)}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Имитация проскальзывания цены при исполнении Market ордеров
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== NOTIFICATIONS ==================== */}
        <AccordionItem value="notifications" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <span className="font-medium">Notifications</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-4 pt-2">
              {[
                { key: "notifyOnEntry", label: "На входе" },
                { key: "notifyOnExit", label: "На выходе" },
                { key: "notifyOnSL", label: "На Stop-Loss" },
                { key: "notifyOnTP", label: "На Take-Profit" },
                { key: "notifyOnError", label: "При ошибках" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <Label className="text-sm">{item.label}</Label>
                  <Switch
                    checked={config[item.key as keyof BotConfigData] as boolean}
                    onCheckedChange={(v) => updateConfig(item.key as keyof BotConfigData, v)}
                  />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сбросить настройки?</DialogTitle>
            <DialogDescription>
              Все параметры будут возвращены к значениям по умолчанию. Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleReset}>
              Сбросить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
