/**
 * Take-Profit Grace Service
 *
 * Implements Cornix-style "Take-Profit Grace" feature:
 * - Retry partially/unfilled TP orders at adjusted prices
 * - For LONG: progressively LOWER TP price on each retry
 * - For SHORT: progressively HIGHER TP price on each retry
 * - Retry interval between attempts
 * - Continues until full fill or max cap reached
 *
 * @see https://help.cornix.io/en/articles/11121738-take-profit-grace
 */

import { db } from "@/lib/db";

// ==================== TYPES ====================

export interface TPGraceConfig {
  enabled: boolean;
  capPercent: number; // Max total % price adjustment (0.01-2%)
  maxRetries: number; // Maximum retry attempts per TP target (1-10)
  retryIntervalSeconds: number; // Seconds between retry attempts
  onlyIfNotDefinedByGroup: boolean; // Use as fallback only
}

export interface TPTarget {
  index: number; // TP index (1-based)
  price: number;
  percentage: number; // % of position to close
  filled: number; // How much already filled (0-100)
  retries: number; // Number of retry attempts
  originalPrice: number; // Original TP price from signal
  status: "PENDING" | "PARTIAL" | "FILLED" | "EXHAUSTED";
}

export interface TPGraceCalculation {
  target: TPTarget;
  newPrice: number;
  priceAdjustment: number; // Total adjustment from original
  withinCap: boolean;
  remainingToFill: number;
  direction: "LONG" | "SHORT";
  nextRetryAt?: Date;
}

export interface TPGraceExecutionResult {
  success: boolean;
  tpIndex: number;
  originalPrice: number;
  newPrice: number;
  filledAmount: number;
  remainingAmount: number;
  retriesRemaining: number;
  error?: string;
  fullyFilled?: boolean;
  nextRetryAt?: Date;
}

export interface TPGraceState {
  positionId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  targets: TPTarget[];
  lastRetryAt?: Date;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
}

// ==================== CONSTANTS ====================

// Default retry interval (Cornix-like)
const DEFAULT_RETRY_INTERVAL = 5; // 5 seconds

// Small price increment per retry (Cornix uses small increments)
const PRICE_INCREMENT_PERCENT = 0.1; // 0.1% per retry iteration

// ==================== MAIN SERVICE ====================

export class TPGraceService {
  // In-memory state (in production, use Redis)
  private static graceStates: Map<string, TPGraceState> = new Map();

  /**
   * Calculate new TP price with grace adjustment
   * 
   * Cornix logic:
   * - For LONG: Lower TP price to increase fill probability
   * - For SHORT: Higher TP price to increase fill probability
   * - Progressively adjust in small increments
   */
  static calculateGracePrice(
    target: TPTarget,
    direction: "LONG" | "SHORT",
    config: TPGraceConfig
  ): TPGraceCalculation {
    // Calculate remaining to fill
    const remainingToFill = target.percentage - target.filled;

    // Check if already fully filled
    if (remainingToFill <= 0) {
      return {
        target: { ...target, status: "FILLED" },
        newPrice: target.price,
        priceAdjustment: 0,
        withinCap: true,
        remainingToFill: 0,
        direction,
      };
    }

    // Check if max retries reached
    if (target.retries >= config.maxRetries) {
      return {
        target: { ...target, status: "EXHAUSTED" },
        newPrice: target.price,
        priceAdjustment: Math.abs((target.price - target.originalPrice) / target.originalPrice) * 100,
        withinCap: false,
        remainingToFill,
        direction,
      };
    }

    // Calculate price adjustment based on retry count
    // Cornix: progressively adjusts price in small increments
    const adjustmentPerRetry = config.capPercent / config.maxRetries;
    const totalAdjustment = adjustmentPerRetry * (target.retries + 1);

    // For LONG: Lower price (sell lower to get filled)
    // For SHORT: Higher price (buy higher to get filled)
    const priceMultiplier = direction === "LONG"
      ? 1 - (totalAdjustment / 100)
      : 1 + (totalAdjustment / 100);

    const newPrice = target.originalPrice * priceMultiplier;
    const totalAdjustmentPercent = Math.abs((newPrice - target.originalPrice) / target.originalPrice) * 100;

    // Check if within cap
    const withinCap = totalAdjustmentPercent <= config.capPercent;

    // Calculate next retry time
    const nextRetryAt = new Date(Date.now() + config.retryIntervalSeconds * 1000);

    return {
      target: { ...target, status: "PARTIAL" },
      newPrice,
      priceAdjustment: totalAdjustmentPercent,
      withinCap,
      remainingToFill,
      direction,
      nextRetryAt,
    };
  }

