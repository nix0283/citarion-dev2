/**
 * Moving Take-Profits Service
 *
 * Implements Cornix-style "Moving Take-Profits" feature:
 * - When TP1 is filled, remaining TP targets can be automatically adjusted
 * - Helps capture more profit on strong price moves
 * - Supports multiple move strategies
 *
 * Move Types:
 * - MOVE_AVERAGE: Move remaining TPs to average of filled and remaining targets
 * - MOVE_NEXT: Move remaining TPs to the next target price
 * - PERCENTAGE_MOVE: Move remaining TPs by a percentage of the filled target
 *
 * @see https://help.cornix.io/
 */

import { db } from "@/lib/db";

// ==================== TYPES ====================

/**
 * Moving TP type - defines how remaining TPs should be adjusted
 */
export type MovingTPType =
  | "MOVE_AVERAGE"
  | "MOVE_NEXT"
  | "PERCENTAGE_MOVE"
  | "MOVE_TO_BREAKEVEN"
  | "EXTEND_TARGETS";

/**
 * Status of a TP target in the moving TP system
 */
export type MovingTPTargetStatus =
  | "PENDING"
  | "FILLED"
  | "MOVED"
  | "CANCELLED";

/**
 * Configuration for Moving TP feature
 */
export interface MovingTPConfig {
  enabled: boolean;
  moveType: MovingTPType;
  percentageMove?: number; // For PERCENTAGE_MOVE type (0.1-50%)
  minProfitPercent?: number; // Minimum profit % before moving (activation threshold)
  onlyIfNotDefinedByGroup: boolean; // Use as fallback only
  preserveOriginalTargets?: boolean; // Keep original target prices as reference
}

/**
 * Individual TP target in the moving system
 */
export interface MovingTPTarget {
  index: number; // 0-based index
  price: number; // Current TP price
  originalPrice: number; // Original TP price from signal
  percentage: number; // % of position to close
  filledPercentage: number; // How much has been filled (0-100)
  status: MovingTPTargetStatus;
  movedAt?: Date; // When this target was moved
  movedFrom?: number; // Original price before move
  moveCount: number; // Number of times this target has been moved
}

/**
 * State tracking for a position's moving TP
 */
export interface MovingTPState {
  positionId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";

  // TP targets
  targets: MovingTPTarget[];
  lastFilledIndex: number; // Index of last filled TP (-1 if none)
  lastMoveAt?: Date;
  totalMoveCount: number;

  // Profit tracking
  realizedProfit: number;
  avgExitPrice: number;

  // Configuration used
  config: MovingTPConfig;
}

/**
 * Result of calculating new TP targets
 */
export interface MovingTPCalculation {
  filledIndex: number;
  originalTargets: MovingTPTarget[];
  newTargets: MovingTPTarget[];
  moveType: MovingTPType;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  currentPrice: number;
  priceAdjustments: Array<{
    index: number;
    originalPrice: number;
    newPrice: number;
    adjustmentPercent: number;
    reason: string;
  }>;
  isValid: boolean;
  warnings: string[];
}

/**
 * Result of processing moving TP for a position
 */
export interface MovingTPResult {
  success: boolean;
  positionId: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  moved: boolean;
  filledIndex: number;
  targetsBefore: MovingTPTarget[];
  targetsAfter: MovingTPTarget[];
  error?: string;
  reason?: string;
}

/**
 * Result of moving remaining TPs
 */
export interface MoveRemainingTPsResult {
  success: boolean;
  positionId: string;
  movedTargets: Array<{
    index: number;
    oldPrice: number;
    newPrice: number;
    status: MovingTPTargetStatus;
  }>;
  failedTargets: Array<{
    index: number;
    reason: string;
  }>;
  totalMoved: number;
  totalFailed: number;
}

/**
 * Validation result for Moving TP configuration
 */
