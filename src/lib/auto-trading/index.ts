/**
 * Auto-Trading Services Index
 *
 * Exports all auto-trading related services:
 * - Signal Filtering
 * - First Entry as Market
 * - Take-Profit Grace
 * - Trailing Stop-Loss
 * - Trailing Entry
 * - Trailing Take-Profit
 * - Moving Take-Profits
 * - Unified Signal Processor
 * - Exchange Order Service (Real Order Execution)
 */

export { SignalFilterService } from "./signal-filter";
export type {
  SignalFilterConfig,
  SignalData,
  FilterContext,
  FilterResult,
  FilterReason,
  ValidationResult,
} from "./signal-filter";

export { FirstEntryMarketService } from "./first-entry-market";
export type {
  FirstEntryMarketConfig,
  EntryPriceCalculation,
  FirstEntryExecutionResult,
} from "./first-entry-market";

export { TPGraceService } from "./tp-grace";
export type {
  TPGraceConfig,
  TPTarget,
  TPGraceCalculation,
  TPGraceExecutionResult,
  TPGraceState,
} from "./tp-grace";

export { TrailingStopService } from "./trailing-stop";
export type {
  TrailingStopType,
  TrailingTriggerType,
  TrailingStopStatus,
  TrailingStopConfig,
  TrailingStopState,
  TrailingStopCalculation,
  TrailingStopResult,
  TrailingStopValidation,
} from "./trailing-stop";

export { TrailingEntryService } from "./trailing-entry";
export type {
  TrailingEntryStatus,
  TrailingEntryConfig,
  TrailingEntryState,
  TrailingEntryResult,
  TrailingEntryCalculation,
  TrailingEntryValidation,
} from "./trailing-entry";

export { TrailingTPService } from "./trailing-tp";
export type {
  TrailingTPStatus,
  TrailingTPConfig,
  TrailingTPState,
  TrailingTPResult,
  TrailingTPCalculation,
  TrailingTPValidation,
  TrailingTPBatchResult,
} from "./trailing-tp";

// Re-export from unified processor
export { SignalExecutionService } from "./signal-executor";
export type {
  SignalExecutionContext,
  SignalExecutionResult,
} from "./signal-executor";

export { MovingTPService } from "./moving-tp";
export type {
  MovingTPType,
  MovingTPTargetStatus,
  MovingTPConfig,
  MovingTPTarget,
  MovingTPState,
  MovingTPCalculation,
  MovingTPResult,
  MoveRemainingTPsResult,
  MovingTPValidation,
} from "./moving-tp";

// Order Fill Tracking
export {
  OrderFillTrackingService,
  getOrderFillTracker,
  initOrderFillTracker,
  DEFAULT_FILL_TRACKING_CONFIG,
} from "./order-fill-tracker";
export type {
  OrderFillStatus,
  OrderFillEvent,
  OrderFillCallback,
  FillTrackingConfig,
  FillEventResult,
  ExchangeOrderStatus,
} from "./order-fill-tracker";

// Exchange Order Service - Real Order Execution
export {
  ExchangeOrderService,
  ExchangeOrderError,
  createExchangeOrderService,
  getTestnetConfig,
  supportsTestnet,
  supportsDemo,
} from "./exchange-order";
export type {
  OrderParams,
  OrderResult,
  ModifyParams,
  OrderStatusInfo,
  ExchangeOrderConfig,
  ExchangeClient,
  ExchangeOrderParams,
  ExchangeOrderResult,
  ExchangeModifyParams,
  ExchangeOrderStatusInfo,
  ExchangeOrderServiceConfig,
} from "./exchange-order";
