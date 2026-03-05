/**
 * First Entry as Market Service
 *
 * Implements Cornix-style "First Entry as Market" feature:
 * - Maximum Price Cap: 0.05% - 20% (Cornix spec)
 * - Two activation modes: "Entry Price Reached" or "Immediately"
 * - Iteratively increases entry price by small intervals until filled or cap reached
 * - Uses LIMIT orders (not market orders) to prevent entering above cap
 *
 * @see https://help.cornix.io/en/articles/5814856-first-entry-as-market
 */

import { db } from "@/lib/db";

// ==================== TYPES ====================

export interface FirstEntryMarketConfig {
  enabled: boolean;
  mode: "IMMEDIATE" | "ENTRY_PRICE_REACHED"; // Cornix naming
  maxPriceCapPercent: number; // 0.05 - 20 (%) - Cornix spec
  onlyIfNotDefinedByGroup: boolean; // Use as fallback
}

export interface EntryPriceCalculation {
  originalEntryPrice: number;
  cappedEntryPrice: number;
  currentMarketPrice: number;
  priceDiffPercent: number;
  shouldExecute: boolean;
  executionType: "MARKET" | "LIMIT" | "WAIT";
  limitPrice?: number;
  nextIterationPrice?: number; // For iterative price increases
  iteration?: number;
  maxIterations?: number;
  reason: string;
}

export interface FirstEntryExecutionResult {
  success: boolean;
  executedPrice?: number;
  orderType: "MARKET" | "LIMIT";
  cappedPrice: number;
  originalEntryPrice: number;
  savedPercent?: number;
  error?: string;
  retryScheduled?: boolean;
  nextIteration?: number;
}

// Iteration state for tracking price increases
interface IterationState {
  signalId: number;
  originalEntryPrice: number;
  cappedPrice: number;
  currentIteration: number;
  currentPrice: number;
  direction: "LONG" | "SHORT";
  lastUpdate: Date;
}

// ==================== CONSTANTS ====================

// Cornix-style small interval increments (0.1% per iteration)
const PRICE_INCREMENT_PERCENT = 0.1; // 0.1% increase per iteration
const MAX_ITERATIONS = 200; // Max 200 iterations (20% / 0.1% = 200)
const ITERATION_INTERVAL_MS = 500; // 500ms between iterations

// ==================== MAIN SERVICE ====================

export class FirstEntryMarketService {
  // In-memory iteration state (in production, use Redis)
  private static iterationStates: Map<number, IterationState> = new Map();

