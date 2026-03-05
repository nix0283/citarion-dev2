/**
 * Trailing Entry Service
 *
 * Implements Cornix-style "Trailing Entry" feature:
 * - Creates a trailing order that follows price before entry
 * - For LONG: Trail ABOVE minimum price reached (enter when price reverses up)
 * - For SHORT: Trail BELOW maximum price reached (enter when price reverses down)
 *
 * This allows capturing optimal entry by waiting for price reversal confirmation
 * instead of entering immediately at the signal entry price.
 *
 * @see https://help.cornix.io/en/articles/5814857-trailing-entry
 */

import { db } from "@/lib/db";

// ==================== TYPES ====================

export type TrailingEntryStatus =
  | "PENDING"      // Waiting for price to reach entry zone
  | "TRACKING"     // Actively tracking min/max price
  | "TRIGGERED"    // Entry triggered, ready to execute
  | "EXECUTED"     // Entry executed successfully
  | "CANCELLED"    // Manually cancelled
  | "EXPIRED";     // Expired without execution

export interface TrailingEntryConfig {
  enabled: boolean;
  trailingPercent: number; // Percentage to trail (e.g., 1.0 = 1%)
  onlyIfNotDefinedByGroup: boolean; // Use as fallback only
  timeoutSeconds?: number; // Optional timeout for trailing entry
}

export interface TrailingEntryState {
  signalId: number;
  symbol: string;
  direction: "LONG" | "SHORT";

  // Original entry information
  originalEntryPrice: number;
  entryPrices: number[]; // All entry prices from signal

  // Trailing state
  status: TrailingEntryStatus;
  trailingPercent: number;

  // Price tracking
  minimumPrice?: number; // Lowest price reached (for LONG)
  maximumPrice?: number; // Highest price reached (for SHORT)
  trailingEntryPrice?: number; // Current trailing entry trigger price

  // Timing
  startedAt: Date;
  lastUpdateAt?: Date;
  triggeredAt?: Date;
  executedAt?: Date;
  expiresAt?: Date;

  // Execution result
  executedPrice?: number;
  positionId?: string;

  // Update count for analytics
  updateCount: number;
  priceUpdates: number; // Number of times min/max was updated
}

export interface TrailingEntryResult {
  success: boolean;
  signalId: number;
  status: TrailingEntryStatus;
  entryTriggered: boolean;
  entryPrice?: number;
  minimumPrice?: number;
  maximumPrice?: number;
  trailingEntryPrice?: number;
  positionId?: string;
  error?: string;
  reason?: string;
}

export interface TrailingEntryCalculation {
  shouldTrigger: boolean;
  trailingEntryPrice: number;
  previousTrailingPrice?: number;
  minimumPrice: number;
  maximumPrice: number;
  priceMovement: number;
  reason: string;
}

