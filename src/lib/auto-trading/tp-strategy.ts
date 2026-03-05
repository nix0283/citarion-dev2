/**
 * TP (Take-Profit) Strategy Service
 *
 * Implements Cornix-style take-profit position distribution strategies:
 * - Calculates percentage weights for each TP target
 * - Supports 9 distribution strategies per Cornix specification
 *
 * @see https://help.cornix.io/
 */

// ==================== TYPES ====================

/**
 * TP strategy types as defined by Cornix specification
 */
export type TPStrategyType =
  | "EVENLY_DIVIDED"
  | "ONE_TARGET"
  | "TWO_TARGETS"
  | "THREE_TARGETS"
  | "FIFTY_ON_FIRST"
  | "DECREASING_EXP"
  | "INCREASING_EXP"
  | "SKIP_FIRST"
  | "CUSTOM_RATIOS";

/**
 * Represents a weight calculation result for a TP target
 */
export interface TPWeight {
  index: number; // 0-based index
  percentage: number; // Percentage of total position (0-100)
  strategy: TPStrategyType;
}

/**
 * Represents calculated TP amount with price
 */
export interface TPAmount {
  index: number; // 0-based index
  price: number; // TP price for this target
  amount: number; // Amount to close at this price
  percentage: number; // Percentage of total position
  cumulativePercentage: number; // Running total of percentages
  expectedProfit?: number; // Estimated profit at this TP level
}

/**
 * Validation result for custom TP weights
 */
export interface TPWeightValidationResult {
  valid: boolean;
  errors: string[];
  normalizedWeights?: number[];
}

// ==================== CONSTANTS ====================

/**
 * Strategy descriptions for documentation and UI
 */
export const TP_STRATEGY_DESCRIPTIONS: Record<TPStrategyType, string> = {
  EVENLY_DIVIDED: "Distribute equally across all TP targets",
  ONE_TARGET: "100% at single TP price",
  TWO_TARGETS: "50% at first TP, 50% at second TP",
  THREE_TARGETS: "33.33% at first, 33.33% at second, 33.34% at third TP",
  FIFTY_ON_FIRST: "50% at first TP, remaining distributed evenly among others",
  DECREASING_EXP: "Exponentially decreasing (largest allocation at first TP)",
  INCREASING_EXP: "Exponentially increasing (largest allocation at last TP)",
  SKIP_FIRST: "Skip first TP entirely, distribute evenly among remaining",
  CUSTOM_RATIOS: "User-defined percentage distribution",
};

/**
 * Strategies that require custom weights parameter
 */
export const TP_STRATEGIES_REQUIRING_CUSTOM_WEIGHTS: TPStrategyType[] = ["CUSTOM_RATIOS"];

// ==================== MAIN SERVICE ====================

export class TPStrategyService {
  /**
   * Calculate TP weights based on strategy type
   *
   * @param strategy - The TP strategy type
   * @param targetCount - Number of TP targets
   * @param customWeights - Required for CUSTOM_RATIOS strategy
   * @returns Array of percentage weights (sums to 100)
   */
  static calculateTPWeights(
    strategy: TPStrategyType,
    targetCount: number,
    customWeights?: number[]
  ): number[] {
    // Validate target count
    if (targetCount < 1) {
      throw new Error("Target count must be at least 1");
    }

    switch (strategy) {
      case "ONE_TARGET":
        return this.calculateOneTarget(targetCount);

      case "TWO_TARGETS":
        return this.calculateTwoTargets(targetCount);

      case "THREE_TARGETS":
        return this.calculateThreeTargets(targetCount);

      case "FIFTY_ON_FIRST":
        return this.calculateFiftyOnFirst(targetCount);

      case "DECREASING_EXP":
        return this.calculateDecreasingExp(targetCount);

      case "INCREASING_EXP":
        return this.calculateIncreasingExp(targetCount);

      case "SKIP_FIRST":
        return this.calculateSkipFirst(targetCount);

      case "CUSTOM_RATIOS":
        return this.calculateCustomRatios(targetCount, customWeights);

      case "EVENLY_DIVIDED":
      default:
        return this.calculateEvenlyDivided(targetCount);
    }
  }