export interface MovingTPValidation {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// ==================== CONSTANTS ====================

const MIN_PERCENTAGE_MOVE = 0.1; // 0.1% minimum
const MAX_PERCENTAGE_MOVE = 50; // 50% maximum
const MIN_PROFIT_THRESHOLD = 0; // 0% minimum
const MAX_PROFIT_THRESHOLD = 100; // 100% maximum

// ==================== MAIN SERVICE ====================

export class MovingTPService {
  // In-memory cache for active moving TP states
  private static activeMovingTPs: Map<string, MovingTPState> = new Map();

  /**
   * Calculate new TP targets when an earlier TP is filled
   *
   * @param tpTargets - Current TP targets array
   * @param filledTPIndex - Index of the TP that was just filled (0-based)
   * @param moveType - How to calculate new target prices
   * @param direction - LONG or SHORT
   * @param entryPrice - Position entry price
   * @param currentPrice - Current market price
   * @param config - Additional configuration
   * @returns Calculation result with new target prices
   */
  static calculateMovingTP(
    tpTargets: MovingTPTarget[],
    filledTPIndex: number,
    moveType: MovingTPType,
    direction: "LONG" | "SHORT",
    entryPrice: number,
    currentPrice: number,
    config?: Partial<MovingTPConfig>
  ): MovingTPCalculation {
    const warnings: string[] = [];
    const priceAdjustments: MovingTPCalculation["priceAdjustments"] = [];

    // Clone targets for modification
    const newTargets: MovingTPTarget[] = tpTargets.map((t) => ({ ...t }));
    const originalTargets: MovingTPTarget[] = tpTargets.map((t) => ({ ...t }));

    // Validate inputs
    if (filledTPIndex < 0 || filledTPIndex >= tpTargets.length) {
      return {
        filledIndex: filledTPIndex,
        originalTargets,
        newTargets,
        moveType,
        direction,
        entryPrice,
        currentPrice,
        priceAdjustments: [],
        isValid: false,
        warnings: [`Invalid filledTPIndex: ${filledTPIndex}`],
      };
    }

    // Get remaining targets (those after the filled one)
    const remainingTargets = newTargets.slice(filledTPIndex + 1);

    if (remainingTargets.length === 0) {
      return {
        filledIndex: filledTPIndex,
        originalTargets,
        newTargets,
        moveType,
        direction,
        entryPrice,
        currentPrice,
        priceAdjustments: [],
        isValid: true,
        warnings: ["No remaining targets to move"],
      };
    }

    // Mark the filled target
    newTargets[filledTPIndex].status = "FILLED";

    // Calculate new prices based on move type
    const filledTarget = newTargets[filledTPIndex];

    for (let i = filledTPIndex + 1; i < newTargets.length; i++) {
      const target = newTargets[i];
      let newPrice: number;
      let reason: string;

      switch (moveType) {
        case "MOVE_AVERAGE":
          // Move to average of filled target and current target
          newPrice = (filledTarget.price + target.price) / 2;
          reason = `Averaged between TP${filledTPIndex + 1} (${filledTarget.price}) and TP${i + 1} (${target.price})`;
          break;

        case "MOVE_NEXT":
          // Move to next target's price (essentially skip to next level)
          if (i + 1 < newTargets.length) {
            newPrice = newTargets[i + 1].price;
            reason = `Moved to TP${i + 2} price (${newPrice})`;
          } else {
            // Last target - extend further
            const priceDiff = target.price - filledTarget.price;
            newPrice = target.price + priceDiff;
            reason = `Extended beyond last TP by same distance (${priceDiff})`;
          }
          break;

        case "PERCENTAGE_MOVE":
          // Move by percentage of filled target price
          const percent = config?.percentageMove ?? 5;
          const priceDiff = target.price - filledTarget.price;
          const adjustment = priceDiff * (percent / 100);

          if (direction === "LONG") {
            newPrice = target.price - adjustment;
          } else {
            newPrice = target.price + adjustment;
          }
          reason = `Moved ${percent}% closer to entry from TP${i + 1}`;
          break;

        case "MOVE_TO_BREAKEVEN":
          // Move remaining TPs to be more conservative (closer to breakeven + small profit)
          const profitMargin = (target.price - entryPrice) * 0.3;
          newPrice = entryPrice + profitMargin;
          reason = `Moved to breakeven + 30% of original profit margin`;
          break;

        case "EXTEND_TARGETS":
          // Extend targets further out to capture more profit
          const distance = target.price - filledTarget.price;
          if (direction === "LONG") {
            newPrice = target.price + distance;
          } else {
            newPrice = target.price - distance;
          }
          reason = `Extended TP${i + 1} by same distance as previous gap`;
          break;

        default:
          newPrice = target.price;
          reason = "Unknown move type - no change";
      }

      // Validate new price makes sense for direction
      if (direction === "LONG") {
        // For LONG, TP should be above entry and current price
        if (newPrice <= currentPrice) {
          warnings.push(`TP${i + 1} new price ${newPrice} is below current price ${currentPrice}`);
          newPrice = currentPrice * 1.001; // Set slightly above current
        }
      } else {
        // For SHORT, TP should be below entry and current price
        if (newPrice >= currentPrice) {
          warnings.push(`TP${i + 1} new price ${newPrice} is above current price ${currentPrice}`);
          newPrice = currentPrice * 0.999; // Set slightly below current
        }
      }

      // Record the adjustment
      const adjustmentPercent = Math.abs(
        ((newPrice - target.price) / target.price) * 100
      );

      priceAdjustments.push({
        index: i,
        originalPrice: target.price,
        newPrice,
        adjustmentPercent,
        reason,
      });

      // Update the target
      target.movedFrom = target.price;
      target.price = newPrice;
      target.status = "MOVED";
      target.movedAt = new Date();
      target.moveCount++;
    }

    return {
      filledIndex: filledTPIndex,
      originalTargets,
      newTargets,
      moveType,
      direction,
      entryPrice,
      currentPrice,
      priceAdjustments,
      isValid: true,
      warnings,
    };
  }

