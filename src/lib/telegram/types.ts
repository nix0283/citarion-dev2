/**
 * Telegram Bot Types for CITARION
 * Types for Cornix auto-trading feature commands
 */

// ==================== BOT CONFIG TYPES ====================

export interface BotConfigSettings {
  // First Entry as Market
  firstEntryMode: 'IMMEDIATE' | 'WAIT_ENTRY';
  firstEntryMaxPriceCap: number; // 0.05-20%
  firstEntryAsMarket: boolean;
  firstEntryOnlyIfNotDefinedByGroup: boolean;

  // Take-Profit Grace
  tpGraceEnabled: boolean;
  tpGraceCapPercent: number; // 0.01-2%
  tpGraceMaxRetries: number; // 1-10
  tpGraceOnlyIfNotDefinedByGroup: boolean;

  // Trailing Stop
  trailingEnabled: boolean;
  trailingType: 'BREAKEVEN' | 'MOVING_TARGET' | 'MOVING_2_TARGET' | 'PERCENT_BELOW_TRIGGERS' | 'PERCENT_BELOW_HIGHEST' | null;
  trailingValue: number | null;
  trailingOnlyIfNotDefinedByGroup: boolean;

  // Trailing Entry
  trailingEntryEnabled: boolean;
  trailingEntryPercent: number; // 0.01-10%
  trailingEntryOnlyIfNotDefinedByGroup: boolean;

  // Trailing TP
  tpTrailingEnabled: boolean;
  tpTrailingPercent: number; // 0.01-10%
  tpTrailingOnlyIfNotDefinedByGroup: boolean;

  // Entry Strategy
  entryStrategy: 'EVENLY_DIVIDED' | 'ONE_TARGET' | 'TWO_TARGETS' | 'THREE_TARGETS' | 'FIFTY_ON_FIRST' | 'DECREASING_EXP' | 'INCREASING_EXP' | 'SKIP_FIRST' | 'CUSTOM_RATIOS';
  entryZoneTargets: number; // 1-10
  entryOnlyIfNotDefinedByGroup: boolean;

  // TP Strategy
  tpStrategy: 'EVENLY_DIVIDED' | 'ONE_TARGET' | 'TWO_TARGETS' | 'THREE_TARGETS' | 'FIFTY_ON_FIRST' | 'DECREASING_EXP' | 'INCREASING_EXP' | 'SKIP_FIRST' | 'CUSTOM_RATIOS';
  tpOnlyIfNotDefinedByGroup: boolean;

  // Moving TP
  movingTPEnabled: boolean;

  // Stop Loss
  defaultStopLoss: number | null; // Percentage
  slBaseline: 'AVERAGE_ENTRIES' | 'FIRST_ENTRY';
  slOnlyIfNotDefinedByGroup: boolean;

  // Leverage
  leverage: number; // 1-125
  leverageMode: 'EXACTLY' | 'UP_TO';
  leverageOnlyIfNotDefinedByGroup: boolean;

  // Direction Filter
  directionFilter: 'LONG' | 'SHORT' | 'BOTH';

  // Auto-Close on TP/SL Before Entry
  closeOnTPSLBeforeEntry: boolean;
  closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup: boolean;

  // First Entry Grace
  firstEntryGracePercent: number; // 0-5%

  // Auto-Execute
  autoExecuteEnabled: boolean;

  // Signal Filters
  ignoreSignalsWithoutSL: boolean;
  ignoreSignalsWithoutTP: boolean;
  minRiskRewardRatio: number | null;
  allowedSymbols: string[] | null;
  blacklistedSymbols: string[] | null;
}

// ==================== COMMAND TYPES ====================

export type TrailingType = 'breakeven' | 'moving' | 'percent';
export type DirectionFilter = 'long' | 'short' | 'both';
export type StrategyType = 'evenly' | 'one' | 'two' | 'three' | 'fifty' | 'decreasing' | 'increasing' | 'skip' | 'custom';

export interface FirstEntryCommand {
  enabled?: boolean;
  mode?: 'IMMEDIATE' | 'WAIT_ENTRY';
  capPercent?: number;
}

export interface TPGraceCommand {
  enabled?: boolean;
  capPercent?: number;
  retries?: number;
}

export interface TrailingCommand {
  type: TrailingType;
  value?: number;
}

export interface TrailingEntryCommand {
  enabled?: boolean;
  percent?: number;
}

export interface TrailingTPCommand {
  enabled?: boolean;
  percent?: number;
}

export interface EntryStrategyCommand {
  strategy: StrategyType;
}

export interface TPStrategyCommand {
  strategy: StrategyType;
}

