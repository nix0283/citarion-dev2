/**
 * Trailing Stop-Loss Service
 *
 * Implements Cornix-style "Trailing Stop-Loss" feature with 5 types:
 * 1. BREAKEVEN: Move SL to entry price after trigger
 * 2. MOVING_TARGET: Trail behind price at fixed distance after target hit
 * 3. MOVING_2_TARGET: Trail after 2nd target reached
 * 4. PERCENT_BELOW_TRIGGERS: Trail at % below highest price after triggers
 * 5. PERCENT_BELOW_HIGHEST: Trail at % below highest price reached
 *
 * @see https://help.cornix.io/en/articles/5814858-trailing-stop-loss
 */

import { db } from "@/lib/db";

// ==================== TYPES ====================

export type TrailingStopType =
  | "BREAKEVEN"
  | "MOVING_TARGET"
  | "MOVING_2_TARGET"
  | "PERCENT_BELOW_TRIGGERS"
  | "PERCENT_BELOW_HIGHEST";

export type TrailingTriggerType =
  | "TARGET_REACHED"
  | "PERCENT_ABOVE_ENTRY"
  | "SECOND_TARGET_REACHED"
  | "MANUAL";

export type TrailingStopStatus =
  | "INACTIVE"
  | "TRIGGERED"
  | "ACTIVE"
  | "UPDATED"
  | "EXHAUSTED";

export interface TrailingStopConfig {
  enabled: boolean;
  type: TrailingStopType;
  triggerType: TrailingTriggerType;
  triggerValue?: number; // Target # for TARGET_REACHED, or % for PERCENT_ABOVE_ENTRY
  trailingPercent: number; // Distance to trail behind price (for Moving types)
  onlyIfNotDefinedByGroup: boolean;
}

export interface TrailingStopState {
  positionId: string;
  type: TrailingStopType;
  status: TrailingStopStatus;
  triggerType: TrailingTriggerType;
  triggerValue?: number;
  trailingPercent: number;

  // Activation tracking
  activatedAt?: Date;
  triggerHitAt?: Date;

  // Price tracking
  highestPrice?: number; // For LONG positions
  lowestPrice?: number; // For SHORT positions
  entryPrice: number;
  currentStopLoss: number;
  originalStopLoss?: number;

  // Target tracking
  targetsHit: number; // Number of TP targets hit

  // Update history
  lastUpdateAt?: Date;
  updateCount: number;
  lastStopLossPrice?: number;

  // Metadata
  direction: "LONG" | "SHORT";
  symbol: string;
}

export interface TrailingStopCalculation {
  newStopLoss: number;
  previousStopLoss: number;
  priceMovement: number;
  trailingDistance: number;
  triggerHit: boolean;
  shouldUpdate: boolean;
  reason: string;
  direction: "LONG" | "SHORT";
}

export interface TrailingStopResult {
  success: boolean;
  positionId: string;
  type: TrailingStopType;
  status: TrailingStopStatus;
  stopLossUpdated: boolean;
  previousStopLoss?: number;
  newStopLoss?: number;
  highestPrice?: number;
  lowestPrice?: number;
  error?: string;
  reason?: string;
}

