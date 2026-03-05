/**
 * Trailing Take-Profit Service
 *
 * Implements Cornix-style "Trailing Take-Profit" feature:
 * - Trails behind maximum/minimum price to capture more upside
 * - For LONG: Trail BELOW highest price (sell when price drops from high)
 * - For SHORT: Trail ABOVE lowest price (buy when price rises from low)
 * - Automatically adjusts TP target as price moves favorably
 *
 * @see https://help.cornix.io/
 */

import { db } from "@/lib/db";

// ==================== TYPES ====================

export type TrailingTPStatus =
  | "INACTIVE"
  | "TRACKING"
  | "TRIGGERED"
  | "COMPLETED"
  | "CANCELLED";

export interface TrailingTPConfig {
  enabled: boolean;
  trailingPercent: number; // Percentage to trail behind max/min price
  activationPercent?: number; // Percentage gain required to activate (optional)
  onlyIfNotDefinedByGroup: boolean;
}

export interface TrailingTPState {
  positionId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  status: TrailingTPStatus;

  // Price tracking
  entryPrice: number;
  highestPrice: number; // For LONG: track highest price
  lowestPrice: number; // For SHORT: track lowest price
  currentTPPrice: number; // Current trailing TP price
  originalTPPrice?: number; // Original TP price from signal

  // Activation tracking
  activatedAt?: Date;
  triggeredAt?: Date;
  lastUpdateAt?: Date;

  // Statistics
  updateCount: number;
  maxProfitPercent: number; // Maximum profit % reached
  lockedInProfitPercent: number; // Profit % locked by trailing TP

  // Configuration
  trailingPercent: number;
  activationPercent?: number;
}

export interface TrailingTPResult {
  success: boolean;
  positionId: string;
  status: TrailingTPStatus;
  triggered: boolean;
  previousTPPrice?: number;
  newTPPrice?: number;
  highestPrice?: number;
  lowestPrice?: number;
  profitLocked?: number;
  error?: string;
  reason?: string;
}

export interface TrailingTPCalculation {
  newTPPrice: number;
  previousTPPrice: number;
  highestPrice: number;
  lowestPrice: number;
  shouldTrigger: boolean;
  shouldUpdate: boolean;
  profitPercent: number;
  trailingDistance: number;
  reason: string;
}

export interface TrailingTPValidation {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface TrailingTPBatchResult {
  processed: number;
  updated: number;
  triggered: number;
  errors: number;
  results: TrailingTPResult[];
}

// ==================== CONSTANTS ====================

const MIN_TRAILING_PERCENT = 0.1; // 0.1% minimum trailing distance
const MAX_TRAILING_PERCENT = 50; // 50% maximum trailing distance
const DEFAULT_ACTIVATION_PERCENT = 0; // 0% = activate immediately

// ==================== MAIN SERVICE ====================

export class TrailingTPService {
  // In-memory cache for active trailing TPs (for batch processing)
  private static activeTrailingTPs: Map<string, TrailingTPState> = new Map();

  /**
   * Calculate trailing TP price based on current price and direction
   *
   * For LONG: TP price = highestPrice * (1 - trailingPercent/100)
   * For SHORT: TP price = lowestPrice * (1 + trailingPercent/100)
   */
  static calculateTrailingTPPrice(
    currentPrice: number,
    direction: "LONG" | "SHORT",
    trailingPercent: number,
    highestPrice?: number,
    lowestPrice?: number
  ): number {
    if (direction === "LONG") {
      // For LONG: Trail BELOW highest price
      const effectiveHighest = highestPrice ?? currentPrice;
      return effectiveHighest * (1 - trailingPercent / 100);
    } else {
      // For SHORT: Trail ABOVE lowest price
      const effectiveLowest = lowestPrice ?? currentPrice;
      return effectiveLowest * (1 + trailingPercent / 100);
    }
  }

  /**
   * Check if trailing TP should trigger
   *
   * For LONG: Trigger when current price drops to or below trailing TP price
   * For SHORT: Trigger when current price rises to or above trailing TP price
   */
  static shouldTriggerTP(
    currentPrice: number,
    trailingTPPrice: number,
    direction: "LONG" | "SHORT"
  ): boolean {
    if (direction === "LONG") {
      // For LONG: Price dropped to trailing TP level
      return currentPrice <= trailingTPPrice;
    } else {
      // For SHORT: Price rose to trailing TP level
      return currentPrice >= trailingTPPrice;
    }
  }