  /**
   * Process Moving TP after a TP fill event
   *
   * @param positionId - The position ID
   * @param filledTPIndex - Index of the TP that was just filled (0-based)
   * @returns Result of the processing
   */
  static async processMovingTP(
    positionId: string,
    filledTPIndex: number
  ): Promise<MovingTPResult> {
    try {
      // Get position
      const position = await db.position.findUnique({
        where: { id: positionId },
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

      if (!position) {
        return {
          success: false,
          positionId,
          status: "CANCELLED",
          moved: false,
          filledIndex: filledTPIndex,
          targetsBefore: [],
          targetsAfter: [],
          error: "Position not found",
        };
      }

      if (position.status !== "OPEN") {
        return {
          success: true,
          positionId,
          status: "CANCELLED",
          moved: false,
          filledIndex: filledTPIndex,
          targetsBefore: [],
          targetsAfter: [],
          reason: `Position status is ${position.status}, not OPEN`,
        };
      }

      // Get bot config for moving TP settings
      const botConfig = position.account?.botConfigs?.[0];
      if (!botConfig || !botConfig.movingTPEnabled) {
        return {
          success: true,
          positionId,
          status: "ACTIVE",
          moved: false,
          filledIndex: filledTPIndex,
          targetsBefore: [],
          targetsAfter: [],
          reason: "Moving TP is not enabled",
        };
      }

      // Get or create state
      let state = this.activeMovingTPs.get(positionId);

      if (!state) {
        // Initialize state from signal
        const signal = position.Signal;
        if (!signal?.takeProfits) {
          return {
            success: false,
            positionId,
            status: "CANCELLED",
            moved: false,
            filledIndex: filledTPIndex,
            targetsBefore: [],
            targetsAfter: [],
            error: "No TP targets found in signal",
          };
        }

        const tpData: Array<{ price: number; percentage: number }> = JSON.parse(
          signal.takeProfits
        );

        const config: MovingTPConfig = {
          enabled: botConfig.movingTPEnabled,
          moveType: "MOVE_AVERAGE", // Default, can be extended with bot config
          onlyIfNotDefinedByGroup: false,
        };

        state = {
          positionId,
          symbol: position.symbol,
          direction: position.direction as "LONG" | "SHORT",
          entryPrice: position.avgEntryPrice,
          status: "ACTIVE",
          targets: tpData.map((tp, idx) => ({
            index: idx,
            price: tp.price,
            originalPrice: tp.price,
            percentage: tp.percentage,
            filledPercentage: 0,
            status: "PENDING" as MovingTPTargetStatus,
            moveCount: 0,
          })),
          lastFilledIndex: -1,
          totalMoveCount: 0,
          realizedProfit: 0,
          avgExitPrice: 0,
          config,
        };
      }

      // Get current market price
      const marketPrice = await db.marketPrice.findUnique({
        where: { symbol: position.symbol },
      });

      const currentPrice = marketPrice?.price ?? position.currentPrice ?? position.avgEntryPrice;

      // Mark the target as filled
      if (filledTPIndex >= 0 && filledTPIndex < state.targets.length) {
        state.targets[filledTPIndex].status = "FILLED";
        state.targets[filledTPIndex].filledPercentage =
          state.targets[filledTPIndex].percentage;
        state.lastFilledIndex = filledTPIndex;
      }

      // Check if there are remaining targets to move
      const remainingTargets = state.targets.slice(filledTPIndex + 1);
      if (remainingTargets.length === 0) {
        state.status = "COMPLETED";
        this.activeMovingTPs.set(positionId, state);

        return {
          success: true,
          positionId,
          status: "COMPLETED",
          moved: false,
          filledIndex: filledTPIndex,
          targetsBefore: state.targets,
          targetsAfter: state.targets,
          reason: "All TP targets have been filled",
        };
      }

      // Store targets before move
      const targetsBefore = state.targets.map((t) => ({ ...t }));

      // Calculate new targets
      const calculation = this.calculateMovingTP(
        state.targets,
        filledTPIndex,
        state.config.moveType,
        state.direction,
        state.entryPrice,
        currentPrice,
        state.config
      );

      if (!calculation.isValid) {
        return {
          success: false,
          positionId,
          status: state.status,
          moved: false,
          filledIndex: filledTPIndex,
          targetsBefore,
          targetsAfter: state.targets,
          error: calculation.warnings.join("; "),
        };
      }

      // Update state with new targets
      state.targets = calculation.newTargets;
      state.totalMoveCount++;
      state.lastMoveAt = new Date();

      // Log the move
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[MOVING TP] Moved ${calculation.priceAdjustments.length} targets for ${position.symbol} after TP${filledTPIndex + 1} fill`,
          details: JSON.stringify({
            positionId,
            symbol: position.symbol,
            direction: state.direction,
            filledIndex: filledTPIndex,
            moveType: state.config.moveType,
            adjustments: calculation.priceAdjustments,
            warnings: calculation.warnings,
          }),
        },
      });

      // Update in database
      await this.persistState(positionId, state);

      // Cache state
      this.activeMovingTPs.set(positionId, state);

      return {
        success: true,
        positionId,
        status: state.status,
        moved: true,
        filledIndex: filledTPIndex,
        targetsBefore,
        targetsAfter: state.targets,
        reason: `Moved ${calculation.priceAdjustments.length} targets using ${state.config.moveType} strategy`,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await db.systemLog.create({
        data: {
          level: "ERROR",
          category: "TRADE",
          message: `[MOVING TP] Error processing position ${positionId}`,
          details: JSON.stringify({
            positionId,
            error: errorMessage,
            filledTPIndex,
          }),
        },
      });

      return {
        success: false,
        positionId,
        status: "CANCELLED",
        moved: false,
        filledIndex: filledTPIndex,
        targetsBefore: [],
        targetsAfter: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Move remaining TPs with custom configuration
   *
   * @param positionId - The position ID
   * @param moveConfig - Custom move configuration
   * @returns Result of moving remaining TPs
   */
  static async moveRemainingTPs(
    positionId: string,
    moveConfig: Partial<MovingTPConfig> & { moveType: MovingTPType }
  ): Promise<MoveRemainingTPsResult> {
    const movedTargets: MoveRemainingTPsResult["movedTargets"] = [];
    const failedTargets: MoveRemainingTPsResult["failedTargets"] = [];

    try {
      const state = this.activeMovingTPs.get(positionId);

      if (!state) {
        return {
          success: false,
          positionId,
          movedTargets: [],
          failedTargets: [{ index: -1, reason: "No moving TP state found" }],
          totalMoved: 0,
          totalFailed: 1,
        };
      }

      // Get current market price
      const marketPrice = await db.marketPrice.findUnique({
        where: { symbol: state.symbol },
      });

      const currentPrice = marketPrice?.price ?? state.entryPrice;

      // Find pending targets
      const pendingTargets = state.targets.filter(
        (t) => t.status === "PENDING" || t.status === "MOVED"
      );

      if (pendingTargets.length === 0) {
        return {
          success: true,
          positionId,
          movedTargets: [],
          failedTargets: [],
          totalMoved: 0,
          totalFailed: 0,
        };
      }

      // Calculate new prices for each pending target
      for (const target of pendingTargets) {
        const lastFilledIndex = state.lastFilledIndex;

        if (lastFilledIndex < 0) {
          failedTargets.push({
            index: target.index,
            reason: "No TP has been filled yet",
          });
          continue;
        }

        const calculation = this.calculateMovingTP(
          state.targets,
          lastFilledIndex,
          moveConfig.moveType,
          state.direction,
          state.entryPrice,
          currentPrice,
          { ...state.config, ...moveConfig }
        );

        const newTarget = calculation.newTargets.find((t) => t.index === target.index);

        if (newTarget && newTarget.price !== target.price) {
          movedTargets.push({
            index: target.index,
            oldPrice: target.price,
            newPrice: newTarget.price,
            status: "MOVED",
          });

          // Update state
          target.price = newTarget.price;
          target.status = "MOVED";
          target.movedFrom = target.originalPrice;
          target.movedAt = new Date();
          target.moveCount++;
        } else {
          failedTargets.push({
            index: target.index,
            reason: "No price change calculated",
          });
        }
      }

      // Update state
      state.totalMoveCount++;
      state.lastMoveAt = new Date();
      state.config = { ...state.config, ...moveConfig };

      // Log the move
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[MOVING TP] Manual move of ${movedTargets.length} targets for ${state.symbol}`,
          details: JSON.stringify({
            positionId,
            symbol: state.symbol,
            moveType: moveConfig.moveType,
            movedTargets,
            failedTargets,
          }),
        },
      });

      // Persist state
      await this.persistState(positionId, state);

      // Update cache
      this.activeMovingTPs.set(positionId, state);

      return {
        success: true,
        positionId,
        movedTargets,
        failedTargets,
        totalMoved: movedTargets.length,
        totalFailed: failedTargets.length,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await db.systemLog.create({
        data: {
          level: "ERROR",
          category: "TRADE",
          message: `[MOVING TP] Error moving remaining TPs for ${positionId}`,
          details: JSON.stringify({
            positionId,
            error: errorMessage,
          }),
        },
      });

      return {
        success: false,
        positionId,
        movedTargets,
        failedTargets: [
          ...failedTargets,
          { index: -1, reason: errorMessage },
        ],
        totalMoved: movedTargets.length,
        totalFailed: failedTargets.length + 1,
      };
    }
  }