export interface TrailingStopValidation {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// ==================== CONSTANTS ====================

const MIN_TRAILING_PERCENT = 0.1; // 0.1% minimum trailing distance
const MAX_TRAILING_PERCENT = 50; // 50% maximum trailing distance

// ==================== MAIN SERVICE ====================

export class TrailingStopService {
  /**
   * Calculate new stop-loss price based on trailing type and current price
   */
  static calculateTrailingStop(
    state: TrailingStopState,
    currentPrice: number,
    targetsHit: number = 0
  ): TrailingStopCalculation {
    const direction = state.direction;
    const entryPrice = state.entryPrice;

    // Initialize tracking prices
    let highestPrice = state.highestPrice ?? (direction === "LONG" ? entryPrice : currentPrice);
    let lowestPrice = state.lowestPrice ?? (direction === "SHORT" ? entryPrice : currentPrice);

    // Update highest/lowest prices
    if (direction === "LONG") {
      highestPrice = Math.max(highestPrice, currentPrice);
    } else {
      lowestPrice = Math.min(lowestPrice, currentPrice);
    }

    let newStopLoss = state.currentStopLoss;
    let triggerHit = false;
    let shouldUpdate = false;
    let reason = "";

    switch (state.type) {
      case "BREAKEVEN":
        // BREAKEVEN: Move SL to entry price after trigger condition met
        triggerHit = this.checkBreakevenTrigger(state, currentPrice, targetsHit);
        if (triggerHit && state.status === "INACTIVE") {
          newStopLoss = entryPrice;
          shouldUpdate = state.currentStopLoss !== entryPrice;
          reason = `Breakeven triggered: moving SL to entry price ${entryPrice}`;
        } else if (state.status === "ACTIVE" || state.status === "TRIGGERED") {
          // Already at breakeven, no further trailing
          shouldUpdate = false;
          reason = "Breakeven already applied, no further trailing";
        } else {
          reason = `Breakeven waiting for trigger: ${state.triggerType} ${state.triggerValue}`;
        }
        break;

      case "MOVING_TARGET":
        // MOVING_TARGET: Trail behind price at fixed distance after first target hit
        if (targetsHit >= 1 || state.status === "ACTIVE") {
          triggerHit = true;
          const trailingDistance = state.trailingPercent / 100;

          if (direction === "LONG") {
            // For LONG: SL trails below highest price
            newStopLoss = highestPrice * (1 - trailingDistance);
            // SL can only move UP for LONG positions
            shouldUpdate = newStopLoss > state.currentStopLoss;
          } else {
            // For SHORT: SL trails above lowest price
            newStopLoss = lowestPrice * (1 + trailingDistance);
            // SL can only move DOWN for SHORT positions
            shouldUpdate = newStopLoss < state.currentStopLoss;
          }
          reason = shouldUpdate
            ? `Moving Target trailing: new SL ${newStopLoss.toFixed(4)}`
            : "Moving Target: SL already optimal";
        } else {
          reason = `Moving Target waiting for TP1 (current: ${targetsHit}/1)`;
        }
        break;

      case "MOVING_2_TARGET":
        // MOVING_2_TARGET: Trail after 2nd target reached
        if (targetsHit >= 2 || state.status === "ACTIVE") {
          triggerHit = true;
          const trailingDistance = state.trailingPercent / 100;

          if (direction === "LONG") {
            newStopLoss = highestPrice * (1 - trailingDistance);
            shouldUpdate = newStopLoss > state.currentStopLoss;
          } else {
            newStopLoss = lowestPrice * (1 + trailingDistance);
            shouldUpdate = newStopLoss < state.currentStopLoss;
          }
          reason = shouldUpdate
            ? `Moving 2-Target trailing: new SL ${newStopLoss.toFixed(4)}`
            : "Moving 2-Target: SL already optimal";
        } else {
          reason = `Moving 2-Target waiting for TP2 (current: ${targetsHit}/2)`;
        }
        break;

      case "PERCENT_BELOW_TRIGGERS":
        // PERCENT_BELOW_TRIGGERS: Trail at % below highest after trigger conditions met
        const triggerPercent = state.triggerValue ?? 5; // Default 5% above entry
        const triggerThreshold = direction === "LONG"
          ? entryPrice * (1 + triggerPercent / 100)
          : entryPrice * (1 - triggerPercent / 100);

        const priceTriggered = direction === "LONG"
          ? highestPrice >= triggerThreshold
          : lowestPrice <= triggerThreshold;

        if (priceTriggered || state.status === "ACTIVE") {
          triggerHit = true;
          const trailingDistance = state.trailingPercent / 100;

          if (direction === "LONG") {
            newStopLoss = highestPrice * (1 - trailingDistance);
            shouldUpdate = newStopLoss > state.currentStopLoss;
          } else {
            newStopLoss = lowestPrice * (1 + trailingDistance);
            shouldUpdate = newStopLoss < state.currentStopLoss;
          }
          reason = shouldUpdate
            ? `Percent Below Triggers: new SL ${newStopLoss.toFixed(4)} (${state.trailingPercent}% below highest)`
            : "Percent Below Triggers: SL already optimal";
        } else {
          reason = `Waiting for ${triggerPercent}% ${direction === "LONG" ? "above" : "below"} entry`;
        }
        break;

      case "PERCENT_BELOW_HIGHEST":
        // PERCENT_BELOW_HIGHEST: Always trail at % below highest price reached
        triggerHit = true; // Always active
        const trailDist = state.trailingPercent / 100;

        if (direction === "LONG") {
          newStopLoss = highestPrice * (1 - trailDist);
          shouldUpdate = newStopLoss > state.currentStopLoss;
        } else {
          newStopLoss = lowestPrice * (1 + trailDist);
          shouldUpdate = newStopLoss < state.currentStopLoss;
        }
        reason = shouldUpdate
          ? `Percent Below Highest: new SL ${newStopLoss.toFixed(4)}`
          : "Percent Below Highest: SL already optimal";
        break;

      default:
        reason = `Unknown trailing stop type: ${state.type}`;
    }

    const priceMovement = direction === "LONG"
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;

    return {
      newStopLoss,
      previousStopLoss: state.currentStopLoss,
      priceMovement,
      trailingDistance: state.trailingPercent,
      triggerHit,
      shouldUpdate,
      reason,
      direction,
    };
  }