  /**
   * Process TP Grace for a position
   * Checks all TP targets and retries unfilled/partially filled ones
   */
  static async processTPGrace(
    positionId: string,
    config: TPGraceConfig,
    currentMarketPrice: number
  ): Promise<TPGraceExecutionResult[]> {
    const results: TPGraceExecutionResult[] = [];

    try {
      // Get position with TP info
      const position = await db.position.findUnique({
        where: { id: positionId },
        include: { Signal: true },
      });

      if (!position) {
        return [{
          success: false,
          tpIndex: 0,
          originalPrice: 0,
          newPrice: 0,
          filledAmount: 0,
          remainingAmount: 0,
          retriesRemaining: 0,
          error: "Position not found",
        }];
      }

      // Parse TP targets from signal
      const signal = position.Signal;
      if (!signal?.takeProfits) {
        return [{
          success: false,
          tpIndex: 0,
          originalPrice: 0,
          newPrice: 0,
          filledAmount: 0,
          remainingAmount: 0,
          retriesRemaining: 0,
          error: "No TP targets found",
        }];
      }

      const tpTargetsData: Array<{ price: number; percentage: number }> = JSON.parse(signal.takeProfits);

      // Get or create grace state
      let state = this.graceStates.get(positionId);
      if (!state) {
        const targets: TPTarget[] = tpTargetsData.map((tp, idx) => ({
          index: idx + 1,
          price: tp.price,
          percentage: tp.percentage,
          filled: 0,
          retries: 0,
          originalPrice: tp.price,
          status: "PENDING" as const,
        }));

        state = {
          positionId,
          symbol: position.symbol,
          direction: position.direction as "LONG" | "SHORT",
          targets,
          status: "ACTIVE",
        };
        this.graceStates.set(positionId, state);
      }

      const direction = position.direction as "LONG" | "SHORT";

      // Process each TP target
      for (let i = 0; i < state.targets.length; i++) {
        const target = state.targets[i];

        // Skip if fully filled
        if (target.status === "FILLED") continue;

        // Skip if exhausted
        if (target.status === "EXHAUSTED") {
          results.push({
            success: false,
            tpIndex: target.index,
            originalPrice: target.originalPrice,
            newPrice: target.price,
            filledAmount: target.filled,
            remainingAmount: target.percentage - target.filled,
            retriesRemaining: 0,
            error: "Max retries reached for this TP target",
          });
          continue;
        }

        // Check if should apply TP Grace
        if (!this.shouldApplyTPGrace(target, config)) continue;

        // Calculate grace price
        const calculation = this.calculateGracePrice(target, direction, config);

        // Check if price is achievable
        let shouldRetry = false;
        if (direction === "LONG") {
          // For LONG, TP is above entry. If market is below new TP price, can retry
          shouldRetry = currentMarketPrice >= calculation.newPrice;
        } else {
          // For SHORT, TP is below entry. If market is above new TP price, can retry
          shouldRetry = currentMarketPrice <= calculation.newPrice;
        }

        // Log the calculation
        await db.systemLog.create({
          data: {
            level: "INFO",
            category: "TRADE",
            message: `[TP GRACE] Position ${positionId} TP${target.index}: Retry ${target.retries + 1} - ${shouldRetry ? 'Executing' : 'Price not achievable'}`,
            details: JSON.stringify({
              positionId,
              tpIndex: target.index,
              direction,
              originalPrice: target.originalPrice,
              newPrice: calculation.newPrice,
              adjustment: calculation.priceAdjustment.toFixed(4) + "%",
              marketPrice: currentMarketPrice,
              shouldRetry,
              withinCap: calculation.withinCap,
              retriesUsed: target.retries + 1,
            }),
          },
        });

        if (!shouldRetry) {
          results.push({
            success: false,
            tpIndex: target.index,
            originalPrice: target.originalPrice,
            newPrice: calculation.newPrice,
            filledAmount: target.filled,
            remainingAmount: calculation.remainingToFill,
            retriesRemaining: config.maxRetries - target.retries,
            error: "Current market price doesn't allow retry",
            nextRetryAt: calculation.nextRetryAt,
          });
          continue;
        }

        // Execute retry order
        const result = await this.executeTPRetry(
          positionId,
          target,
          calculation,
          direction
        );

        // Update state
        if (result.success) {
          state.targets[i].retries++;
          state.targets[i].price = calculation.newPrice;
          if (result.fullyFilled) {
            state.targets[i].status = "FILLED";
            state.targets[i].filled = target.percentage;
          } else {
            state.targets[i].status = "PARTIAL";
            state.targets[i].filled = target.filled + result.filledAmount;
          }
          state.lastRetryAt = new Date();
        }

        results.push(result);
      }

      // Check if all targets are filled or exhausted
      const allComplete = state.targets.every(t => t.status === "FILLED" || t.status === "EXHAUSTED");
      if (allComplete) {
        state.status = "COMPLETED";
      }

      return results;

    } catch (error) {
      console.error("[TP Grace] Processing error:", error);
      return [{
        success: false,
        tpIndex: 0,
        originalPrice: 0,
        newPrice: 0,
        filledAmount: 0,
        remainingAmount: 0,
        retriesRemaining: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      }];
    }
  }