  /**
   * Process trailing TP for a position
   *
   * Main entry point for processing a single position's trailing TP
   */
  static async processTrailingTP(
    positionId: string,
    config: TrailingTPConfig,
    marketPrice: number
  ): Promise<TrailingTPResult> {
    try {
      // Validate config
      if (!config.enabled) {
        return {
          success: true,
          positionId,
          status: "INACTIVE",
          triggered: false,
          reason: "Trailing TP is disabled",
        };
      }

      // Get position
      const position = await db.position.findUnique({
        where: { id: positionId },
        include: { Signal: true },
      });

      if (!position) {
        return {
          success: false,
          positionId,
          status: "INACTIVE",
          triggered: false,
          error: "Position not found",
        };
      }

      if (position.status !== "OPEN") {
        return {
          success: true,
          positionId,
          status: "INACTIVE",
          triggered: false,
          reason: `Position status is ${position.status}, not OPEN`,
        };
      }

      const direction = position.direction as "LONG" | "SHORT";
      const entryPrice = position.avgEntryPrice;

      // Get or create state
      let state = await this.getState(positionId);

      if (!state) {
        // Initialize new state
        state = await this.initializeState(positionId, position, config);
      }

      // Update highest/lowest prices
      state = this.updateHighestLowestPrice(state, marketPrice, direction);

      // Check activation condition
      if (state.status === "INACTIVE" && config.activationPercent) {
        const profitPercent = this.calculateProfitPercent(
          entryPrice,
          marketPrice,
          direction
        );

        if (profitPercent >= config.activationPercent) {
          state.status = "TRACKING";
          state.activatedAt = new Date();

          await db.systemLog.create({
            data: {
              level: "INFO",
              category: "TRADE",
              message: `[TRAILING TP] Activated for ${position.symbol} at ${profitPercent.toFixed(2)}% profit`,
              details: JSON.stringify({
                positionId,
                symbol: position.symbol,
                direction,
                activationPercent: config.activationPercent,
                currentProfitPercent: profitPercent,
                marketPrice,
              }),
            },
          });
        }
      } else if (state.status === "INACTIVE") {
        // No activation threshold, activate immediately
        state.status = "TRACKING";
        state.activatedAt = new Date();
      }

      // Only process if tracking
      if (state.status !== "TRACKING") {
        return {
          success: true,
          positionId,
          status: state.status,
          triggered: false,
          highestPrice: state.highestPrice,
          lowestPrice: state.lowestPrice,
          reason: `Status is ${state.status}, not tracking`,
        };
      }

      // Calculate trailing TP
      const calculation = this.calculateTrailingTP(state, marketPrice);

      // Log calculation
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[TRAILING TP] Calculation for ${position.symbol}: ${calculation.reason}`,
          details: JSON.stringify({
            positionId,
            direction,
            marketPrice,
            highestPrice: state.highestPrice,
            lowestPrice: state.lowestPrice,
            currentTPPrice: state.currentTPPrice,
            newTPPrice: calculation.newTPPrice,
            shouldTrigger: calculation.shouldTrigger,
            shouldUpdate: calculation.shouldUpdate,
            profitPercent: calculation.profitPercent,
          }),
        },
      });

      // Check if TP should trigger
      if (calculation.shouldTrigger) {
        // Execute TP
        const result = await this.executeTrailingTP(positionId, state, calculation);

        return {
          success: true,
          positionId,
          status: "TRIGGERED",
          triggered: true,
          previousTPPrice: state.currentTPPrice,
          newTPPrice: calculation.newTPPrice,
          highestPrice: state.highestPrice,
          lowestPrice: state.lowestPrice,
          profitLocked: calculation.profitPercent,
          reason: `Trailing TP triggered at ${marketPrice}`,
        };
      }

      // Update TP if needed
      if (calculation.shouldUpdate) {
        state = await this.updateState(positionId, state, calculation);
      }

      // Cache state
      this.activeTrailingTPs.set(positionId, state);

      return {
        success: true,
        positionId,
        status: state.status,
        triggered: false,
        previousTPPrice: calculation.previousTPPrice,
        newTPPrice: calculation.newTPPrice,
        highestPrice: state.highestPrice,
        lowestPrice: state.lowestPrice,
        profitLocked: calculation.profitPercent,
        reason: calculation.reason,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await db.systemLog.create({
        data: {
          level: "ERROR",
          category: "TRADE",
          message: `[TRAILING TP] Error processing position ${positionId}`,
          details: JSON.stringify({
            positionId,
            error: errorMessage,
            marketPrice,
          }),
        },
      });

      return {
        success: false,
        positionId,
        status: "INACTIVE",
        triggered: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Update highest/lowest price tracking
   */
  static updateHighestLowestPrice(
    positionId: string,
    currentPrice: number,
    direction: "LONG" | "SHORT"
  ): TrailingTPState;
  static updateHighestLowestPrice(
    state: TrailingTPState,
    currentPrice: number,
    direction: "LONG" | "SHORT"
  ): TrailingTPState;
  static async updateHighestLowestPrice(
    positionIdOrState: string | TrailingTPState,
    currentPrice: number,
    direction: "LONG" | "SHORT"
  ): Promise<TrailingTPState> | TrailingTPState {
    // Handle overloaded signatures
    let state: TrailingTPState;

    if (typeof positionIdOrState === "string") {
      const existingState = this.activeTrailingTPs.get(positionIdOrState);
      if (!existingState) {
        throw new Error(`No state found for position ${positionIdOrState}`);
      }
      state = existingState;
    } else {
      state = positionIdOrState;
    }

    const previousHighest = state.highestPrice;
    const previousLowest = state.lowestPrice;

    if (direction === "LONG") {
      state.highestPrice = Math.max(state.highestPrice, currentPrice);
    } else {
      state.lowestPrice = Math.min(state.lowestPrice, currentPrice);
    }

    // Log if new high/low reached
    if (direction === "LONG" && state.highestPrice > previousHighest) {
      console.log(
        `[TRAILING TP] New highest price for ${state.symbol}: ${state.highestPrice}`
      );
    } else if (direction === "SHORT" && state.lowestPrice < previousLowest) {
      console.log(
        `[TRAILING TP] New lowest price for ${state.symbol}: ${state.lowestPrice}`
      );
    }

    return state;
  }

  /**
   * Get all active trailing TPs
   */
  static getActiveTrailingTPs(): Map<string, TrailingTPState> {
    return new Map(this.activeTrailingTPs);
  }

  /**
   * Get active trailing TP for a specific position
   */
  static getTrailingTPState(positionId: string): TrailingTPState | undefined {
    return this.activeTrailingTPs.get(positionId);
  }

  /**
   * Batch process all positions with trailing TP enabled
   */
  static async processAllTrailingTPs(): Promise<TrailingTPBatchResult> {
    const results: TrailingTPResult[] = [];
    let updated = 0;
    let triggered = 0;
    let errors = 0;

    try {
      // Get all open positions with TP trailing enabled in their bot config
      const positions = await db.position.findMany({
        where: {
          status: "OPEN",
        },
        include: {
          Signal: true,
          account: {
            include: {
              botConfigs: {
                where: { isActive: true },
              },
            },
          },
        },
      });

      for (const position of positions) {
        // Get bot config for trailing TP settings
        const botConfig = position.account?.botConfigs?.[0];
        if (!botConfig || !botConfig.tpTrailingEnabled) {
          continue;
        }

        // Get current market price
        const marketPrice = await db.marketPrice.findUnique({
          where: { symbol: position.symbol },
        });

        if (!marketPrice) {
          continue;
        }

        const config: TrailingTPConfig = {
          enabled: botConfig.tpTrailingEnabled,
          trailingPercent: botConfig.tpTrailingPercent ?? 1.0,
          onlyIfNotDefinedByGroup: botConfig.tpTrailingOnlyIfNotDefinedByGroup,
        };

        // Process trailing TP
        const result = await this.processTrailingTP(
          position.id,
          config,
          marketPrice.price
        );

        results.push(result);

        if (result.triggered) {
          triggered++;
        }
        if (result.newTPPrice !== result.previousTPPrice) {
          updated++;
        }
        if (!result.success) {
          errors++;
        }
      }

      // Log batch processing summary
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[TRAILING TP] Batch processing completed: ${positions.length} processed, ${updated} updated, ${triggered} triggered`,
          details: JSON.stringify({
            processed: positions.length,
            updated,
            triggered,
            errors,
          }),
        },
      });

