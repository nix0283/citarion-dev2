/**
 * Entry Strategy Service
 *
 * Implements Cornix-style entry position distribution strategies:
 * - Calculates percentage weights for each entry target
 * - Supports 9 distribution strategies per Cornix specification
 *
 * @see https://help.cornix.io/
 */

// ==================== TYPES ====================

/**
 * Entry strategy types as defined by Cornix specification
 */
export type EntryStrategyType =
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
 * Represents a weight calculation result for an entry target
 */
export interface EntryWeight {
  index: number; // 0-based index
  percentage: number; // Percentage of total (0-100)
  strategy: EntryStrategyType;
}

/**
 * Represents calculated entry amount with price
 */
export interface EntryAmount {
  index: number; // 0-based index
  price: number; // Entry price for this target
  amount: number; // Amount to enter at this price
  percentage: number; // Percentage of total amount
  cumulativePercentage: number; // Running total of percentages
}

/**
 * Validation result for custom weights
 */
export interface EntryWeightValidationResult {
  valid: boolean;
  errors: string[];
  normalizedWeights?: number[];
}

// ==================== CONSTANTS ====================

/**
 * Strategy descriptions for documentation and UI
 */
export const ENTRY_STRATEGY_DESCRIPTIONS: Record<EntryStrategyType, string> = {
  EVENLY_DIVIDED: "Distribute equally across all entry targets",
  ONE_TARGET: "100% at single entry price",
  TWO_TARGETS: "50% at first entry, 50% at second entry",
  THREE_TARGETS: "33.33% at first, 33.33% at second, 33.34% at third entry",
  FIFTY_ON_FIRST: "50% at first entry, remaining distributed evenly among others",
  DECREASING_EXP: "Exponentially decreasing (largest allocation at first entry)",
  INCREASING_EXP: "Exponentially increasing (largest allocation at last entry)",
  SKIP_FIRST: "Skip first entry entirely, distribute evenly among remaining",
  CUSTOM_RATIOS: "User-defined percentage distribution",
};

/**
 * Strategies that require custom weights parameter
 */
export const STRATEGIES_REQUIRING_CUSTOM_WEIGHTS: EntryStrategyType[] = ["CUSTOM_RATIOS"];

// ==================== MAIN SERVICE ====================

export class EntryStrategyService {
  /**
   * Calculate entry weights based on strategy type
   *
   * @param strategy - The entry strategy type
   * @param targetCount - Number of entry targets
   * @param customWeights - Required for CUSTOM_RATIOS strategy
   * @returns Array of percentage weights (sums to 100)
   */
  static calculateEntryWeights(
    strategy: EntryStrategyType,
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
   * Calculate entry amounts with prices
   *
   * @param totalAmount - Total amount to invest
   * @param weights - Percentage weights from calculateEntryWeights
   * @param entryPrices - Array of entry prices (must match weights length)
   * @returns Array of EntryAmount objects
   */
  static calculateEntryAmounts(
    totalAmount: number,
    weights: number[],
    entryPrices: number[]
  ): EntryAmount[] {
    if (weights.length !== entryPrices.length) {
      throw new Error("Weights and entry prices arrays must have the same length");
    }

    if (totalAmount <= 0) {
      throw new Error("Total amount must be greater than 0");
    }

    const results: EntryAmount[] = [];
    let cumulativePercentage = 0;

    for (let i = 0; i < weights.length; i++) {
      const percentage = weights[i];
      cumulativePercentage += percentage;
      const amount = (percentage / 100) * totalAmount;

      results.push({
        index: i,
        price: entryPrices[i],
        amount: Math.round(amount * 100000000) / 100000000, // 8 decimal precision
        percentage,
        cumulativePercentage,
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
  ): EntryWeightValidationResult {
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
   * Get entry weight objects with metadata
   *
   * @param strategy - The entry strategy type
   * @param targetCount - Number of entry targets
   * @param customWeights - Required for CUSTOM_RATIOS strategy
   * @returns Array of EntryWeight objects
   */
  static getEntryWeights(
    strategy: EntryStrategyType,
    targetCount: number,
    customWeights?: number[]
  ): EntryWeight[] {
    const weights = this.calculateEntryWeights(strategy, targetCount, customWeights);

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
   * ONE_TARGET: 100% at single entry
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
   * FIFTY_ON_FIRST: 50% first entry, remaining distributed evenly
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
   * SKIP_FIRST: Skip first entry, divide evenly among rest
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
  static requiresCustomWeights(strategy: EntryStrategyType): boolean {
    return STRATEGIES_REQUIRING_CUSTOM_WEIGHTS.includes(strategy);
  }

  /**
   * Get strategy description
   */
  static getStrategyDescription(strategy: EntryStrategyType): string {
    return ENTRY_STRATEGY_DESCRIPTIONS[strategy];
  }

  /**
   * Get all available strategies
   */
  static getAllStrategies(): EntryStrategyType[] {
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
    strategy: EntryStrategyType,
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
}

export default EntryStrategyService;