  /**
   * Execute a single TP retry order
   */
  private static async executeTPRetry(
    positionId: string,
    target: TPTarget,
    calculation: TPGraceCalculation,
    direction: "LONG" | "SHORT"
  ): Promise<TPGraceExecutionResult> {
    try {
      const position = await db.position.findUnique({
        where: { id: positionId },
      });

      if (!position) {
        return {
          success: false,
          tpIndex: target.index,
          originalPrice: target.originalPrice,
          newPrice: calculation.newPrice,
          filledAmount: 0,
          remainingAmount: calculation.remainingToFill,
          retriesRemaining: 0,
          error: "Position not found",
        };
      }

      // Calculate amount to close (remaining percentage of position)
      const closeAmount = (position.totalAmount * calculation.remainingToFill) / 100;

      // Log the retry execution
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[TP GRACE] Executing retry for TP${target.index}: ${direction} ${position.symbol}`,
          details: JSON.stringify({
            positionId,
            tpIndex: target.index,
            direction,
            originalPrice: target.originalPrice,
            newPrice: calculation.newPrice,
            adjustment: calculation.priceAdjustment.toFixed(4) + "%",
            closeAmount,
            remainingToFill: calculation.remainingToFill,
            retryNumber: target.retries + 1,
          }),
        },
      });

      // Simulate fill (in production, place actual order on exchange)
      const simulatedFill = Math.min(closeAmount, calculation.remainingToFill);
      const fullyFilled = simulatedFill >= calculation.remainingToFill;

      return {
        success: true,
        tpIndex: target.index,
        originalPrice: target.originalPrice,
        newPrice: calculation.newPrice,
        filledAmount: simulatedFill,
        remainingAmount: calculation.remainingToFill - simulatedFill,
        retriesRemaining: calculation.target.retries < (await this.getConfig()).maxRetries
          ? (await this.getConfig()).maxRetries - target.retries - 1
          : 0,
        fullyFilled,
        nextRetryAt: calculation.nextRetryAt,
      };

    } catch (error) {
      return {
        success: false,
        tpIndex: target.index,
        originalPrice: target.originalPrice,
        newPrice: calculation.newPrice,
        filledAmount: 0,
        remainingAmount: calculation.remainingToFill,
        retriesRemaining: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check if TP Grace should be applied for a target
   */
  static shouldApplyTPGrace(
    target: TPTarget,
    config: TPGraceConfig
  ): boolean {
    // Don't apply if disabled
    if (!config.enabled) return false;

    // Don't apply if fully filled
    if (target.filled >= target.percentage) return false;

    // Don't apply if max retries reached
    if (target.retries >= config.maxRetries) return false;

    return true;
  }

  /**
   * Check if feature should be used based on "Only if not defined by group"
   */
  static shouldUseFeature(
    config: TPGraceConfig,
    signalHasTPGraceConfig: boolean
  ): boolean {
    if (!config.enabled) return false;
    if (config.onlyIfNotDefinedByGroup && signalHasTPGraceConfig) return false;
    return true;
  }

  /**
   * Get config from BotConfig
   */
  static getConfigFromBotConfig(botConfig: {
    tpGraceEnabled: boolean;
    tpGraceCapPercent: number;
    tpGraceMaxRetries: number;
    tpGraceRetryInterval?: number;
    tpGraceOnlyIfNotDefinedByGroup?: boolean;
  }): TPGraceConfig {
    return {
      enabled: botConfig.tpGraceEnabled,
      capPercent: botConfig.tpGraceCapPercent,
      maxRetries: botConfig.tpGraceMaxRetries,
      retryIntervalSeconds: botConfig.tpGraceRetryInterval || DEFAULT_RETRY_INTERVAL,
      onlyIfNotDefinedByGroup: botConfig.tpGraceOnlyIfNotDefinedByGroup || false,
    };
  }

  /**
   * Get default config (for demo/testing)
   */
  private static async getConfig(): Promise<TPGraceConfig> {
    return {
      enabled: true,
      capPercent: 0.5,
      maxRetries: 3,
      retryIntervalSeconds: DEFAULT_RETRY_INTERVAL,
      onlyIfNotDefinedByGroup: false,
    };
  }

  /**
   * Validate config values per Cornix spec
   */
  static validateConfig(config: TPGraceConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Cornix spec: 0.01% - 2%
    if (config.capPercent < 0.01 || config.capPercent > 2) {
      errors.push("Cap percent must be between 0.01% and 2% (Cornix spec)");
    }

    // Cornix spec: 1-10 retries
    if (config.maxRetries < 1 || config.maxRetries > 10) {
      errors.push("Max retries must be between 1 and 10");
    }

    if (config.retryIntervalSeconds < 1) {
      errors.push("Retry interval must be at least 1 second");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Initialize TP Grace state for a new position
   */
  static async initializeTPGraceState(
    positionId: string,
    tpTargets: TPTarget[]
  ): Promise<{ success: boolean; state?: TPGraceState; error?: string }> {
    try {
      const position = await db.position.findUnique({
        where: { id: positionId },
      });

      if (!position) {
        return { success: false, error: "Position not found" };
      }

      const state: TPGraceState = {
        positionId,
        symbol: position.symbol,
        direction: position.direction as "LONG" | "SHORT",
        targets: tpTargets.map(tp => ({
          ...tp,
          filled: 0,
          retries: 0,
          originalPrice: tp.price,
          status: "PENDING" as const,
        })),
        status: "ACTIVE",
      };

      this.graceStates.set(positionId, state);

      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[TP GRACE] Initialized for position ${positionId}`,
          details: JSON.stringify({
            positionId,
            symbol: position.symbol,
            targets: state.targets,
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
   * Clear grace state for a position
   */
  static clearGraceState(positionId: string): void {
    this.graceStates.delete(positionId);
  }

  /**
   * Get current grace state for a position
   */
  static getGraceState(positionId: string): TPGraceState | undefined {
    return this.graceStates.get(positionId);
  }

  /**
   * Calculate total adjustment from original TP price
   */
  static calculateTotalAdjustment(
    originalPrice: number,
    currentPrice: number,
    direction: "LONG" | "SHORT"
  ): number {
    const adjustment = ((currentPrice - originalPrice) / originalPrice) * 100;
    return direction === "LONG" ? Math.abs(adjustment) : adjustment;
  }

  /**
   * Calculate TP ratios per Cornix strategies
   */
  static calculateTPRatios(
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
        // First TP gets largest percentage
        return this.calculateExponentialRatios(targetCount, false);
      
      case "INCREASING_EXP":
        // Last TP gets largest percentage
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

export default TPGraceService;