      return {
        processed: positions.length,
        updated,
        triggered,
        errors,
        results,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await db.systemLog.create({
        data: {
          level: "ERROR",
          category: "TRADE",
          message: `[TRAILING TP] Batch processing error`,
          details: JSON.stringify({ error: errorMessage }),
        },
      });

      return {
        processed: 0,
        updated: 0,
        triggered: 0,
        errors: 1,
        results,
      };
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Initialize state for a new trailing TP
   */
  private static async initializeState(
    positionId: string,
    position: {
      id: string;
      symbol: string;
      direction: string;
      avgEntryPrice: number;
      highestPrice: number | null;
      lowestPrice: number | null;
      takeProfit: number | null;
    },
    config: TrailingTPConfig
  ): Promise<TrailingTPState> {
    const direction = position.direction as "LONG" | "SHORT";
    const entryPrice = position.avgEntryPrice;

    // Initialize highest/lowest from position or entry price
    const highestPrice = position.highestPrice ?? entryPrice;
    const lowestPrice = position.lowestPrice ?? entryPrice;

    // Calculate initial TP price
    const initialTPPrice = this.calculateTrailingTPPrice(
      entryPrice,
      direction,
      config.trailingPercent,
      highestPrice,
      lowestPrice
    );

    const state: TrailingTPState = {
      positionId,
      symbol: position.symbol,
      direction,
      status: config.activationPercent ? "INACTIVE" : "TRACKING",
      entryPrice,
      highestPrice,
      lowestPrice,
      currentTPPrice: initialTPPrice,
      originalTPPrice: position.takeProfit ?? undefined,
      activatedAt: config.activationPercent ? undefined : new Date(),
      updateCount: 0,
      maxProfitPercent: 0,
      lockedInProfitPercent: 0,
      trailingPercent: config.trailingPercent,
      activationPercent: config.activationPercent,
    };

    // Update database with initial tracking values
    await db.position.update({
      where: { id: positionId },
      data: {
        highestPrice: direction === "LONG" ? highestPrice : null,
        lowestPrice: direction === "SHORT" ? lowestPrice : null,
      },
    });

    // Cache state
    this.activeTrailingTPs.set(positionId, state);

    // Log initialization
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "TRADE",
        message: `[TRAILING TP] Initialized for ${position.symbol}`,
        details: JSON.stringify({
          positionId,
          symbol: position.symbol,
          direction,
          entryPrice,
          trailingPercent: config.trailingPercent,
          activationPercent: config.activationPercent,
          initialTPPrice,
        }),
      },
    });

    return state;
  }

  /**
   * Get state from database or cache
   */
  private static async getState(positionId: string): Promise<TrailingTPState | null> {
    // Check cache first
    const cachedState = this.activeTrailingTPs.get(positionId);
    if (cachedState) {
      return cachedState;
    }

    // Could load from database if we had a dedicated table
    // For now, we use in-memory cache with database for price tracking
    return null;
  }

  /**
   * Calculate trailing TP values
   */
  private static calculateTrailingTP(
    state: TrailingTPState,
    currentPrice: number
  ): TrailingTPCalculation {
    const { direction, trailingPercent, entryPrice, highestPrice, lowestPrice } = state;

    // Calculate new TP price based on highest/lowest
    const newTPPrice = this.calculateTrailingTPPrice(
      currentPrice,
      direction,
      trailingPercent,
      highestPrice,
      lowestPrice
    );

    // Determine if we should update TP
    let shouldUpdate = false;
    if (direction === "LONG") {
      // For LONG: TP can only move UP (higher sell price)
      shouldUpdate = newTPPrice > state.currentTPPrice;
    } else {
      // For SHORT: TP can only move DOWN (lower buy price)
      shouldUpdate = newTPPrice < state.currentTPPrice;
    }

    // Check if TP should trigger
    const shouldTrigger = this.shouldTriggerTP(
      currentPrice,
      state.currentTPPrice,
      direction
    );

    // Calculate profit percent
    const profitPercent = this.calculateProfitPercent(
      entryPrice,
      currentPrice,
      direction
    );

    // Calculate trailing distance
    const trailingDistance = direction === "LONG"
      ? ((highestPrice - currentPrice) / highestPrice) * 100
      : ((currentPrice - lowestPrice) / lowestPrice) * 100;

    // Build reason
    let reason: string;
    if (shouldTrigger) {
      reason = `Trailing TP triggered! Price ${currentPrice} hit TP level ${state.currentTPPrice.toFixed(4)}`;
    } else if (shouldUpdate) {
      reason = `TP updated from ${state.currentTPPrice.toFixed(4)} to ${newTPPrice.toFixed(4)}`;
    } else {
      reason = `TP unchanged at ${state.currentTPPrice.toFixed(4)}, trailing ${trailingPercent}% behind ${direction === "LONG" ? "highest" : "lowest"} price`;
    }

    return {
      newTPPrice: shouldUpdate ? newTPPrice : state.currentTPPrice,
      previousTPPrice: state.currentTPPrice,
      highestPrice,
      lowestPrice,
      shouldTrigger,
      shouldUpdate,
      profitPercent,
      trailingDistance,
      reason,
    };
  }

  /**
   * Update state in database and cache
   */
  private static async updateState(
    positionId: string,
    state: TrailingTPState,
    calculation: TrailingTPCalculation
  ): Promise<TrailingTPState> {
    const now = new Date();

    const updatedState: TrailingTPState = {
      ...state,
      currentTPPrice: calculation.newTPPrice,
      highestPrice: calculation.highestPrice,
      lowestPrice: calculation.lowestPrice,
      lastUpdateAt: now,
      updateCount: state.updateCount + 1,
      maxProfitPercent: Math.max(state.maxProfitPercent, calculation.profitPercent),
      lockedInProfitPercent: calculation.profitPercent,
    };

    // Update database
    await db.$transaction(async (tx) => {
      await tx.position.update({
        where: { id: positionId },
        data: {
          highestPrice: updatedState.highestPrice,
          lowestPrice: updatedState.lowestPrice,
          takeProfit: calculation.newTPPrice,
        },
      });
    });

    // Log update
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "TRADE",
        message: `[TRAILING TP] Updated TP for ${state.symbol}: ${calculation.previousTPPrice} → ${calculation.newTPPrice}`,
        details: JSON.stringify({
          positionId,
          symbol: state.symbol,
          direction: state.direction,
          previousTP: calculation.previousTPPrice,
          newTP: calculation.newTPPrice,
          highestPrice: updatedState.highestPrice,
          lowestPrice: updatedState.lowestPrice,
          profitPercent: calculation.profitPercent,
          updateCount: updatedState.updateCount,
        }),
      },
    });

    return updatedState;
  }

  /**
   * Execute trailing TP (close position)
   */
  private static async executeTrailingTP(
    positionId: string,
    state: TrailingTPState,
    calculation: TrailingTPCalculation
  ): Promise<void> {
    await db.$transaction(async (tx) => {
      // Update position status
      await tx.position.update({
        where: { id: positionId },
        data: {
          status: "CLOSED",
          closeReason: "TRAILING_TP",
          closedAt: new Date(),
          takeProfit: state.currentTPPrice,
          highestPrice: state.highestPrice,
          lowestPrice: state.lowestPrice,
        },
      });

      // Log execution
      await tx.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[TRAILING TP] Position closed at trailing TP for ${state.symbol}`,
          details: JSON.stringify({
            positionId,
            symbol: state.symbol,
            direction: state.direction,
            entryPrice: state.entryPrice,
            exitPrice: state.currentTPPrice,
            highestPrice: state.highestPrice,
            lowestPrice: state.lowestPrice,
            profitPercent: calculation.profitPercent,
            trailingPercent: state.trailingPercent,
            updateCount: state.updateCount,
          }),
        },
      });
    });

    // Remove from active cache
    this.activeTrailingTPs.delete(positionId);
  }

  /**
   * Calculate profit percentage
   */
  private static calculateProfitPercent(
    entryPrice: number,
    currentPrice: number,
    direction: "LONG" | "SHORT"
  ): number {
    if (direction === "LONG") {
      return ((currentPrice - entryPrice) / entryPrice) * 100;
    } else {
      return ((entryPrice - currentPrice) / entryPrice) * 100;
    }
  }

  // ==================== PUBLIC UTILITY METHODS ====================

  /**
   * Validate trailing TP configuration
   */
  static validateConfig(config: TrailingTPConfig): TrailingTPValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (config.trailingPercent < MIN_TRAILING_PERCENT) {
      errors.push(
        `Trailing percent must be at least ${MIN_TRAILING_PERCENT}%`
      );
    }

    if (config.trailingPercent > MAX_TRAILING_PERCENT) {
      errors.push(
        `Trailing percent cannot exceed ${MAX_TRAILING_PERCENT}%`
      );
    }

    if (config.activationPercent && config.activationPercent < 0) {
      errors.push("Activation percent cannot be negative");
    }

    if (config.activationPercent && config.activationPercent > 100) {
      warnings.push(
        "Activation percent > 100% may never be triggered"
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get config from BotConfig model
   */
  static getConfigFromBotConfig(botConfig: {
    tpTrailingEnabled: boolean;
    tpTrailingPercent: number | null;
    tpTrailingOnlyIfNotDefinedByGroup: boolean;
  }): TrailingTPConfig {
    return {
      enabled: botConfig.tpTrailingEnabled,
      trailingPercent: botConfig.tpTrailingPercent ?? 1.0,
      onlyIfNotDefinedByGroup: botConfig.tpTrailingOnlyIfNotDefinedByGroup,
    };
  }

  /**
   * Check if feature should be used based on "Only if not defined by group"
   */
  static shouldUseFeature(
    config: TrailingTPConfig,
    signalHasTrailingTPConfig: boolean
  ): boolean {
    if (!config.enabled) return false;
    if (config.onlyIfNotDefinedByGroup && signalHasTrailingTPConfig) return false;
    return true;
  }

  /**
   * Initialize trailing TP for a position
   */
  static async initializeTrailingTP(
    positionId: string,
    config: TrailingTPConfig
  ): Promise<{ success: boolean; state?: TrailingTPState; error?: string }> {
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

      if (position.status !== "OPEN") {
        return { success: false, error: `Position is not OPEN: ${position.status}` };
      }

      // Initialize state
      const state = await this.initializeState(positionId, position, config);

      return { success: true, state };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Clear trailing TP state for a position
   */
  static clearTrailingTPState(positionId: string): void {
    this.activeTrailingTPs.delete(positionId);
  }

  /**
   * Manually trigger trailing TP for a position
   */
  static async manualTrigger(
    positionId: string,
    reason?: string
  ): Promise<TrailingTPResult> {
    const state = this.activeTrailingTPs.get(positionId);

    if (!state) {
      return {
        success: false,
        positionId,
        status: "INACTIVE",
        triggered: false,
        error: "No trailing TP state found for position",
      };
    }

    const calculation: TrailingTPCalculation = {
      newTPPrice: state.currentTPPrice,
      previousTPPrice: state.currentTPPrice,
      highestPrice: state.highestPrice,
      lowestPrice: state.lowestPrice,
      shouldTrigger: true,
      shouldUpdate: false,
      profitPercent: state.lockedInProfitPercent,
      trailingDistance: state.trailingPercent,
      reason: reason ?? "Manual trigger",
    };

    await this.executeTrailingTP(positionId, state, calculation);

    return {
      success: true,
      positionId,
      status: "TRIGGERED",
      triggered: true,
      newTPPrice: state.currentTPPrice,
      highestPrice: state.highestPrice,
      lowestPrice: state.lowestPrice,
      profitLocked: state.lockedInProfitPercent,
      reason: reason ?? "Manual trigger",
    };
  }

  /**
   * Get statistics for a trailing TP
   */
  static getStatistics(state: TrailingTPState): {
    profitPercent: number;
    maxProfitPercent: number;
    lockedInProfitPercent: number;
    trailingDistanceFromPeak: number;
    updatesCount: number;
    isActive: boolean;
  } {
    return {
      profitPercent: state.lockedInProfitPercent,
      maxProfitPercent: state.maxProfitPercent,
      lockedInProfitPercent: state.lockedInProfitPercent,
      trailingDistanceFromPeak: state.trailingPercent,
      updatesCount: state.updateCount,
      isActive: state.status === "TRACKING",
    };
  }
}

export default TrailingTPService;