export interface TrailingEntryValidation {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// ==================== CONSTANTS ====================

const MIN_TRAILING_PERCENT = 0.1; // 0.1% minimum trailing distance
const MAX_TRAILING_PERCENT = 20; // 20% maximum trailing distance
const DEFAULT_TIMEOUT_SECONDS = 86400; // 24 hours default timeout

// ==================== MAIN SERVICE ====================

export class TrailingEntryService {
  /**
   * Calculate the trailing entry price based on direction and tracked prices
   *
   * For LONG positions:
   * - Track minimum price as price drops
   * - Trail entry price ABOVE minimum price by trailing percent
   * - Trigger entry when price reverses UP to hit trailing entry price
   *
   * For SHORT positions:
   * - Track maximum price as price rises
   * - Trail entry price BELOW maximum price by trailing percent
   * - Trigger entry when price reverses DOWN to hit trailing entry price
   */
  static calculateTrailingEntryPrice(
    currentPrice: number,
    direction: "LONG" | "SHORT",
    trailingPercent: number,
    state?: TrailingEntryState
  ): TrailingEntryCalculation {
    // Initialize min/max from state or current price
    let minimumPrice = state?.minimumPrice ?? currentPrice;
    let maximumPrice = state?.maximumPrice ?? currentPrice;

    // Update tracked prices based on direction
    if (direction === "LONG") {
      // For LONG: Track the lowest price reached
      minimumPrice = Math.min(minimumPrice, currentPrice);
      maximumPrice = currentPrice; // Update max to current for reference
    } else {
      // For SHORT: Track the highest price reached
      maximumPrice = Math.max(maximumPrice, currentPrice);
      minimumPrice = currentPrice; // Update min to current for reference
    }

    // Calculate trailing entry price
    let trailingEntryPrice: number;
    let previousTrailingPrice = state?.trailingEntryPrice;

    if (direction === "LONG") {
      // For LONG: Entry price is ABOVE minimum (we want to buy on reversal up)
      // Trail at (minimum + trailing percent) - enter when price reverses up to this level
      trailingEntryPrice = minimumPrice * (1 + trailingPercent / 100);
    } else {
      // For SHORT: Entry price is BELOW maximum (we want to sell on reversal down)
      // Trail at (maximum - trailing percent) - enter when price reverses down to this level
      trailingEntryPrice = maximumPrice * (1 - trailingPercent / 100);
    }

    // Determine if entry should trigger
    let shouldTrigger = false;
    let reason = "";

    if (state?.status === "TRIGGERED" || state?.status === "EXECUTED") {
      // Already triggered or executed
      shouldTrigger = state.status === "TRIGGERED";
      reason = state.status === "TRIGGERED" ? "Entry already triggered" : "Entry already executed";
    } else if (direction === "LONG") {
      // LONG: Trigger when price moves UP to hit trailing entry price
      if (currentPrice >= trailingEntryPrice) {
        shouldTrigger = true;
        reason = `LONG entry triggered: price ${currentPrice.toFixed(4)} reversed up to trailing entry ${trailingEntryPrice.toFixed(4)} (min: ${minimumPrice.toFixed(4)})`;
      } else {
        reason = `LONG tracking: price ${currentPrice.toFixed(4)}, trailing entry at ${trailingEntryPrice.toFixed(4)}, min: ${minimumPrice.toFixed(4)}`;
      }
    } else {
      // SHORT: Trigger when price moves DOWN to hit trailing entry price
      if (currentPrice <= trailingEntryPrice) {
        shouldTrigger = true;
        reason = `SHORT entry triggered: price ${currentPrice.toFixed(4)} reversed down to trailing entry ${trailingEntryPrice.toFixed(4)} (max: ${maximumPrice.toFixed(4)})`;
      } else {
        reason = `SHORT tracking: price ${currentPrice.toFixed(4)}, trailing entry at ${trailingEntryPrice.toFixed(4)}, max: ${maximumPrice.toFixed(4)}`;
      }
    }

    // Calculate price movement from original entry
    const originalEntry = state?.originalEntryPrice ?? currentPrice;
    const priceMovement = ((currentPrice - originalEntry) / originalEntry) * 100;

    return {
      shouldTrigger,
      trailingEntryPrice,
      previousTrailingPrice,
      minimumPrice,
      maximumPrice,
      priceMovement,
      reason,
    };
  }

  /**
   * Check if entry should be triggered based on current market conditions
   */
  static shouldTriggerEntry(
    currentPrice: number,
    trailingPrice: number,
    direction: "LONG" | "SHORT"
  ): boolean {
    if (direction === "LONG") {
      // LONG: Trigger when price rises to or above trailing entry price
      return currentPrice >= trailingPrice;
    } else {
      // SHORT: Trigger when price falls to or below trailing entry price
      return currentPrice <= trailingPrice;
    }
  }