  /**
   * Get current moving TP state for a position
   *
   * @param positionId - The position ID
   * @returns Current state or null if not found
   */
  static async getMovingTPState(positionId: string): Promise<MovingTPState | null> {
    // Check cache first
    const cachedState = this.activeMovingTPs.get(positionId);
    if (cachedState) {
      return cachedState;
    }

    // Try to load from database
    try {
      const position = await db.position.findUnique({
        where: { id: positionId },
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

      if (!position || !position.Signal) {
        return null;
      }

      const botConfig = position.account?.botConfigs?.[0];
      if (!botConfig?.movingTPEnabled) {
        return null;
      }

      // Parse TP targets
      const tpData: Array<{ price: number; percentage: number }> = position.Signal.takeProfits
        ? JSON.parse(position.Signal.takeProfits)
        : [];

      if (tpData.length === 0) {
        return null;
      }

      // Build state
      const config: MovingTPConfig = {
        enabled: botConfig.movingTPEnabled,
        moveType: "MOVE_AVERAGE",
        onlyIfNotDefinedByGroup: false,
      };

      const state: MovingTPState = {
        positionId,
        symbol: position.symbol,
        direction: position.direction as "LONG" | "SHORT",
        entryPrice: position.avgEntryPrice,
        status: "ACTIVE",
        targets: tpData.map((tp, idx) => ({
          index: idx,
          price: tp.price,
          originalPrice: tp.price,
          percentage: tp.percentage,
          filledPercentage: 0,
          status: "PENDING" as MovingTPTargetStatus,
          moveCount: 0,
        })),
        lastFilledIndex: -1,
        totalMoveCount: 0,
        realizedProfit: 0,
        avgExitPrice: 0,
        config,
      };

      // Cache it
      this.activeMovingTPs.set(positionId, state);

      return state;

    } catch (error) {
      console.error(`[MOVING TP] Error getting state for ${positionId}:`, error);
      return null;
    }
  }

  /**
   * Validate Moving TP configuration
   *
   * @param config - Configuration to validate
   * @returns Validation result
   */
  static validateConfig(config: MovingTPConfig): MovingTPValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if enabled
    if (!config.enabled) {
      return { valid: true, errors: [], warnings: ["Moving TP is disabled"] };
    }

    // Validate move type
    const validMoveTypes: MovingTPType[] = [
      "MOVE_AVERAGE",
      "MOVE_NEXT",
      "PERCENTAGE_MOVE",
      "MOVE_TO_BREAKEVEN",
      "EXTEND_TARGETS",
    ];

    if (!validMoveTypes.includes(config.moveType)) {
      errors.push(`Invalid move type: ${config.moveType}`);
    }

    // Validate percentage move
    if (config.moveType === "PERCENTAGE_MOVE") {
      if (config.percentageMove === undefined) {
        errors.push("percentageMove is required for PERCENTAGE_MOVE type");
      } else if (config.percentageMove < MIN_PERCENTAGE_MOVE) {
        errors.push(`percentageMove must be at least ${MIN_PERCENTAGE_MOVE}%`);
      } else if (config.percentageMove > MAX_PERCENTAGE_MOVE) {
        errors.push(`percentageMove cannot exceed ${MAX_PERCENTAGE_MOVE}%`);
      }
    }

    // Validate min profit threshold
    if (config.minProfitPercent !== undefined) {
      if (config.minProfitPercent < MIN_PROFIT_THRESHOLD) {
        errors.push(`minProfitPercent cannot be negative`);
      } else if (config.minProfitPercent > MAX_PROFIT_THRESHOLD) {
        warnings.push(`minProfitPercent > ${MAX_PROFIT_THRESHOLD}% may never activate`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Persist state to database
   */
  private static async persistState(
    positionId: string,
    state: MovingTPState
  ): Promise<void> {
    try {
      // Update position with trailing config if needed
      await db.position.update({
        where: { id: positionId },
        data: {
          trailingStop: JSON.stringify({
            movingTP: {
              targets: state.targets,
              lastFilledIndex: state.lastFilledIndex,
              totalMoveCount: state.totalMoveCount,
              config: state.config,
            },
          }),
        },
      });
    } catch (error) {
      console.error(`[MOVING TP] Error persisting state for ${positionId}:`, error);
    }
  }

  /**
   * Check if feature should be used based on "Only if not defined by group"
   */
  static shouldUseFeature(
    config: MovingTPConfig,
    signalHasMovingTPConfig: boolean
  ): boolean {
    if (!config.enabled) return false;
    if (config.onlyIfNotDefinedByGroup && signalHasMovingTPConfig) return false;
    return true;
  }

  /**
   * Get config from BotConfig model
   */
  static getConfigFromBotConfig(botConfig: {
    movingTPEnabled: boolean;
  }): MovingTPConfig {
    return {
      enabled: botConfig.movingTPEnabled,
      moveType: "MOVE_AVERAGE",
      onlyIfNotDefinedByGroup: false,
    };
  }

  /**
   * Initialize Moving TP state for a new position
   */
  static async initializeMovingTP(
    positionId: string,
    config: MovingTPConfig,
    tpTargets: Array<{ price: number; percentage: number }>
  ): Promise<{ success: boolean; state?: MovingTPState; error?: string }> {
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

      // Build state
      const state: MovingTPState = {
        positionId,
        symbol: position.symbol,
        direction: position.direction as "LONG" | "SHORT",
        entryPrice: position.avgEntryPrice,
        status: "ACTIVE",
        targets: tpTargets.map((tp, idx) => ({
          index: idx,
          price: tp.price,
          originalPrice: tp.price,
          percentage: tp.percentage,
          filledPercentage: 0,
          status: "PENDING" as MovingTPTargetStatus,
          moveCount: 0,
        })),
        lastFilledIndex: -1,
        totalMoveCount: 0,
        realizedProfit: 0,
        avgExitPrice: 0,
        config,
      };

      // Cache state
      this.activeMovingTPs.set(positionId, state);

      // Log initialization
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[MOVING TP] Initialized for ${position.symbol}`,
          details: JSON.stringify({
            positionId,
            symbol: position.symbol,
            direction: state.direction,
            targetCount: state.targets.length,
            moveType: config.moveType,
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
   * Clear moving TP state for a position
   */
  static clearMovingTPState(positionId: string): void {
    this.activeMovingTPs.delete(positionId);
  }

  /**
   * Get all active moving TPs
   */
  static getActiveMovingTPs(): Map<string, MovingTPState> {
    return new Map(this.activeMovingTPs);
  }

  /**
   * Get statistics for a moving TP state
   */
  static getStatistics(state: MovingTPState): {
    totalTargets: number;
    filledTargets: number;
    movedTargets: number;
    pendingTargets: number;
    totalMoveCount: number;
    avgPriceAdjustment: number;
    isActive: boolean;
  } {
    const filledTargets = state.targets.filter((t) => t.status === "FILLED").length;
    const movedTargets = state.targets.filter((t) => t.status === "MOVED").length;
    const pendingTargets = state.targets.filter((t) => t.status === "PENDING").length;

    const priceAdjustments = state.targets
      .filter((t) => t.movedFrom !== undefined)
      .map((t) => Math.abs(((t.price - t.movedFrom!) / t.movedFrom!) * 100));

    const avgPriceAdjustment =
      priceAdjustments.length > 0
        ? priceAdjustments.reduce((a, b) => a + b, 0) / priceAdjustments.length
        : 0;

    return {
      totalTargets: state.targets.length,
      filledTargets,
      movedTargets,
      pendingTargets,
      totalMoveCount: state.totalMoveCount,
      avgPriceAdjustment,
      isActive: state.status === "ACTIVE",
    };
  }
}

export default MovingTPService;