  /**
   * Calculate TP amounts with prices
   *
   * @param totalPosition - Total position size to close
   * @param weights - Percentage weights from calculateTPWeights
   * @param tpPrices - Array of TP prices (must match weights length)
   * @param entryPrice - Optional entry price for profit calculation
   * @param direction - Optional position direction for profit calculation
   * @returns Array of TPAmount objects
   */
  static calculateTPAmounts(
    totalPosition: number,
    weights: number[],
    tpPrices: number[],
    entryPrice?: number,
    direction?: "LONG" | "SHORT"
  ): TPAmount[] {
    if (weights.length !== tpPrices.length) {
      throw new Error("Weights and TP prices arrays must have the same length");
    }

    if (totalPosition <= 0) {
      throw new Error("Total position must be greater than 0");
    }

    const results: TPAmount[] = [];
    let cumulativePercentage = 0;

    for (let i = 0; i < weights.length; i++) {
      const percentage = weights[i];
      cumulativePercentage += percentage;
      const amount = (percentage / 100) * totalPosition;

      // Calculate expected profit if entry price and direction provided
      let expectedProfit: number | undefined;
      if (entryPrice && direction) {
        if (direction === "LONG") {
          expectedProfit = amount * (tpPrices[i] - entryPrice);
        } else {
          expectedProfit = amount * (entryPrice - tpPrices[i]);
        }
      }

      results.push({
        index: i,
        price: tpPrices[i],
        amount: Math.round(amount * 100000000) / 100000000, // 8 decimal precision
        percentage,
        cumulativePercentage,
        expectedProfit,
      });
    }

    return results;
  }

