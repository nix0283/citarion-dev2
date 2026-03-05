/**
 * Signal Filter Service
 *
 * Production-ready signal filtering system for auto-trading.
 * Provides comprehensive filtering capabilities:
 * - Direction filtering (LONG/SHORT/BOTH)
 * - Risk-Reward ratio validation
 * - SL/TP requirement checks
 * - Symbol whitelist/blacklist management
 * - Price and volume thresholds
 * - Position count limits
 * - Trade interval throttling
 *
 * Integrates with BotConfig from Prisma for configuration.
 */

import { db } from "@/lib/db";
import type { BotConfig } from "@prisma/client";

// ==================== TYPES ====================

/**
 * Reasons why a signal was rejected
 */
export type FilterReason =
  | "DIRECTION_NOT_ALLOWED"
  | "INSUFFICIENT_RISK_REWARD"
  | "MISSING_STOP_LOSS"
  | "MISSING_TAKE_PROFIT"
  | "SYMBOL_NOT_IN_WHITELIST"
  | "SYMBOL_IN_BLACKLIST"
  | "SYMBOL_PRICE_BELOW_MIN"
  | "VOLUME_BELOW_MIN"
  | "MAX_POSITIONS_REACHED"
  | "TRADE_INTERVAL_NOT_MET"
  | "MARKET_DATA_UNAVAILABLE"
  | "INVALID_SIGNAL_DATA";

/**
 * Result of signal evaluation
 */
export interface FilterResult {
  /** Whether the signal passed all filters */
  accepted: boolean;
  /** Signal identifier for logging */
  signalId: number | string;
  /** Symbol being evaluated */
  symbol: string;
  /** Direction of the signal */
  direction: "LONG" | "SHORT";
  /** Risk-reward ratio if calculable */
  riskRewardRatio?: number;
  /** Reasons for rejection (empty if accepted) */
  rejectReasons: FilterReason[];
  /** Additional details about the filter decision */
  details: Record<string, unknown>;
  /** Timestamp of evaluation */
  evaluatedAt: Date;
}

/**
 * Signal data structure for filtering
 */
export interface SignalData {
  /** Signal ID (Cornix-style sequential ID) */
  signalId: number;
  /** Trading pair symbol (e.g., BTCUSDT) */
  symbol: string;
  /** Trade direction */
  direction: "LONG" | "SHORT";
  /** Action type */
  action: "BUY" | "SELL" | "CLOSE";
  /** Market type */
  marketType: "SPOT" | "FUTURES";
  /** Entry prices array */
  entryPrices: number[];
  /** Stop loss price (null if not set) */
  stopLoss: number | null;
  /** Take profit targets */
  takeProfits: Array<{ price: number; percentage: number }>;
  /** Leverage */
  leverage: number;
  /** Signal source */
  source: string;
  /** Signal timestamp */
  createdAt: Date;
}

/**
 * Context for signal evaluation
 */
export interface FilterContext {
  /** Account ID for position queries */
  accountId: string;
  /** User ID for bot config lookup */
  userId: string;
  /** Current market price of the symbol */
  currentPrice?: number;
  /** 24h volume of the symbol */
  volume24h?: number;
  /** Exchange ID */
  exchangeId?: string;
  /** Whether this is a demo account */
  isDemo?: boolean;
}

/**
 * Configuration for signal filtering
 * Derived from BotConfig with additional computed values
 */
export interface SignalFilterConfig {
  /** Direction filter: LONG, SHORT, or BOTH */
  directionFilter: "LONG" | "SHORT" | "BOTH";
  /** Minimum risk-reward ratio required */
  minRiskRewardRatio: number | null;
  /** Reject signals without stop loss */
  ignoreSignalsWithoutSL: boolean;
  /** Reject signals without take profit */
  ignoreSignalsWithoutTP: boolean;
  /** Allowed symbols whitelist (null = all allowed) */
  allowedSymbols: string[] | null;
  /** Blacklisted symbols */
  blacklistedSymbols: string[];
  /** Minimum symbol price */
  minSymbolPrice: number | null;
  /** Minimum 24h volume */
  minSymbol24hVolume: number | null;
  /** Maximum concurrent positions */
  maxOpenTrades: number;
  /** Minimum interval between trades on same symbol (minutes) */
  minTradeInterval: number;
}