  /**
   * Check if breakeven trigger conditions are met
   */
  private static checkBreakevenTrigger(
    state: TrailingStopState,
    currentPrice: number,
    targetsHit: number
  ): boolean {
    switch (state.triggerType) {
      case "TARGET_REACHED":
        return targetsHit >= (state.triggerValue ?? 1);

      case "PERCENT_ABOVE_ENTRY":
        const percentGain = state.direction === "LONG"
          ? ((currentPrice - state.entryPrice) / state.entryPrice) * 100
          : ((state.entryPrice - currentPrice) / state.entryPrice) * 100;
        return percentGain >= (state.triggerValue ?? 5);

      case "MANUAL":
        return state.status === "TRIGGERED" || state.status === "ACTIVE";

      default:
        return false;
    }
  }

  /**
   * Update trailing state after price movement
   */
  static updateTrailingState(
    state: TrailingStopState,
    currentPrice: number,
    calculation: TrailingStopCalculation
  ): TrailingStopState {
    const now = new Date();

    // Update highest/lowest prices
    let highestPrice = state.highestPrice;
    let lowestPrice = state.lowestPrice;

    if (state.direction === "LONG") {
      highestPrice = Math.max(highestPrice ?? state.entryPrice, currentPrice);
    } else {
      lowestPrice = Math.min(lowestPrice ?? state.entryPrice, currentPrice);
    }

    // Update status based on trigger
    let status = state.status;
    if (calculation.triggerHit && state.status === "INACTIVE") {
      status = "TRIGGERED";
    } else if (calculation.shouldUpdate) {
      status = "ACTIVE";
    }

    return {
      ...state,
      status,
      highestPrice,
      lowestPrice,
      currentStopLoss: calculation.newStopLoss,
      lastStopLossPrice: calculation.shouldUpdate ? state.currentStopLoss : state.lastStopLossPrice,
      lastUpdateAt: now,
      updateCount: calculation.shouldUpdate ? state.updateCount + 1 : state.updateCount,
      triggerHitAt: calculation.triggerHit && !state.triggerHitAt ? now : state.triggerHitAt,
      activatedAt: calculation.shouldUpdate && !state.activatedAt ? now : state.activatedAt,
    };
  }