export interface MovingTPCommand {
  enabled?: boolean;
}

export interface SLCommand {
  value: number;
  baseline?: 'AVERAGE_ENTRIES' | 'FIRST_ENTRY';
}

export interface LeverageCommand {
  value: number;
  mode?: 'EXACTLY' | 'UP_TO';
}

export interface DirectionCommand {
  direction: DirectionFilter;
}

export interface AutoCloseCommand {
  enabled?: boolean;
}

export interface GraceCommand {
  percent: number;
}

export interface AutoExecCommand {
  enabled?: boolean;
}

export interface FiltersCommand {
  ignoreNoSL?: boolean;
  ignoreNoTP?: boolean;
  minRR?: number;
  allowedSymbols?: string[];
  blacklistedSymbols?: string[];
}

// ==================== RESPONSE TYPES ====================

export interface CommandResult {
  success: boolean;
  message: string;
  config?: Partial<BotConfigSettings>;
  error?: string;
}

export interface ConfigStatus {
  // First Entry as Market
  firstEntryAsMarket: boolean;
  firstEntryMode: string;
  firstEntryMaxPriceCap: number;

  // TP Grace
  tpGraceEnabled: boolean;
  tpGraceCapPercent: number;
  tpGraceMaxRetries: number;

  // Trailing
  trailingEnabled: boolean;
  trailingType: string | null;
  trailingValue: number | null;

  // Trailing Entry
  trailingEntryEnabled: boolean;
  trailingEntryPercent: number;

  // Trailing TP
  tpTrailingEnabled: boolean;
  tpTrailingPercent: number;

  // Strategies
  entryStrategy: string;
  tpStrategy: string;

  // Moving TP
  movingTPEnabled: boolean;

  // Stop Loss
  defaultStopLoss: number | null;
  slBaseline: string;

  // Leverage
  leverage: number;
  leverageMode: string;

  // Direction
  directionFilter: string;

  // Auto-Close
  closeOnTPSLBeforeEntry: boolean;

  // First Entry Grace
  firstEntryGracePercent: number;

  // Auto-Execute
  autoExecuteEnabled: boolean;

  // Filters
  ignoreSignalsWithoutSL: boolean;
  ignoreSignalsWithoutTP: boolean;
  minRiskRewardRatio: number | null;
}

// ==================== DEFAULTS ====================

export const DEFAULT_BOT_CONFIG: BotConfigSettings = {
  // First Entry as Market
  firstEntryMode: 'WAIT_ENTRY',
  firstEntryMaxPriceCap: 1.0, // 1%
  firstEntryAsMarket: false,
  firstEntryOnlyIfNotDefinedByGroup: false,

  // TP Grace
  tpGraceEnabled: false,
  tpGraceCapPercent: 0.5, // 0.5%
  tpGraceMaxRetries: 3,
  tpGraceOnlyIfNotDefinedByGroup: false,

  // Trailing Stop
  trailingEnabled: false,
  trailingType: 'BREAKEVEN',
  trailingValue: null,
  trailingOnlyIfNotDefinedByGroup: false,

  // Trailing Entry
  trailingEntryEnabled: false,
  trailingEntryPercent: 1.0, // 1%
  trailingEntryOnlyIfNotDefinedByGroup: false,

  // Trailing TP
  tpTrailingEnabled: false,
  tpTrailingPercent: 1.0, // 1%
  tpTrailingOnlyIfNotDefinedByGroup: false,

  // Entry Strategy
  entryStrategy: 'EVENLY_DIVIDED',
  entryZoneTargets: 4,
  entryOnlyIfNotDefinedByGroup: false,

  // TP Strategy
  tpStrategy: 'EVENLY_DIVIDED',
  tpOnlyIfNotDefinedByGroup: false,

  // Moving TP
  movingTPEnabled: false,

  // Stop Loss
  defaultStopLoss: null,
  slBaseline: 'AVERAGE_ENTRIES',
  slOnlyIfNotDefinedByGroup: false,

  // Leverage
  leverage: 10,
  leverageMode: 'EXACTLY',
  leverageOnlyIfNotDefinedByGroup: false,

  // Direction
  directionFilter: 'BOTH',

  // Auto-Close
  closeOnTPSLBeforeEntry: true,
  closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup: false,

  // First Entry Grace
  firstEntryGracePercent: 0,

  // Auto-Execute
  autoExecuteEnabled: false,

  // Filters
  ignoreSignalsWithoutSL: false,
  ignoreSignalsWithoutTP: false,
  minRiskRewardRatio: null,
  allowedSymbols: null,
  blacklistedSymbols: null,
};