  /**
   * Validate custom weights array
   *
   * @param weights - Array of custom percentage weights
   * @param targetCount - Expected number of targets
   * @returns Validation result with normalized weights if valid
   */
  static validateCustomWeights(
    weights: number[] | undefined,
    targetCount: number
  ): TPWeightValidationResult {
    const errors: string[] = [];

    // Check if weights provided
    if (!weights || weights.length === 0) {
      return {
        valid: false,
        errors: ["Custom weights array is required for CUSTOM_RATIOS strategy"],
      };
    }

    // Check array length
    if (weights.length !== targetCount) {
      errors.push(
        `Weights array length (${weights.length}) must match target count (${targetCount})`
      );
    }

    // Check for negative values
    const hasNegative = weights.some((w) => w < 0);
    if (hasNegative) {
      errors.push("Weights cannot contain negative values");
    }

    // Check for all zeros
    const sum = weights.reduce((acc, w) => acc + w, 0);
    if (sum === 0) {
      errors.push("Sum of weights cannot be zero");
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Normalize weights to sum to 100
    const normalizedWeights = weights.map((w) => (w / sum) * 100);

    return {
      valid: true,
      errors: [],
      normalizedWeights,
    };
  }

  /**
   * Get TP weight objects with metadata
   *
   * @param strategy - The TP strategy type
   * @param targetCount - Number of TP targets
   * @param customWeights - Required for CUSTOM_RATIOS strategy
   * @returns Array of TPWeight objects
   */
  static getTPWeights(
    strategy: TPStrategyType,
    targetCount: number,
    customWeights?: number[]
  ): TPWeight[] {
    const weights = this.calculateTPWeights(strategy, targetCount, customWeights);

    return weights.map((percentage, index) => ({
      index,
      percentage,
      strategy,
    }));
  }

  // ==================== STRATEGY CALCULATIONS ====================

  /**
   * EVENLY_DIVIDED: Equal distribution across all targets
   */
  private static calculateEvenlyDivided(targetCount: number): number[] {
    const percentage = 100 / targetCount;
    return Array(targetCount).fill(percentage);
  }

  /**
   * ONE_TARGET: 100% at single TP
   * Note: If multiple targets specified, puts 100% at first
   */
  private static calculateOneTarget(targetCount: number): number[] {
    const weights = new Array(targetCount).fill(0);
    weights[0] = 100;
    return weights;
  }

  /**
   * TWO_TARGETS: 50/50 split
   * Note: If more targets, distributes evenly
   */
  private static calculateTwoTargets(targetCount: number): number[] {
    if (targetCount === 1) {
      return [100];
    }
    if (targetCount === 2) {
      return [50, 50];
    }
    // For more than 2 targets, use 50/50 for first two, zero for rest
    const weights = new Array(targetCount).fill(0);
    weights[0] = 50;
    weights[1] = 50;
    return weights;
  }

  /**
   * THREE_TARGETS: 33.33/33.33/33.34 split
   * Note: If more targets, adjusts accordingly
   */
  private static calculateThreeTargets(targetCount: number): number[] {
    if (targetCount === 1) {
      return [100];
    }
    if (targetCount === 2) {
      return [50, 50];
    }
    if (targetCount === 3) {
      return [33.33, 33.33, 33.34];
    }
    // For more than 3 targets, use first three, zero for rest
    const weights = new Array(targetCount).fill(0);
    weights[0] = 33.33;
    weights[1] = 33.33;
    weights[2] = 33.34;
    return weights;
  }

  /**
   * FIFTY_ON_FIRST: 50% first TP, remaining distributed evenly
   */
  private static calculateFiftyOnFirst(targetCount: number): number[] {
    if (targetCount === 1) {
      return [100];
    }

    const remainingPercentage = 50;
    const remainingCount = targetCount - 1;
    const evenSplit = remainingPercentage / remainingCount;

    return [50, ...Array(remainingCount).fill(evenSplit)];
  }

  /**
   * DECREASING_EXP: Exponential decrease (largest first)
   * Uses powers of 2: 2^(n-1), 2^(n-2), ..., 2^0
   */
  private static calculateDecreasingExp(targetCount: number): number[] {
    const weights: number[] = [];
    let totalWeight = 0;

    // Calculate raw weights (decreasing powers of 2)
    for (let i = 0; i < targetCount; i++) {
      const power = targetCount - 1 - i;
      const weight = Math.pow(2, power);
      weights.push(weight);
      totalWeight += weight;
    }

    // Normalize to sum to 100
    return weights.map((w) => (w / totalWeight) * 100);
  }

  /**
   * INCREASING_EXP: Exponential increase (largest last)
   * Uses powers of 2: 2^0, 2^1, ..., 2^(n-1)
   */
  private static calculateIncreasingExp(targetCount: number): number[] {
    const weights: number[] = [];
    let totalWeight = 0;

    // Calculate raw weights (increasing powers of 2)
    for (let i = 0; i < targetCount; i++) {
      const weight = Math.pow(2, i);
      weights.push(weight);
      totalWeight += weight;
    }

    // Normalize to sum to 100
    return weights.map((w) => (w / totalWeight) * 100);
  }

  /**
   * SKIP_FIRST: Skip first TP, divide evenly among rest
   */
  private static calculateSkipFirst(targetCount: number): number[] {
    if (targetCount === 1) {
      // Edge case: if only one target, we can't skip it
      return [0];
    }

    const remainingCount = targetCount - 1;
    const evenSplit = 100 / remainingCount;

    return [0, ...Array(remainingCount).fill(evenSplit)];
  }

  /**
   * CUSTOM_RATIOS: User-defined percentages
   */
  private static calculateCustomRatios(
    targetCount: number,
    customWeights?: number[]
  ): number[] {
    const validation = this.validateCustomWeights(customWeights, targetCount);

    if (!validation.valid) {
      throw new Error(validation.errors.join("; "));
    }

    return validation.normalizedWeights!;
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Check if a strategy requires custom weights
   */
  static requiresCustomWeights(strategy: TPStrategyType): boolean {
    return TP_STRATEGIES_REQUIRING_CUSTOM_WEIGHTS.includes(strategy);
  }

  /**
   * Get strategy description
   */
  static getStrategyDescription(strategy: TPStrategyType): string {
    return TP_STRATEGY_DESCRIPTIONS[strategy];
  }

  /**
   * Get all available strategies
   */
  static getAllStrategies(): TPStrategyType[] {
    return [
      "EVENLY_DIVIDED",
      "ONE_TARGET",
      "TWO_TARGETS",
      "THREE_TARGETS",
      "FIFTY_ON_FIRST",
      "DECREASING_EXP",
      "INCREASING_EXP",
      "SKIP_FIRST",
      "CUSTOM_RATIOS",
    ];
  }

  /**
   * Validate strategy parameters before calculation
   */
  static validateStrategyParams(
    strategy: TPStrategyType,
    targetCount: number,
    customWeights?: number[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (targetCount < 1) {
      errors.push("Target count must be at least 1");
    }

    if (targetCount > 20) {
      errors.push("Target count cannot exceed 20 (reasonable limit)");
    }

    if (strategy === "CUSTOM_RATIOS") {
      if (!customWeights || customWeights.length === 0) {
        errors.push("Custom weights are required for CUSTOM_RATIOS strategy");
      } else if (customWeights.length !== targetCount) {
        errors.push(
          `Custom weights length (${customWeights.length}) must match target count (${targetCount})`
        );
      }
    }

    if (strategy === "ONE_TARGET" && targetCount > 1) {
      // Warning: strategy puts 100% on first target only
      // This is intentional behavior, not an error
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Round weights to specified decimal places while ensuring sum equals 100
   */
  static roundWeights(weights: number[], decimalPlaces: number = 2): number[] {
    const multiplier = Math.pow(10, decimalPlaces);
    const rounded = weights.map((w) => Math.round(w * multiplier) / multiplier);

    // Adjust last element to ensure sum is exactly 100
    const sum = rounded.reduce((acc, w) => acc + w, 0);
    const diff = 100 - sum;

    if (Math.abs(diff) > 0.001) {
      rounded[rounded.length - 1] += diff;
    }

    return rounded;
  }

  /**
   * Calculate total expected profit across all TP targets
   *
   * @param tpAmounts - Array of TPAmount objects with expectedProfit calculated
   * @returns Total expected profit
   */
  static calculateTotalExpectedProfit(tpAmounts: TPAmount[]): number {
    return tpAmounts.reduce((total, tp) => total + (tp.expectedProfit || 0), 0);
  }

  /**
   * Calculate average TP price (weighted by percentage)
   *
   * @param weights - Percentage weights
   * @param tpPrices - Array of TP prices
   * @returns Weighted average TP price
   */
  static calculateWeightedAverageTP(weights: number[], tpPrices: number[]): number {
    if (weights.length !== tpPrices.length) {
      throw new Error("Weights and TP prices arrays must have the same length");
    }

    let totalWeightedPrice = 0;
    let totalWeight = 0;

    for (let i = 0; i < weights.length; i++) {
      totalWeightedPrice += weights[i] * tpPrices[i];
      totalWeight += weights[i];
    }

    return totalWeightedPrice / totalWeight;
  }

  /**
   * Get TP distribution summary for display
   *
   * @param strategy - The TP strategy type
   * @param targetCount - Number of TP targets
   * @param customWeights - Custom weights if applicable
   * @returns Formatted summary string
   */
  static getDistributionSummary(
    strategy: TPStrategyType,
    targetCount: number,
    customWeights?: number[]
  ): string {
    const weights = this.calculateTPWeights(strategy, targetCount, customWeights);
    const roundedWeights = this.roundWeights(weights);

    const percentages = roundedWeights.map((w, i) => `TP${i + 1}: ${w.toFixed(2)}%`);
    return `${strategy}: [${percentages.join(", ")}]`;
  }
}

export default TPStrategyService;