  /**
   * Check if stop-loss should be moved
   */
  static shouldUpdateStop(
    state: TrailingStopState,
    calculation: TrailingStopCalculation
  ): boolean {
    // Don't update if trailing is not active
    if (state.status === "INACTIVE" && !calculation.triggerHit) {
      return false;
    }

    // Don't update if calculation says no update needed
    if (!calculation.shouldUpdate) {
      return false;
    }

    // Ensure new SL is valid
    if (state.direction === "LONG") {
      // For LONG: SL must be above current SL and below current price
      return calculation.newStopLoss > state.currentStopLoss &&
             calculation.newStopLoss < calculation.previousStopLoss * 100; // Sanity check
    } else {
      // For SHORT: SL must be below current SL and above current price
      return calculation.newStopLoss < state.currentStopLoss &&
             calculation.newStopLoss > calculation.previousStopLoss * 0.01; // Sanity check
    }
  }

  /**
   * Main processing function for a position
   * Updates database and returns result
   */
  static async processTrailingForPosition(
    positionId: string,
    currentPrice: number,
    targetsHit: number = 0
  ): Promise<TrailingStopResult> {
    try {
      // Get position from database
      const position = await db.position.findUnique({
        where: { id: positionId },
        include: { Signal: true },
      });

      if (!position) {
        return {
          success: false,
          positionId,
          type: "BREAKEVEN",
          status: "INACTIVE",
          stopLossUpdated: false,
          error: "Position not found",
        };
      }

      // Check if trailing is enabled
      if (!position.trailingStop) {
        return {
          success: true,
          positionId,
          type: "BREAKEVEN",
          status: "INACTIVE",
          stopLossUpdated: false,
          reason: "Trailing stop not configured for this position",
        };
      }

      // Parse existing state or create new
      let state: TrailingStopState;
      const existingState = position.trailingStop;

      if (typeof existingState === "string") {
        try {
          const parsed = JSON.parse(existingState);
          if (parsed.positionId) {
            state = parsed as TrailingStopState;
          } else {
            // Legacy format - convert to new state
            state = this.createInitialState(
              positionId,
              position.symbol,
              position.direction as "LONG" | "SHORT",
              position.avgEntryPrice,
              position.stopLoss ?? position.avgEntryPrice * 0.9,
              parsed.type ?? "BREAKEVEN",
              parsed.trailingPercent ?? 5,
              parsed.triggerType ?? "TARGET_REACHED",
              parsed.triggerValue
            );
          }
        } catch {
          // Invalid JSON - create new state
          state = this.createInitialState(
            positionId,
            position.symbol,
            position.direction as "LONG" | "SHORT",
            position.avgEntryPrice,
            position.stopLoss ?? position.avgEntryPrice * 0.9,
            "BREAKEVEN",
            5,
            "TARGET_REACHED",
            1
          );
        }
      } else {
        state = existingState as unknown as TrailingStopState;
      }

      // Calculate trailing stop
      const calculation = this.calculateTrailingStop(state, currentPrice, targetsHit);

      // Log the calculation
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[TRAILING STOP] Position ${positionId}: ${state.type} - ${calculation.reason}`,
          details: JSON.stringify({
            positionId,
            type: state.type,
            direction: state.direction,
            currentPrice,
            highestPrice: state.highestPrice,
            lowestPrice: state.lowestPrice,
            currentSL: state.currentStopLoss,
            newSL: calculation.newStopLoss,
            shouldUpdate: calculation.shouldUpdate,
            triggerHit: calculation.triggerHit,
            targetsHit,
          }),
        },
      });

      // Check if we should update
      const shouldUpdate = this.shouldUpdateStop(state, calculation);

      if (!shouldUpdate) {
        // Just update the tracking prices
        const updatedState = this.updateTrailingState(state, currentPrice, calculation);

        await db.position.update({
          where: { id: positionId },
          data: {
            highestPrice: updatedState.highestPrice,
            lowestPrice: updatedState.lowestPrice,
            trailingStop: JSON.stringify(updatedState),
          },
        });

        return {
          success: true,
          positionId,
          type: state.type,
          status: updatedState.status,
          stopLossUpdated: false,
          highestPrice: updatedState.highestPrice,
          lowestPrice: updatedState.lowestPrice,
          reason: calculation.reason,
        };
      }

      // Update stop-loss atomically
      const updatedState = this.updateTrailingState(state, currentPrice, calculation);

      const updatedPosition = await db.$transaction(async (tx) => {
        // Get current position state within transaction
        const currentPosition = await tx.position.findUnique({
          where: { id: positionId },
        });

        if (!currentPosition) {
          throw new Error("Position not found during update");
        }

        // Verify the SL hasn't been modified externally
        if (currentPosition.stopLoss !== state.currentStopLoss) {
          // External modification detected - use current DB value
          updatedState.currentStopLoss = currentPosition.stopLoss ?? state.currentStopLoss;
        }

        // Update position
        return tx.position.update({
          where: { id: positionId },
          data: {
            stopLoss: calculation.newStopLoss,
            highestPrice: updatedState.highestPrice,
            lowestPrice: updatedState.lowestPrice,
            trailingActivated: true,
            trailingStop: JSON.stringify(updatedState),
          },
        });
      });

      // Log successful update
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[TRAILING STOP] Updated SL for ${position.symbol}: ${state.currentStopLoss} → ${calculation.newStopLoss}`,
          details: JSON.stringify({
            positionId,
            type: state.type,
            direction: state.direction,
            previousSL: state.currentStopLoss,
            newSL: calculation.newStopLoss,
            currentPrice,
            highestPrice: updatedState.highestPrice,
            lowestPrice: updatedState.lowestPrice,
            updateCount: updatedState.updateCount,
          }),
        },
      });