  /**
   * Calculate entry price with market cap applied
   * Cornix: Iteratively increases price by small intervals
   */
  static calculateEntryPrice(
    originalEntryPrice: number,
    currentMarketPrice: number,
    direction: "LONG" | "SHORT",
    config: FirstEntryMarketConfig,
    currentIteration: number = 0
  ): EntryPriceCalculation {
    // Calculate capped price based on direction
    // For LONG: cap is ABOVE entry price (max we're willing to pay)
    // For SHORT: cap is BELOW entry price (max we're willing to sell at)
    const capMultiplier = direction === "LONG"
      ? 1 + (config.maxPriceCapPercent / 100)
      : 1 - (config.maxPriceCapPercent / 100);

    const cappedEntryPrice = originalEntryPrice * capMultiplier;

    // Calculate current iteration price (iterative increase)
    // Cornix: "iteratively increase the first entry target price by small intervals"
    const iterationIncrement = currentIteration * (PRICE_INCREMENT_PERCENT / 100);
    const iterationMultiplier = direction === "LONG"
      ? 1 + iterationIncrement
      : 1 - iterationIncrement;
    const iterationPrice = originalEntryPrice * iterationMultiplier;

    // Calculate price difference from original entry
    const priceDiffPercent = ((currentMarketPrice - originalEntryPrice) / originalEntryPrice) * 100;

    // Determine execution strategy
    let shouldExecute = false;
    let executionType: "MARKET" | "LIMIT" | "WAIT" = "LIMIT";
    let limitPrice: number | undefined;
    let nextIterationPrice: number | undefined;
    let reason = "";

    const maxIterations = Math.ceil(config.maxPriceCapPercent / PRICE_INCREMENT_PERCENT);

    if (config.mode === "IMMEDIATE") {
      // IMMEDIATE mode: Create range immediately when trade opens
      if (direction === "LONG") {
        // For LONG, we want to buy - start at entry price, increase up to cap
        const targetPrice = Math.min(iterationPrice || currentMarketPrice, cappedEntryPrice);
        
        if (currentMarketPrice <= targetPrice) {
          shouldExecute = true;
          executionType = "LIMIT";
          limitPrice = Math.min(targetPrice, cappedEntryPrice);
          reason = `Immediate mode: executing at iteration price ${limitPrice.toFixed(4)}`;
        } else if (currentMarketPrice <= cappedEntryPrice) {
          // Market price above iteration price but within cap
          shouldExecute = true;
          executionType = "LIMIT";
          limitPrice = Math.min(currentMarketPrice, cappedEntryPrice);
          reason = "Market price within cap range, executing";
        } else {
          // Market price above cap - still execute at cap (Cornix behavior)
          shouldExecute = true;
          executionType = "LIMIT";
          limitPrice = cappedEntryPrice;
          reason = `Market above cap, executing at capped price`;
        }
      } else {
        // SHORT direction
        const targetPrice = Math.max(iterationPrice || currentMarketPrice, cappedEntryPrice);
        
        if (currentMarketPrice >= targetPrice) {
          shouldExecute = true;
          executionType = "LIMIT";
          limitPrice = Math.max(targetPrice, cappedEntryPrice);
          reason = `Immediate mode: executing at iteration price ${limitPrice.toFixed(4)}`;
        } else if (currentMarketPrice >= cappedEntryPrice) {
          shouldExecute = true;
          executionType = "LIMIT";
          limitPrice = Math.max(currentMarketPrice, cappedEntryPrice);
          reason = "Market price within cap range, executing";
        } else {
          shouldExecute = true;
          executionType = "LIMIT";
          limitPrice = cappedEntryPrice;
          reason = `Market below cap, executing at capped price`;
        }
      }

      // Calculate next iteration if not fully filled
      if (currentIteration < maxIterations) {
        const nextIter = currentIteration + 1;
        const nextIncrement = nextIter * (PRICE_INCREMENT_PERCENT / 100);
        nextIterationPrice = direction === "LONG"
          ? originalEntryPrice * (1 + nextIncrement)
          : originalEntryPrice * (1 - nextIncrement);
      }

    } else {
      // ENTRY_PRICE_REACHED mode: Wait for signal entry price to be reached first
      if (direction === "LONG") {
        // Check if entry price was reached (price <= entry)
        if (currentMarketPrice <= originalEntryPrice) {
          // Entry price reached - now can execute within cap range
          shouldExecute = true;
          executionType = "LIMIT";
          limitPrice = Math.min(currentMarketPrice * 1.0005, cappedEntryPrice); // Small slippage buffer
          reason = "Entry price reached, executing with cap protection";
          
          if (currentIteration < maxIterations) {
            const nextIter = currentIteration + 1;
            const nextIncrement = nextIter * (PRICE_INCREMENT_PERCENT / 100);
            nextIterationPrice = originalEntryPrice * (1 + nextIncrement);
          }
        } else if (currentMarketPrice <= cappedEntryPrice) {
          // Price between entry and cap - can still execute
          shouldExecute = true;
          executionType = "LIMIT";
          limitPrice = Math.min(currentMarketPrice, cappedEntryPrice);
          reason = "Price within entry zone (entry to cap), executing";
        } else {
          // Price above cap - wait for pullback
          shouldExecute = false;
          executionType = "WAIT";
          reason = `Price ${priceDiffPercent.toFixed(2)}% above entry, waiting for entry price to be reached`;
        }
      } else {
        // SHORT direction
        if (currentMarketPrice >= originalEntryPrice) {
          shouldExecute = true;
          executionType = "LIMIT";
          limitPrice = Math.max(currentMarketPrice * 0.9995, cappedEntryPrice);
          reason = "Entry price reached, executing with cap protection";
          
          if (currentIteration < maxIterations) {
            const nextIter = currentIteration + 1;
            const nextIncrement = nextIter * (PRICE_INCREMENT_PERCENT / 100);
            nextIterationPrice = originalEntryPrice * (1 - nextIncrement);
          }
        } else if (currentMarketPrice >= cappedEntryPrice) {
          shouldExecute = true;
          executionType = "LIMIT";
          limitPrice = Math.max(currentMarketPrice, cappedEntryPrice);
          reason = "Price within entry zone, executing";
        } else {
          shouldExecute = false;
          executionType = "WAIT";
          reason = `Price ${Math.abs(priceDiffPercent).toFixed(2)}% below entry, waiting for entry price`;
        }
      }
    }

    return {
      originalEntryPrice,
      cappedEntryPrice,
      currentMarketPrice,
      priceDiffPercent,
      shouldExecute,
      executionType,
      limitPrice,
      nextIterationPrice,
      iteration: currentIteration,
      maxIterations,
      reason,
    };
  }