  /**
   * Process trailing entry for a signal
   * Main entry point for the trailing entry logic
   */
  static async processTrailingEntry(
    signalId: number,
    config: TrailingEntryConfig,
    marketPrice: number
  ): Promise<TrailingEntryResult> {
    try {
      // Get signal details
      const signal = await db.signal.findUnique({
        where: { signalId },
      });

      if (!signal) {
        return {
          success: false,
          signalId,
          status: "CANCELLED",
          entryTriggered: false,
          error: `Signal #${signalId} not found`,
        };
      }

      // Check if signal is still pending
      if (signal.status !== "PENDING") {
        return {
          success: true,
          signalId,
          status: this.parseStatus(signal.status),
          entryTriggered: signal.status === "ACTIVE",
          reason: `Signal already ${signal.status}`,
        };
      }

      // Parse existing state or create new
      let state: TrailingEntryState;
      const existingState = signal.trailingConfig;

      if (existingState && typeof existingState === "string") {
        try {
          const parsed = JSON.parse(existingState);
          if (parsed.signalId && parsed.trailingEntryPrice !== undefined) {
            state = parsed as TrailingEntryState;
          } else {
            state = await this.createInitialState(signal, config);
          }
        } catch {
          state = await this.createInitialState(signal, config);
        }
      } else if (existingState && typeof existingState === "object") {
        state = existingState as unknown as TrailingEntryState;
      } else {
        state = await this.createInitialState(signal, config);
      }

      // Check for timeout
      if (state.expiresAt && new Date() > new Date(state.expiresAt)) {
        await this.updateSignalStatus(signalId, "EXPIRED", state);
        return {
          success: true,
          signalId,
          status: "EXPIRED",
          entryTriggered: false,
          reason: "Trailing entry expired",
        };
      }

      // Calculate trailing entry
      const calculation = this.calculateTrailingEntryPrice(
        marketPrice,
        signal.direction as "LONG" | "SHORT",
        config.trailingPercent,
        state
      );

      // Update state with new price tracking
      state.minimumPrice = calculation.minimumPrice;
      state.maximumPrice = calculation.maximumPrice;
      state.trailingEntryPrice = calculation.trailingEntryPrice;
      state.lastUpdateAt = new Date();
      state.updateCount++;
      state.priceUpdates += calculation.previousTrailingPrice !== calculation.trailingEntryPrice ? 1 : 0;

      // Log the calculation
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[TRAILING ENTRY] Signal #${signalId}: ${calculation.reason}`,
          details: JSON.stringify({
            signalId,
            direction: signal.direction,
            marketPrice,
            minimumPrice: calculation.minimumPrice,
            maximumPrice: calculation.maximumPrice,
            trailingEntryPrice: calculation.trailingEntryPrice,
            shouldTrigger: calculation.shouldTrigger,
            status: state.status,
          }),
        },
      });

      // Check if entry should trigger
      if (calculation.shouldTrigger && state.status === "TRACKING") {
        state.status = "TRIGGERED";
        state.triggeredAt = new Date();

        // Execute the entry using a transaction
        const result = await db.$transaction(async (tx) => {
          // Update signal status
          const updatedSignal = await tx.signal.update({
            where: { signalId },
            data: {
              status: "ACTIVE",
              processedAt: new Date(),
              trailingConfig: JSON.stringify(state),
            },
          });

          // Log the trigger
          await tx.systemLog.create({
            data: {
              level: "INFO",
              category: "TRADE",
              message: `[TRAILING ENTRY] Signal #${signalId} triggered at ${calculation.trailingEntryPrice}`,
              details: JSON.stringify({
                signalId,
                direction: signal.direction,
                triggeredAt: state.triggeredAt,
                entryPrice: calculation.trailingEntryPrice,
                minimumPrice: calculation.minimumPrice,
                maximumPrice: calculation.maximumPrice,
              }),
            },
          });

          return { signalId: updatedSignal.signalId };
        });

        return {
          success: true,
          signalId,
          status: "TRIGGERED",
          entryTriggered: true,
          entryPrice: calculation.trailingEntryPrice,
          minimumPrice: calculation.minimumPrice,
          maximumPrice: calculation.maximumPrice,
          trailingEntryPrice: calculation.trailingEntryPrice,
          reason: calculation.reason,
        };
      }