      return {
        success: true,
        positionId,
        type: state.type,
        status: updatedState.status,
        stopLossUpdated: true,
        previousStopLoss: state.currentStopLoss,
        newStopLoss: calculation.newStopLoss,
        highestPrice: updatedState.highestPrice,
        lowestPrice: updatedState.lowestPrice,
        reason: calculation.reason,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Log error
      await db.systemLog.create({
        data: {
          level: "ERROR",
          category: "TRADE",
          message: `[TRAILING STOP] Error processing position ${positionId}`,
          details: JSON.stringify({
            positionId,
            error: errorMessage,
            currentPrice,
            targetsHit,
          }),
        },
      });

      return {
        success: false,
        positionId,
        type: "BREAKEVEN",
        status: "INACTIVE",
        stopLossUpdated: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Validate configuration
   */
  static validateConfig(config: TrailingStopConfig): TrailingStopValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check enabled status
    if (!config.enabled) {
      return { valid: true, errors: [], warnings: ["Trailing stop is disabled"] };
    }

    // Validate type
    const validTypes: TrailingStopType[] = [
      "BREAKEVEN",
      "MOVING_TARGET",
      "MOVING_2_TARGET",
      "PERCENT_BELOW_TRIGGERS",
      "PERCENT_BELOW_HIGHEST",
    ];
    if (!validTypes.includes(config.type)) {
      errors.push(`Invalid trailing stop type: ${config.type}`);
    }

    // Validate trailing percent
    if (config.trailingPercent < MIN_TRAILING_PERCENT) {
      errors.push(`Trailing percent must be at least ${MIN_TRAILING_PERCENT}%`);
    }
    if (config.trailingPercent > MAX_TRAILING_PERCENT) {
      errors.push(`Trailing percent cannot exceed ${MAX_TRAILING_PERCENT}%`);
    }

    // Type-specific validation
    switch (config.type) {
      case "BREAKEVEN":
        if (config.triggerType === "TARGET_REACHED") {
          if (!config.triggerValue || config.triggerValue < 1) {
            errors.push("TARGET_REACHED trigger requires a valid target number (1+)");
          }
        } else if (config.triggerType === "PERCENT_ABOVE_ENTRY") {
          if (!config.triggerValue || config.triggerValue <= 0) {
            errors.push("PERCENT_ABOVE_ENTRY trigger requires a positive percentage");
          }
          if (config.triggerValue > 100) {
            warnings.push("Trigger percentage > 100% may never be reached");
          }
        }
        break;

      case "MOVING_TARGET":
        // Requires at least one TP target
        warnings.push("MOVING_TARGET requires at least one TP target configured");
        break;

      case "MOVING_2_TARGET":
        // Requires at least two TP targets
        warnings.push("MOVING_2_TARGET requires at least two TP targets configured");
        break;

      case "PERCENT_BELOW_TRIGGERS":
        if (!config.triggerValue || config.triggerValue <= 0) {
          errors.push("PERCENT_BELOW_TRIGGERS requires a valid trigger percentage");
        }
        break;

      case "PERCENT_BELOW_HIGHEST":
        // Always active, no trigger needed
        break;
    }

    // Validate trigger type
    const validTriggers: TrailingTriggerType[] = [
      "TARGET_REACHED",
      "PERCENT_ABOVE_ENTRY",
      "SECOND_TARGET_REACHED",
      "MANUAL",
    ];
    if (!validTriggers.includes(config.triggerType)) {
      errors.push(`Invalid trigger type: ${config.triggerType}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Create initial trailing stop state
   */
  static createInitialState(
    positionId: string,
    symbol: string,
    direction: "LONG" | "SHORT",
    entryPrice: number,
    currentStopLoss: number,
    type: TrailingStopType,
    trailingPercent: number,
    triggerType: TrailingTriggerType,
    triggerValue?: number
  ): TrailingStopState {
    return {
      positionId,
      type,
      status: "INACTIVE",
      triggerType,
      triggerValue,
      trailingPercent,
      entryPrice,
      currentStopLoss,
      originalStopLoss: currentStopLoss,
      highestPrice: direction === "LONG" ? entryPrice : undefined,
      lowestPrice: direction === "SHORT" ? entryPrice : undefined,
      targetsHit: 0,
      updateCount: 0,
      direction,
      symbol,
    };
  }

  /**
   * Initialize trailing stop for a new position
   */
  static async initializeTrailingStop(
    positionId: string,
    config: TrailingStopConfig
  ): Promise<{ success: boolean; state?: TrailingStopState; error?: string }> {
    try {
      // Validate config
      const validation = this.validateConfig(config);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid config: ${validation.errors.join(", ")}`,
        };
      }

      // Get position
      const position = await db.position.findUnique({
        where: { id: positionId },
      });

      if (!position) {
        return { success: false, error: "Position not found" };
      }

      // Create initial state
      const state = this.createInitialState(
        positionId,
        position.symbol,
        position.direction as "LONG" | "SHORT",
        position.avgEntryPrice,
        position.stopLoss ?? position.avgEntryPrice * 0.9,
        config.type,
        config.trailingPercent,
        config.triggerType,
        config.triggerValue
      );

      // For PERCENT_BELOW_HIGHEST, start immediately
      if (config.type === "PERCENT_BELOW_HIGHEST") {
        state.status = "ACTIVE";
        state.activatedAt = new Date();
      }

      // Save to database
      await db.position.update({
        where: { id: positionId },
        data: {
          trailingStop: JSON.stringify(state),
          trailingActivated: config.type === "PERCENT_BELOW_HIGHEST",
          highestPrice: state.highestPrice,
          lowestPrice: state.lowestPrice,
        },
      });

      // Log initialization
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[TRAILING STOP] Initialized for position ${positionId}`,
          details: JSON.stringify({
            positionId,
            symbol: position.symbol,
            direction: position.direction,
            type: config.type,
            triggerType: config.triggerType,
            triggerValue: config.triggerValue,
            trailingPercent: config.trailingPercent,
          }),
        },
      });

      return { success: true, state };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get config from BotConfig
   */
  static getConfigFromBotConfig(botConfig: {
    trailingEnabled: boolean;
    trailingType: string | null;
    trailingValue: number | null;
    trailingTriggerType: string | null;
    trailingTriggerValue: number | null;
    trailingStopPercent: number | null;
    trailingOnlyIfNotDefinedByGroup: boolean;
  }): TrailingStopConfig {
    return {
      enabled: botConfig.trailingEnabled,
      type: (botConfig.trailingType as TrailingStopType) ?? "BREAKEVEN",
      triggerType: (botConfig.trailingTriggerType as TrailingTriggerType) ?? "TARGET_REACHED",
      triggerValue: botConfig.trailingTriggerValue ?? botConfig.trailingValue ?? undefined,
      trailingPercent: botConfig.trailingStopPercent ?? botConfig.trailingValue ?? 5,
      onlyIfNotDefinedByGroup: botConfig.trailingOnlyIfNotDefinedByGroup,
    };
  }

  /**
   * Check if feature should be used based on "Only if not defined by group"
   */
  static shouldUseFeature(
    config: TrailingStopConfig,
    signalHasTrailingConfig: boolean
  ): boolean {
    if (!config.enabled) return false;
    if (config.onlyIfNotDefinedByGroup && signalHasTrailingConfig) return false;
    return true;
  }

  /**
   * Get current state for a position
   */
  static async getTrailingState(positionId: string): Promise<TrailingStopState | null> {
    try {
      const position = await db.position.findUnique({
        where: { id: positionId },
      });

      if (!position?.trailingStop) {
        return null;
      }

      if (typeof position.trailingStop === "string") {
        return JSON.parse(position.trailingStop) as TrailingStopState;
      }

      return position.trailingStop as unknown as TrailingStopState;

    } catch {
      return null;
    }
  }

  /**
   * Clear trailing stop state
   */
  static async clearTrailingState(positionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await db.position.update({
        where: { id: positionId },
        data: {
          trailingStop: null,
          trailingActivated: false,
        },
      });

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Process all active positions with trailing stops
   * Should be called periodically by a scheduler
   */
  static async processAllActivePositions(): Promise<{
    processed: number;
    updated: number;
    errors: number;
    results: TrailingStopResult[];
  }> {
    const results: TrailingStopResult[] = [];
    let updated = 0;
    let errors = 0;

    try {
      // Get all positions with trailing stops enabled
      const positions = await db.position.findMany({
        where: {
          status: "OPEN",
          trailingStop: { not: null },
        },
        include: {
          Signal: true,
        },
      });

      for (const position of positions) {
        // Get current market price
        const marketPrice = await db.marketPrice.findUnique({
          where: { symbol: position.symbol },
        });

        if (!marketPrice) {
          continue;
        }

        // Determine targets hit (simplified - would need actual TP tracking)
        let targetsHit = 0;
        if (position.Signal?.takeProfits) {
          const tps = JSON.parse(position.Signal.takeProfits) as Array<{ price: number }>;
          for (const tp of tps) {
            if (position.direction === "LONG" && marketPrice.price >= tp.price) {
              targetsHit++;
            } else if (position.direction === "SHORT" && marketPrice.price <= tp.price) {
              targetsHit++;
            }
          }
        }

        // Process trailing stop
        const result = await this.processTrailingForPosition(
          position.id,
          marketPrice.price,
          targetsHit
        );

        results.push(result);

        if (result.stopLossUpdated) {
          updated++;
        }
        if (!result.success) {
          errors++;
        }
      }

      return {
        processed: positions.length,
        updated,
        errors,
        results,
      };

    } catch (error) {
      console.error("[Trailing Stop Batch] Error:", error);
      return {
        processed: 0,
        updated: 0,
        errors: 1,
        results,
      };
    }
  }
}

export default TrailingStopService;