  /**
   * Execute first entry with market cap protection
   * Implements iterative price increases per Cornix spec
   */
  static async executeFirstEntry(
    signalId: number,
    config: FirstEntryMarketConfig,
    marketPrice: number
  ): Promise<FirstEntryExecutionResult> {
    try {
      // Get signal details
      const signal = await db.signal.findUnique({
        where: { signalId },
        include: { position: true },
      });

      if (!signal) {
        return {
          success: false,
          orderType: "LIMIT",
          cappedPrice: 0,
          originalEntryPrice: 0,
          error: `Signal #${signalId} not found`,
        };
      }

      // Parse entry prices
      const entryPrices = signal.entryPrices ? JSON.parse(signal.entryPrices) : [];
      const firstEntryPrice = entryPrices[0] || marketPrice;

      // Get or create iteration state
      let state = this.iterationStates.get(signalId);
      if (!state) {
        state = {
          signalId,
          originalEntryPrice: firstEntryPrice,
          cappedPrice: firstEntryPrice * (signal.direction === "LONG" 
            ? (1 + config.maxPriceCapPercent / 100)
            : (1 - config.maxPriceCapPercent / 100)),
          currentIteration: 0,
          currentPrice: firstEntryPrice,
          direction: signal.direction as "LONG" | "SHORT",
          lastUpdate: new Date(),
        };
        this.iterationStates.set(signalId, state);
      }

      // Calculate execution parameters with current iteration
      const calculation = this.calculateEntryPrice(
        firstEntryPrice,
        marketPrice,
        signal.direction as "LONG" | "SHORT",
        config,
        state.currentIteration
      );

      // Log the calculation
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[FIRST ENTRY MARKET] Signal #${signalId}: Iteration ${state.currentIteration} - ${calculation.reason}`,
          details: JSON.stringify({
            signalId,
            direction: signal.direction,
            originalEntryPrice: calculation.originalEntryPrice,
            cappedEntryPrice: calculation.cappedEntryPrice,
            currentMarketPrice: calculation.currentMarketPrice,
            iteration: state.currentIteration,
            limitPrice: calculation.limitPrice,
            shouldExecute: calculation.shouldExecute,
          }),
        },
      });

      if (!calculation.shouldExecute) {
        return {
          success: false,
          orderType: "LIMIT",
          cappedPrice: calculation.cappedEntryPrice,
          originalEntryPrice: calculation.originalEntryPrice,
          error: calculation.reason,
          retryScheduled: true,
        };
      }

      // Increment iteration for next call
      if (state.currentIteration < (calculation.maxIterations || MAX_ITERATIONS)) {
        state.currentIteration++;
        state.lastUpdate = new Date();
      }

      // Calculate saved percentage
      let savedPercent = 0;
      if (signal.direction === "LONG" && calculation.limitPrice) {
        savedPercent = ((calculation.cappedEntryPrice - calculation.limitPrice) / calculation.cappedEntryPrice) * 100;
      } else if (signal.direction === "SHORT" && calculation.limitPrice) {
        savedPercent = ((calculation.limitPrice - calculation.cappedEntryPrice) / calculation.cappedEntryPrice) * 100;
      }

      return {
        success: true,
        executedPrice: calculation.limitPrice || marketPrice,
        orderType: "LIMIT",
        cappedPrice: calculation.cappedEntryPrice,
        originalEntryPrice: calculation.originalEntryPrice,
        savedPercent: Math.max(0, savedPercent),
        nextIteration: state.currentIteration,
      };

    } catch (error) {
      console.error("[First Entry Market] Execution error:", error);
      return {
        success: false,
        orderType: "LIMIT",
        cappedPrice: 0,
        originalEntryPrice: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check if feature should be used based on "Only if not defined by group"
   */
  static shouldUseFeature(
    config: FirstEntryMarketConfig,
    signalHasFirstEntryConfig: boolean
  ): boolean {
    if (!config.enabled) return false;
    if (config.onlyIfNotDefinedByGroup && signalHasFirstEntryConfig) return false;
    return true;
  }

  /**
   * Get config from BotConfig
   */
  static getConfigFromBotConfig(botConfig: {
    firstEntryAsMarket: boolean;
    firstEntryMode: string;
    firstEntryMaxPriceCap: number;
    firstEntryOnlyIfNotDefinedByGroup: boolean;
  }): FirstEntryMarketConfig {
    return {
      enabled: botConfig.firstEntryAsMarket,
      mode: botConfig.firstEntryMode as "IMMEDIATE" | "ENTRY_PRICE_REACHED",
      maxPriceCapPercent: botConfig.firstEntryMaxPriceCap,
      onlyIfNotDefinedByGroup: botConfig.firstEntryOnlyIfNotDefinedByGroup,
    };
  }

  /**
   * Validate config values per Cornix spec
   */
  static validateConfig(config: FirstEntryMarketConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Cornix spec: 0.05% - 20%
    if (config.maxPriceCapPercent < 0.05 || config.maxPriceCapPercent > 20) {
      errors.push("Max price cap must be between 0.05% and 20% (Cornix spec)");
    }

    if (!["IMMEDIATE", "ENTRY_PRICE_REACHED", "WAIT_ENTRY"].includes(config.mode)) {
      errors.push("Mode must be IMMEDIATE, ENTRY_PRICE_REACHED, or WAIT_ENTRY");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clear iteration state for a signal
   */
  static clearIterationState(signalId: number): void {
    this.iterationStates.delete(signalId);
  }

  /**
   * Get current iteration for a signal
   */
  static getCurrentIteration(signalId: number): number {
    const state = this.iterationStates.get(signalId);
    return state?.currentIteration || 0;
  }

  /**
   * Create pending entry order for WAIT mode
   */
  static async createPendingEntryOrder(
    signalId: number,
    entryPrice: number,
    cappedPrice: number,
    direction: "LONG" | "SHORT"
  ): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[PENDING ENTRY] Signal #${signalId}: Waiting for ${direction} entry at $${entryPrice} (cap: $${cappedPrice})`,
          details: JSON.stringify({
            signalId,
            entryPrice,
            cappedPrice,
            direction,
            type: "FIRST_ENTRY_MARKET_WAIT",
          }),
        },
      });

      return { success: true, orderId: `pending_${signalId}_${Date.now()}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Calculate entry ratios per Cornix strategies
   */
  static calculateEntryRatios(
    strategy: string,
    targetCount: number
  ): number[] {
    switch (strategy) {
      case "ONE_TARGET":
        return [100];
      
      case "TWO_TARGETS":
        return [50, 50];
      
      case "THREE_TARGETS":
        return [33.33, 33.33, 33.34];
      
      case "FIFTY_ON_FIRST":
        if (targetCount <= 1) return [100];
        const remaining = 50 / (targetCount - 1);
        return [50, ...Array(targetCount - 1).fill(remaining)];
      
      case "DECREASING_EXP":
        // First target gets largest percentage
        return this.calculateExponentialRatios(targetCount, false);
      
      case "INCREASING_EXP":
        // Last target gets largest percentage
        return this.calculateExponentialRatios(targetCount, true);
      
      case "SKIP_FIRST":
        if (targetCount <= 1) return [0];
        const evenSplit = 100 / (targetCount - 1);
        return [0, ...Array(targetCount - 1).fill(evenSplit)];
      
      case "EVENLY_DIVIDED":
      default:
        const split = 100 / targetCount;
        return Array(targetCount).fill(split);
    }
  }

  private static calculateExponentialRatios(count: number, increasing: boolean): number[] {
    // Powers of 2, normalized to sum to 100
    const weights: number[] = [];
    let total = 0;
    
    for (let i = 0; i < count; i++) {
      const power = increasing ? i : count - 1 - i;
      const weight = Math.pow(2, power);
      weights.push(weight);
      total += weight;
    }
    
    return weights.map(w => (w / total) * 100);
  }
}

export default FirstEntryMarketService;