/**
 * Result of config validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ==================== MAIN SERVICE ====================

export class SignalFilterService {
  /** Cache for last trade times per symbol (for throttling) */
  private static lastTradeTimes: Map<string, Date> = new Map();

  /**
   * Evaluate a signal against filter configuration
   * This is the main entry point for signal filtering
   */
  static async evaluateSignal(
    signal: SignalData,
    config: SignalFilterConfig,
    context: FilterContext
  ): Promise<FilterResult> {
    const rejectReasons: FilterReason[] = [];
    const details: Record<string, unknown> = {};
    let riskRewardRatio: number | undefined;

    // Track evaluation start
    const evaluatedAt = new Date();

    try {
      // 1. Validate signal data
      if (!signal.symbol || !signal.direction) {
        rejectReasons.push("INVALID_SIGNAL_DATA");
        return this.createResult(signal, false, rejectReasons, details, riskRewardRatio, evaluatedAt);
      }

      // 2. Check direction filter
      if (!this.isDirectionAllowed(signal.direction, config.directionFilter)) {
        rejectReasons.push("DIRECTION_NOT_ALLOWED");
        details.directionFilter = config.directionFilter;
      }

      // 3. Check symbol whitelist/blacklist
      const symbolCheck = this.isSymbolAllowed(signal.symbol, config);
      if (!symbolCheck.allowed) {
        if (symbolCheck.reason === "BLACKLISTED") {
          rejectReasons.push("SYMBOL_IN_BLACKLIST");
        } else if (symbolCheck.reason === "NOT_IN_WHITELIST") {
          rejectReasons.push("SYMBOL_NOT_IN_WHITELIST");
        }
        details.symbolCheck = symbolCheck;
      }

      // 4. Check stop loss requirement
      if (config.ignoreSignalsWithoutSL && !signal.stopLoss) {
        rejectReasons.push("MISSING_STOP_LOSS");
        details.stopLossRequired = true;
      }

      // 5. Check take profit requirement
      if (config.ignoreSignalsWithoutTP && (!signal.takeProfits || signal.takeProfits.length === 0)) {
        rejectReasons.push("MISSING_TAKE_PROFIT");
        details.takeProfitRequired = true;
      }

      // 6. Calculate and check risk-reward ratio
      if (config.minRiskRewardRatio !== null && config.minRiskRewardRatio > 0) {
        riskRewardRatio = this.calculateRiskRewardRatio(signal);
        details.riskRewardRatio = riskRewardRatio;

        if (riskRewardRatio === null || riskRewardRatio < config.minRiskRewardRatio) {
          rejectReasons.push("INSUFFICIENT_RISK_REWARD");
          details.minRRRequired = config.minRiskRewardRatio;
        }
      }

      // 7. Check market data requirements (price and volume)
      if (config.minSymbolPrice !== null || config.minSymbol24hVolume !== null) {
        const marketData = await this.getMarketData(signal.symbol, context);

        if (!marketData.available) {
          rejectReasons.push("MARKET_DATA_UNAVAILABLE");
          details.marketDataError = marketData.error;
        } else {
          details.currentPrice = marketData.price;
          details.volume24h = marketData.volume24h;

          // Check minimum price
          if (config.minSymbolPrice !== null && marketData.price < config.minSymbolPrice) {
            rejectReasons.push("SYMBOL_PRICE_BELOW_MIN");
            details.minPriceRequired = config.minSymbolPrice;
          }

          // Check minimum volume
          if (config.minSymbol24hVolume !== null && (marketData.volume24h || 0) < config.minSymbol24hVolume) {
            rejectReasons.push("VOLUME_BELOW_MIN");
            details.minVolumeRequired = config.minSymbol24hVolume;
          }
        }
      }

      // 8. Check max concurrent positions
      const positionCount = await this.getOpenPositionCount(context.accountId);
      details.currentPositionCount = positionCount;

      if (positionCount >= config.maxOpenTrades) {
        rejectReasons.push("MAX_POSITIONS_REACHED");
        details.maxPositionsAllowed = config.maxOpenTrades;
      }

      // 9. Check trade interval throttling
      const throttleCheck = await this.shouldThrottle(signal.symbol, config, context);
      if (throttleCheck.shouldThrottle) {
        rejectReasons.push("TRADE_INTERVAL_NOT_MET");
        details.lastTradeTime = throttleCheck.lastTradeTime;
        details.nextAllowedTime = throttleCheck.nextAllowedTime;
        details.intervalMinutes = config.minTradeInterval;
      }

      // Determine final result
      const accepted = rejectReasons.length === 0;

      // Log the filter decision
      await this.logFilterDecision(signal, config, context, accepted, rejectReasons, details);

      return this.createResult(signal, accepted, rejectReasons, details, riskRewardRatio, evaluatedAt);

    } catch (error) {
      console.error("[SignalFilter] Error evaluating signal:", error);

      rejectReasons.push("INVALID_SIGNAL_DATA");
      details.error = error instanceof Error ? error.message : "Unknown error";

      return this.createResult(signal, false, rejectReasons, details, riskRewardRatio, evaluatedAt);
    }
  }

  /**
   * Calculate risk-reward ratio for a signal
   * R:R = (Take Profit - Entry) / (Entry - Stop Loss)
   */
  static calculateRiskRewardRatio(signal: SignalData): number | null {
    // Need entry price, stop loss, and at least one take profit
    if (!signal.entryPrices || signal.entryPrices.length === 0) {
      return null;
    }

    if (!signal.stopLoss) {
      return null;
    }

    if (!signal.takeProfits || signal.takeProfits.length === 0) {
      return null;
    }

    const entryPrice = signal.entryPrices[0];
    const stopLoss = signal.stopLoss;

    // Use first TP for R:R calculation (conservative estimate)
    const takeProfit = signal.takeProfits[0].price;

    // Calculate based on direction
    let risk: number;
    let reward: number;

    if (signal.direction === "LONG") {
      // For LONG: risk is entry - SL, reward is TP - entry
      risk = entryPrice - stopLoss;
      reward = takeProfit - entryPrice;
    } else {
      // For SHORT: risk is SL - entry, reward is entry - TP
      risk = stopLoss - entryPrice;
      reward = entryPrice - takeProfit;
    }

    // Prevent division by zero or negative risk
    if (risk <= 0) {
      return null;
    }

    // Calculate weighted average TP for more accurate R:R
    if (signal.takeProfits.length > 1) {
      let totalReward = 0;
      let totalPercentage = 0;

      for (const tp of signal.takeProfits) {
        const tpReward = signal.direction === "LONG"
          ? tp.price - entryPrice
          : entryPrice - tp.price;

        totalReward += tpReward * (tp.percentage / 100);
        totalPercentage += tp.percentage;
      }

      if (totalPercentage > 0) {
        reward = totalReward / (totalPercentage / 100);
      }
    }

    return Math.round((reward / risk) * 100) / 100; // Round to 2 decimals
  }

  /**
   * Check if a symbol is allowed based on whitelist and blacklist
   */
  static isSymbolAllowed(
    symbol: string,
    config: SignalFilterConfig
  ): { allowed: boolean; reason?: "NOT_IN_WHITELIST" | "BLACKLISTED" | null } {
    // Normalize symbol
    const normalizedSymbol = symbol.toUpperCase();

    // Check blacklist first (higher priority)
    if (config.blacklistedSymbols.length > 0) {
      const blacklisted = config.blacklistedSymbols.some(
        s => s.toUpperCase() === normalizedSymbol
      );

      if (blacklisted) {
        return { allowed: false, reason: "BLACKLISTED" };
      }
    }

    // Check whitelist
    if (config.allowedSymbols !== null && config.allowedSymbols.length > 0) {
      const whitelisted = config.allowedSymbols.some(
        s => s.toUpperCase() === normalizedSymbol
      );

      if (!whitelisted) {
        return { allowed: false, reason: "NOT_IN_WHITELIST" };
      }
    }

    return { allowed: true, reason: null };
  }

  /**
   * Check if trading should be throttled due to minimum interval
   */
  static async shouldThrottle(
    symbol: string,
    config: SignalFilterConfig,
    context: FilterContext
  ): Promise<{
    shouldThrottle: boolean;
    lastTradeTime?: Date;
    nextAllowedTime?: Date;
  }> {
    // Skip if no interval configured
    if (config.minTradeInterval <= 0) {
      return { shouldThrottle: false };
    }

    const normalizedSymbol = symbol.toUpperCase();

    // Check in-memory cache first
    const cacheKey = `${context.accountId}:${normalizedSymbol}`;
    const cachedTime = this.lastTradeTimes.get(cacheKey);

    if (cachedTime) {
      const intervalMs = config.minTradeInterval * 60 * 1000;
      const timeSinceLastTrade = Date.now() - cachedTime.getTime();

      if (timeSinceLastTrade < intervalMs) {
        const nextAllowedTime = new Date(cachedTime.getTime() + intervalMs);
        return {
          shouldThrottle: true,
          lastTradeTime: cachedTime,
          nextAllowedTime,
        };
      }
    }

    // Query database for last trade on this symbol
    try {
      const lastTrade = await db.position.findFirst({
        where: {
          accountId: context.accountId,
          symbol: normalizedSymbol,
          status: "OPEN",
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          createdAt: true,
        },
      });

      if (lastTrade) {
        const intervalMs = config.minTradeInterval * 60 * 1000;
        const timeSinceLastTrade = Date.now() - lastTrade.createdAt.getTime();

        if (timeSinceLastTrade < intervalMs) {
          const nextAllowedTime = new Date(lastTrade.createdAt.getTime() + intervalMs);

          // Update cache
          this.lastTradeTimes.set(cacheKey, lastTrade.createdAt);

          return {
            shouldThrottle: true,
            lastTradeTime: lastTrade.createdAt,
            nextAllowedTime,
          };
        }
      }
    } catch (error) {
      console.error("[SignalFilter] Error checking throttle:", error);
    }

    return { shouldThrottle: false };
  }

  /**
   * Validate filter configuration
   */
  static validateConfig(config: SignalFilterConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate direction filter
    if (!["LONG", "SHORT", "BOTH"].includes(config.directionFilter)) {
      errors.push("Direction filter must be LONG, SHORT, or BOTH");
    }

    // Validate R:R ratio
    if (config.minRiskRewardRatio !== null) {
      if (config.minRiskRewardRatio < 0) {
        errors.push("Minimum R:R ratio cannot be negative");
      } else if (config.minRiskRewardRatio > 100) {
        warnings.push("Very high minimum R:R ratio may reject most signals");
      }
    }

    // Validate max open trades
    if (config.maxOpenTrades < 1) {
      errors.push("Max open trades must be at least 1");
    } else if (config.maxOpenTrades > 100) {
      warnings.push("Very high max open trades may exceed exchange limits");
    }

    // Validate trade interval
    if (config.minTradeInterval < 0) {
      errors.push("Min trade interval cannot be negative");
    } else if (config.minTradeInterval > 1440) {
      warnings.push("Trade interval over 24 hours may significantly limit trading");
    }

    // Validate symbol lists
    if (config.allowedSymbols !== null) {
      if (config.allowedSymbols.length === 0) {
        warnings.push("Empty whitelist will reject all symbols");
      }

      // Check for duplicates
      const uniqueSymbols = new Set(config.allowedSymbols.map(s => s.toUpperCase()));
      if (uniqueSymbols.size !== config.allowedSymbols.length) {
        warnings.push("Duplicate symbols found in whitelist");
      }
    }

    if (config.blacklistedSymbols.length > 0) {
      const uniqueBlacklisted = new Set(config.blacklistedSymbols.map(s => s.toUpperCase()));
      if (uniqueBlacklisted.size !== config.blacklistedSymbols.length) {
        warnings.push("Duplicate symbols found in blacklist");
      }

      // Check for conflict with whitelist
      if (config.allowedSymbols !== null) {
        const whitelist = new Set(config.allowedSymbols.map(s => s.toUpperCase()));
        const blacklist = new Set(config.blacklistedSymbols.map(s => s.toUpperCase()));
        const conflict = [...whitelist].filter(s => blacklist.has(s));

        if (conflict.length > 0) {
          errors.push(`Symbols in both whitelist and blacklist: ${conflict.join(", ")}`);
        }
      }
    }

    // Validate price and volume thresholds
    if (config.minSymbolPrice !== null && config.minSymbolPrice < 0) {
      errors.push("Minimum symbol price cannot be negative");
    }

    if (config.minSymbol24hVolume !== null && config.minSymbol24hVolume < 0) {
      errors.push("Minimum 24h volume cannot be negative");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get filter configuration from BotConfig
   */
  static getConfigFromBotConfig(botConfig: BotConfig): SignalFilterConfig {
    return {
      directionFilter: botConfig.directionFilter as "LONG" | "SHORT" | "BOTH",
      minRiskRewardRatio: botConfig.minRiskRewardRatio,
      ignoreSignalsWithoutSL: botConfig.ignoreSignalsWithoutSL,
      ignoreSignalsWithoutTP: botConfig.ignoreSignalsWithoutTP,
      allowedSymbols: botConfig.allowedSymbols ? JSON.parse(botConfig.allowedSymbols) : null,
      blacklistedSymbols: botConfig.blacklistedSymbols ? JSON.parse(botConfig.blacklistedSymbols) : [],
      minSymbolPrice: botConfig.minSymbolPrice,
      minSymbol24hVolume: botConfig.minSymbol24hVolume,
      maxOpenTrades: botConfig.maxOpenTrades,
      minTradeInterval: botConfig.minTradeInterval,
    };
  }

  /**
   * Update the last trade time for a symbol (call after successful execution)
   */
  static updateLastTradeTime(accountId: string, symbol: string): void {
    const cacheKey = `${accountId}:${symbol.toUpperCase()}`;
    this.lastTradeTimes.set(cacheKey, new Date());
  }

  /**
   * Clear the throttle cache (useful for testing or reset)
   */
  static clearThrottleCache(): void {
    this.lastTradeTimes.clear();
  }

  /**
   * Get filter statistics for monitoring
   */
  static async getFilterStats(accountId: string): Promise<{
    openPositionCount: number;
    recentFilterDecisions: number;
  }> {
    try {
      const [openPositionCount, recentLogs] = await Promise.all([
        db.position.count({
          where: {
            accountId,
            status: "OPEN",
          },
        }),
        db.systemLog.count({
          where: {
            category: "TRADE",
            message: { contains: "[SIGNAL FILTER]" },
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24h
            },
          },
        }),
      ]);

      return {
        openPositionCount,
        recentFilterDecisions: recentLogs,
      };
    } catch {
      return {
        openPositionCount: 0,
        recentFilterDecisions: 0,
      };
    }
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Check if direction is allowed by filter
   */
  private static isDirectionAllowed(
    direction: "LONG" | "SHORT",
    filter: "LONG" | "SHORT" | "BOTH"
  ): boolean {
    if (filter === "BOTH") return true;
    return direction === filter;
  }

  /**
   * Get market data for a symbol
   */
  private static async getMarketData(
    symbol: string,
    context: FilterContext
  ): Promise<{
    available: boolean;
    price?: number;
    volume24h?: number;
    error?: string;
  }> {
    try {
      // Use provided values if available
      if (context.currentPrice !== undefined) {
        return {
          available: true,
          price: context.currentPrice,
          volume24h: context.volume24h,
        };
      }

      // Query from database
      const marketPrice = await db.marketPrice.findUnique({
        where: { symbol },
      });

      if (!marketPrice) {
        return {
          available: false,
          error: "No market data found for symbol",
        };
      }

      return {
        available: true,
        price: marketPrice.price,
        volume24h: marketPrice.volume24h || undefined,
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get count of open positions for an account
   */
  private static async getOpenPositionCount(accountId: string): Promise<number> {
    try {
      return await db.position.count({
        where: {
          accountId,
          status: "OPEN",
        },
      });
    } catch {
      return 0;
    }
  }

  /**
   * Log filter decision to system log
   */
  private static async logFilterDecision(
    signal: SignalData,
    config: SignalFilterConfig,
    context: FilterContext,
    accepted: boolean,
    rejectReasons: FilterReason[],
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      await db.systemLog.create({
        data: {
          level: accepted ? "INFO" : "WARNING",
          category: "TRADE",
          message: `[SIGNAL FILTER] Signal #${signal.signalId} ${signal.symbol} ${signal.direction}: ${accepted ? "ACCEPTED" : "REJECTED"}`,
          details: JSON.stringify({
            signalId: signal.signalId,
            symbol: signal.symbol,
            direction: signal.direction,
            accepted,
            rejectReasons,
            config: {
              directionFilter: config.directionFilter,
              minRR: config.minRiskRewardRatio,
              requireSL: config.ignoreSignalsWithoutSL,
              requireTP: config.ignoreSignalsWithoutTP,
              maxTrades: config.maxOpenTrades,
              tradeInterval: config.minTradeInterval,
            },
            context: {
              accountId: context.accountId,
              userId: context.userId,
            },
            details,
          }),
          userId: context.userId,
        },
      });
    } catch (error) {
      console.error("[SignalFilter] Failed to log filter decision:", error);
    }
  }

  /**
   * Create the filter result object
   */
  private static createResult(
    signal: SignalData,
    accepted: boolean,
    rejectReasons: FilterReason[],
    details: Record<string, unknown>,
    riskRewardRatio: number | undefined,
    evaluatedAt: Date
  ): FilterResult {
    return {
      accepted,
      signalId: signal.signalId,
      symbol: signal.symbol,
      direction: signal.direction,
      riskRewardRatio,
      rejectReasons,
      details,
      evaluatedAt,
    };
  }
}

export default SignalFilterService;