      // Update state in database (no trigger yet)
      await db.signal.update({
        where: { signalId },
        data: {
          trailingConfig: JSON.stringify(state),
        },
      });

      // Update status to TRACKING if was PENDING
      if (state.status === "PENDING") {
        state.status = "TRACKING";
        await db.signal.update({
          where: { signalId },
          data: {
            trailingConfig: JSON.stringify(state),
          },
        });
      }

      return {
        success: true,
        signalId,
        status: state.status,
        entryTriggered: false,
        minimumPrice: calculation.minimumPrice,
        maximumPrice: calculation.maximumPrice,
        trailingEntryPrice: calculation.trailingEntryPrice,
        reason: calculation.reason,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Log error
      await db.systemLog.create({
        data: {
          level: "ERROR",
          category: "TRADE",
          message: `[TRAILING ENTRY] Error processing signal ${signalId}`,
          details: JSON.stringify({
            signalId,
            error: errorMessage,
            marketPrice,
          }),
        },
      });

      return {
        success: false,
        signalId,
        status: "PENDING",
        entryTriggered: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Create a pending trailing entry order
   */
  static async createTrailingEntryOrder(
    signalId: number,
    config: TrailingEntryConfig
  ): Promise<{ success: boolean; state?: TrailingEntryState; error?: string }> {
    try {
      // Validate config
      const validation = this.validateConfig(config);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid config: ${validation.errors.join(", ")}`,
        };
      }

      // Get signal
      const signal = await db.signal.findUnique({
        where: { signalId },
      });

      if (!signal) {
        return { success: false, error: "Signal not found" };
      }

      // Check if signal is pending
      if (signal.status !== "PENDING") {
        return {
          success: false,
          error: `Signal is not pending (status: ${signal.status})`,
        };
      }

      // Create initial state
      const state = await this.createInitialState(signal, config);

      // Save to database
      await db.signal.update({
        where: { signalId },
        data: {
          trailingConfig: JSON.stringify(state),
        },
      });

      // Log creation
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[TRAILING ENTRY] Created for signal #${signalId}`,
          details: JSON.stringify({
            signalId,
            symbol: signal.symbol,
            direction: signal.direction,
            trailingPercent: config.trailingPercent,
            originalEntryPrice: state.originalEntryPrice,
            entryPrices: state.entryPrices,
            timeoutSeconds: config.timeoutSeconds,
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
   * Cancel a trailing entry
   */
  static async cancelTrailingEntry(signalId: number): Promise<TrailingEntryResult> {
    try {
      const signal = await db.signal.findUnique({
        where: { signalId },
      });

      if (!signal) {
        return {
          success: false,
          signalId,
          status: "CANCELLED",
          entryTriggered: false,
          error: `Signal #${signalId} not found`,
        };
      }

      // Parse current state
      let state: TrailingEntryState | null = null;
      if (signal.trailingConfig) {
        try {
          const parsed = typeof signal.trailingConfig === "string"
            ? JSON.parse(signal.trailingConfig)
            : signal.trailingConfig;
          if (parsed.signalId) {
            state = parsed as TrailingEntryState;
          }
        } catch {
          // Ignore parse errors
        }
      }

      // Update status to cancelled
      const cancelledState: TrailingEntryState = {
        ...(state || {
          signalId,
          symbol: signal.symbol,
          direction: signal.direction as "LONG" | "SHORT",
          originalEntryPrice: 0,
          entryPrices: [],
          trailingPercent: 0,
          status: "CANCELLED",
          startedAt: new Date(),
          updateCount: 0,
          priceUpdates: 0,
        }),
        status: "CANCELLED",
        lastUpdateAt: new Date(),
      };

      await db.$transaction(async (tx) => {
        // Update signal
        await tx.signal.update({
          where: { signalId },
          data: {
            status: "CANCELLED",
            trailingConfig: JSON.stringify(cancelledState),
          },
        });

        // Log cancellation
        await tx.systemLog.create({
          data: {
            level: "INFO",
            category: "TRADE",
            message: `[TRAILING ENTRY] Cancelled for signal #${signalId}`,
            details: JSON.stringify({
              signalId,
              symbol: signal.symbol,
              direction: signal.direction,
              cancelledAt: new Date(),
              previousStatus: state?.status,
            }),
          },
        });
      });

      return {
        success: true,
        signalId,
        status: "CANCELLED",
        entryTriggered: false,
        reason: "Trailing entry cancelled by user",
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        signalId,
        status: "PENDING",
        entryTriggered: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get all active trailing entries
   */
  static async getActiveTrailingEntries(): Promise<TrailingEntryState[]> {
    try {
      const signals = await db.signal.findMany({
        where: {
          status: "PENDING",
          trailingConfig: { not: null },
        },
      });

      const activeEntries: TrailingEntryState[] = [];

      for (const signal of signals) {
        try {
          const parsed = typeof signal.trailingConfig === "string"
            ? JSON.parse(signal.trailingConfig)
            : signal.trailingConfig;

          if (parsed && parsed.signalId && parsed.status) {
            const state = parsed as TrailingEntryState;
            // Only include entries that are actively tracking
            if (state.status === "PENDING" || state.status === "TRACKING") {
              activeEntries.push(state);
            }
          }
        } catch {
          // Skip invalid entries
        }
      }

      return activeEntries;

    } catch (error) {
      console.error("[Trailing Entry] Error getting active entries:", error);
      return [];
    }
  }

  /**
   * Get trailing entry state for a specific signal
   */
  static async getTrailingEntryState(signalId: number): Promise<TrailingEntryState | null> {
    try {
      const signal = await db.signal.findUnique({
        where: { signalId },
      });

      if (!signal?.trailingConfig) {
        return null;
      }

      const parsed = typeof signal.trailingConfig === "string"
        ? JSON.parse(signal.trailingConfig)
        : signal.trailingConfig;

      if (!parsed.signalId) {
        return null;
      }

      return parsed as TrailingEntryState;

    } catch {
      return null;
    }
  }

  /**
   * Validate configuration
   */
  static validateConfig(config: TrailingEntryConfig): TrailingEntryValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check enabled status
    if (!config.enabled) {
      return { valid: true, errors: [], warnings: ["Trailing entry is disabled"] };
    }

    // Validate trailing percent
    if (config.trailingPercent < MIN_TRAILING_PERCENT) {
      errors.push(`Trailing percent must be at least ${MIN_TRAILING_PERCENT}%`);
    }
    if (config.trailingPercent > MAX_TRAILING_PERCENT) {
      errors.push(`Trailing percent cannot exceed ${MAX_TRAILING_PERCENT}%`);
    }

    // Validate timeout
    if (config.timeoutSeconds !== undefined && config.timeoutSeconds < 60) {
      errors.push("Timeout must be at least 60 seconds");
    }
    if (config.timeoutSeconds !== undefined && config.timeoutSeconds > 604800) {
      warnings.push("Timeout exceeds 7 days, may not be practical");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get config from BotConfig
   */
  static getConfigFromBotConfig(botConfig: {
    trailingEntryEnabled: boolean;
    trailingEntryPercent: number | null;
    trailingEntryOnlyIfNotDefinedByGroup: boolean;
  }): TrailingEntryConfig {
    return {
      enabled: botConfig.trailingEntryEnabled,
      trailingPercent: botConfig.trailingEntryPercent ?? 1.0,
      onlyIfNotDefinedByGroup: botConfig.trailingEntryOnlyIfNotDefinedByGroup,
      timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    };
  }

  /**
   * Check if feature should be used based on "Only if not defined by group"
   */
  static shouldUseFeature(
    config: TrailingEntryConfig,
    signalHasTrailingEntryConfig: boolean
  ): boolean {
    if (!config.enabled) return false;
    if (config.onlyIfNotDefinedByGroup && signalHasTrailingEntryConfig) return false;
    return true;
  }

  /**
   * Process all active trailing entries
   * Should be called periodically by a scheduler
   */
  static async processAllActiveTrailingEntries(): Promise<{
    processed: number;
    triggered: number;
    errors: number;
    results: TrailingEntryResult[];
  }> {
    const results: TrailingEntryResult[] = [];
    let triggered = 0;
    let errors = 0;

    try {
      // Get all active trailing entries
      const activeEntries = await this.getActiveTrailingEntries();

      for (const state of activeEntries) {
        // Get current market price
        const marketPrice = await db.marketPrice.findUnique({
          where: { symbol: state.symbol },
        });

        if (!marketPrice) {
          errors++;
          continue;
        }

        // Get bot config for this signal
        const signal = await db.signal.findUnique({
          where: { signalId: state.signalId },
        });

        if (!signal) {
          errors++;
          continue;
        }

        // Create config from state
        const config: TrailingEntryConfig = {
          enabled: true,
          trailingPercent: state.trailingPercent,
          onlyIfNotDefinedByGroup: false,
        };

        // Process trailing entry
        const result = await this.processTrailingEntry(
          state.signalId,
          config,
          marketPrice.price
        );

        results.push(result);

        if (result.entryTriggered) {
          triggered++;
        }
        if (!result.success) {
          errors++;
        }
      }

      return {
        processed: activeEntries.length,
        triggered,
        errors,
        results,
      };

    } catch (error) {
      console.error("[Trailing Entry Batch] Error:", error);
      return {
        processed: 0,
        triggered: 0,
        errors: 1,
        results,
      };
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Create initial trailing entry state
   */
  private static async createInitialState(
    signal: {
      signalId: number;
      symbol: string;
      direction: string;
      entryPrices: string | null;
    },
    config: TrailingEntryConfig
  ): Promise<TrailingEntryState> {
    // Parse entry prices
    let entryPrices: number[] = [];
    if (signal.entryPrices) {
      try {
        entryPrices = JSON.parse(signal.entryPrices);
      } catch {
        entryPrices = [];
      }
    }

    const originalEntryPrice = entryPrices[0] || 0;
    const now = new Date();

    return {
      signalId: signal.signalId,
      symbol: signal.symbol,
      direction: signal.direction as "LONG" | "SHORT",
      originalEntryPrice,
      entryPrices,
      status: "PENDING",
      trailingPercent: config.trailingPercent,
      startedAt: now,
      expiresAt: config.timeoutSeconds
        ? new Date(now.getTime() + config.timeoutSeconds * 1000)
        : undefined,
      updateCount: 0,
      priceUpdates: 0,
    };
  }

  /**
   * Update signal status
   */
  private static async updateSignalStatus(
    signalId: number,
    status: TrailingEntryStatus,
    state: TrailingEntryState
  ): Promise<void> {
    await db.signal.update({
      where: { signalId },
      data: {
        status: status === "EXPIRED" ? "CANCELLED" : "PENDING",
        trailingConfig: JSON.stringify({
          ...state,
          status,
          lastUpdateAt: new Date(),
        }),
      },
    });
  }

  /**
   * Parse status from signal status string
   */
  private static parseStatus(signalStatus: string): TrailingEntryStatus {
    switch (signalStatus) {
      case "ACTIVE":
        return "EXECUTED";
      case "CANCELLED":
        return "CANCELLED";
      case "PENDING":
        return "TRACKING";
      default:
        return "PENDING";
    }
  }
}

export default TrailingEntryService;
