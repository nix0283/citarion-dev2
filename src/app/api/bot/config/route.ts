import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDefaultUserId } from "@/lib/default-user";

// Default bot config (Cornix-style)
const DEFAULT_BOT_CONFIG = {
  name: "Default Bot",
  description: "Default trading bot configuration",
  isActive: false,

  // Exchange settings
  exchangeId: "binance",
  exchangeType: "futures",

  // Trade amount
  tradeAmount: 100,
  amountType: "FIXED",
  amountOverride: false,

  // Leverage (Cornix: Exactly or Up To)
  leverage: 10,
  leverageOverride: false,
  leverageMode: "EXACTLY", // EXACTLY or UP_TO

  // Close Trade on TP/SL before Entry
  closeOnTPSLBeforeEntry: true,
  closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup: false,

  // Entry strategy (Cornix: 7 strategies)
  entryStrategy: "EVENLY_DIVIDED",
  entryZoneTargets: 4, // Cornix default
  entryOnlyIfNotDefinedByGroup: false,

  // ==================== FIRST ENTRY AS MARKET (Cornix) ====================
  firstEntryAsMarket: false,
  firstEntryMode: "ENTRY_PRICE_REACHED", // IMMEDIATE or ENTRY_PRICE_REACHED
  firstEntryMaxPriceCap: 1.0, // 0.05%-20% (Cornix spec)
  firstEntryOnlyIfNotDefinedByGroup: false,

  // ==================== TAKE-PROFIT GRACE (Cornix) ====================
  tpGraceEnabled: false,
  tpGraceCapPercent: 0.5, // Max 0.5% total adjustment
  tpGraceMaxRetries: 3,
  tpGraceRetryInterval: 5, // 5 seconds between retries
  tpGraceOnlyIfNotDefinedByGroup: false,

  // Take-profit strategy (Cornix: 7 strategies)
  tpStrategy: "EVENLY_DIVIDED",
  tpTargetCount: 1,
  tpOnlyIfNotDefinedByGroup: false,
  movingTPEnabled: false,

  // Trailing Take-Profit
  tpTrailingEnabled: false,
  tpTrailingPercent: 1.0,
  tpTrailingOnlyIfNotDefinedByGroup: false,

  // Stop-loss
  defaultStopLoss: 5,
  slBaseline: "AVERAGE_ENTRIES", // AVERAGE_ENTRIES or FIRST_ENTRY
  slTimeout: 0,
  slTimeoutUnit: "SECONDS",
  slOrderType: "MARKET",
  slLimitPriceReduction: 2.0, // Cornix default 2%
  slOnlyIfNotDefinedByGroup: false,

  // Trailing Stop (Cornix: 5 types)
  trailingEnabled: false,
  trailingType: "BREAKEVEN", // BREAKEVEN, MOVING_TARGET, MOVING_2_TARGET, PERCENT_BELOW_TRIGGERS, PERCENT_BELOW_HIGHEST
  trailingOnlyIfNotDefinedByGroup: false,

  // Trailing Entry
  trailingEntryEnabled: false,
  trailingEntryPercent: 1.0,
  trailingEntryOnlyIfNotDefinedByGroup: false,

  // Margin
  hedgeMode: false,
  marginMode: "ISOLATED",
  leverageOnlyIfNotDefinedByGroup: false,

  // Filters
  directionFilter: "BOTH", // LONG, SHORT, BOTH
  maxOpenTrades: 5,
  minTradeInterval: 5,
  maxConcurrentAmount: null,
  minSymbolPrice: null,
  minSymbol24hVolume: null,

  // Notifications
  notifyOnEntry: true,
  notifyOnExit: true,
  notifyOnSL: true,
  notifyOnTP: true,
  notifyOnError: true,
  notifyOnNewSignal: true,
};

// GET - Fetch bot configuration
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const configId = searchParams.get("id");
    const accountId = searchParams.get("accountId");

    // If specific config ID provided
    if (configId) {
      const config = await db.botConfig.findUnique({
        where: { id: configId }
      });

      if (!config) {
        return NextResponse.json(
          { error: "Config not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        config,
      });
    }

    // Get all configs for account
    if (accountId) {
      const configs = await db.botConfig.findMany({
        where: { accountId },
        orderBy: { createdAt: "desc" }
      });

      return NextResponse.json({
        success: true,
        configs,
        count: configs.length,
      });
    }

    // Get all configs (for demo)
    const configs = await db.botConfig.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // If no configs exist, return default
    if (configs.length === 0) {
      return NextResponse.json({
        success: true,
        config: DEFAULT_BOT_CONFIG,
        isDefault: true,
      });
    }

    return NextResponse.json({
      success: true,
      configs,
      count: configs.length,
    });

  } catch (error) {
    console.error("Get bot config error:", error);
    return NextResponse.json({
      success: true,
      config: DEFAULT_BOT_CONFIG,
      isDefault: true,
      error: "Database error, returning default config",
    });
  }
}

// POST - Create or update bot configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      name = "Trading Bot",
      description,
      isActive = false,
      exchangeId = "binance",
      exchangeType = "futures",
      tradeAmount = 100,
      amountType = "FIXED",
      amountOverride = false,
      leverage = 10,
      leverageOverride = false,
      leverageMode = "EXACTLY",
      leverageOnlyIfNotDefinedByGroup = false,
      // Close on TP/SL before entry
      closeOnTPSLBeforeEntry = true,
      closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup = false,
      // Entry strategy
      entryStrategy = "EVENLY_DIVIDED",
      entryZoneTargets = 4,
      entryOnlyIfNotDefinedByGroup = false,
      // First Entry as Market
      firstEntryAsMarket = false,
      firstEntryMode = "ENTRY_PRICE_REACHED",
      firstEntryMaxPriceCap = 1.0,
      firstEntryOnlyIfNotDefinedByGroup = false,
      // TP Grace
      tpGraceEnabled = false,
      tpGraceCapPercent = 0.5,
      tpGraceMaxRetries = 3,
      tpGraceRetryInterval = 5,
      tpGraceOnlyIfNotDefinedByGroup = false,
      // TP strategy
      tpStrategy = "EVENLY_DIVIDED",
      tpTargetCount = 1,
      tpOnlyIfNotDefinedByGroup = false,
      movingTPEnabled = false,
      // Trailing TP
      tpTrailingEnabled = false,
      tpTrailingPercent = 1.0,
      tpTrailingOnlyIfNotDefinedByGroup = false,
      // Stop-loss
      defaultStopLoss,
      slBaseline = "AVERAGE_ENTRIES",
      slTimeout = 0,
      slTimeoutUnit = "SECONDS",
      slOrderType = "MARKET",
      slLimitPriceReduction = 2.0,
      slOnlyIfNotDefinedByGroup = false,
      // Trailing Stop
      trailingEnabled = false,
      trailingType = "BREAKEVEN",
      trailingValue,
      trailingTriggerType,
      trailingTriggerValue,
      trailingStopPercent,
      trailingOnlyIfNotDefinedByGroup = false,
      // Trailing Entry
      trailingEntryEnabled = false,
      trailingEntryPercent = 1.0,
      trailingEntryOnlyIfNotDefinedByGroup = false,
      // Margin
      hedgeMode = false,
      marginMode = "ISOLATED",
      // Filters
      directionFilter = "BOTH",
      maxOpenTrades = 5,
      minTradeInterval = 5,
      maxConcurrentAmount,
      minSymbolPrice,
      minSymbol24hVolume,
      allowedSymbols,
      blacklistedSymbols,
      // Notifications
      notifyOnEntry = true,
      notifyOnExit = true,
      notifyOnSL = true,
      notifyOnTP = true,
      notifyOnError = true,
      notifyOnNewSignal = true,
      accountId,
    } = body;

    let config;

    const configData = {
      name,
      description,
      isActive,
      exchangeId,
      exchangeType,
      tradeAmount,
      amountType,
      amountOverride,
      leverage,
      leverageOverride,
      leverageMode,
      leverageOnlyIfNotDefinedByGroup,
      closeOnTPSLBeforeEntry,
      closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup,
      entryStrategy,
      entryZoneTargets,
      entryOnlyIfNotDefinedByGroup,
      firstEntryAsMarket,
      firstEntryMode,
      firstEntryMaxPriceCap,
      firstEntryOnlyIfNotDefinedByGroup,
      tpGraceEnabled,
      tpGraceCapPercent,
      tpGraceMaxRetries,
      tpGraceRetryInterval,
      tpGraceOnlyIfNotDefinedByGroup,
      tpStrategy,
      tpTargetCount,
      tpOnlyIfNotDefinedByGroup,
      movingTPEnabled,
      tpTrailingEnabled,
      tpTrailingPercent,
      tpTrailingOnlyIfNotDefinedByGroup,
      defaultStopLoss,
      slBaseline,
      slTimeout,
      slTimeoutUnit,
      slOrderType,
      slLimitPriceReduction,
      slOnlyIfNotDefinedByGroup,
      trailingEnabled,
      trailingType,
      trailingValue,
      trailingTriggerType,
      trailingTriggerValue,
      trailingStopPercent,
      trailingOnlyIfNotDefinedByGroup,
      trailingEntryEnabled,
      trailingEntryPercent,
      trailingEntryOnlyIfNotDefinedByGroup,
      hedgeMode,
      marginMode,
      directionFilter,
      maxOpenTrades,
      minTradeInterval,
      maxConcurrentAmount,
      minSymbolPrice,
      minSymbol24hVolume,
      allowedSymbols: allowedSymbols ? JSON.stringify(allowedSymbols) : null,
      blacklistedSymbols: blacklistedSymbols ? JSON.stringify(blacklistedSymbols) : null,
      notifyOnEntry,
      notifyOnExit,
      notifyOnSL,
      notifyOnTP,
      notifyOnError,
      notifyOnNewSignal,
    };

    if (id) {
      // Update existing config
      config = await db.botConfig.update({
        where: { id },
        data: configData,
      });
    } else {
      // Create new config
      const userId = await getDefaultUserId();
      config = await db.botConfig.create({
        data: {
          userId,
          ...configData,
          accountId,
        },
      });
    }

    // Log the action
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "SYSTEM",
        message: `Bot config ${id ? 'updated' : 'created'}: ${name}`,
        details: JSON.stringify({ configId: config.id, isActive })
      }
    });

    return NextResponse.json({
      success: true,
      config,
      message: id
        ? `Конфигурация "${name}" обновлена`
        : `Конфигурация "${name}" создана`,
    });

  } catch (error) {
    console.error("Save bot config error:", error);
    return NextResponse.json(
      { error: "Failed to save config", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// DELETE - Remove bot configuration
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Config ID is required" },
        { status: 400 }
      );
    }

    await db.botConfig.delete({
      where: { id }
    });

    return NextResponse.json({
      success: true,
      message: "Configuration deleted",
    });

  } catch (error) {
    console.error("Delete bot config error:", error);
    return NextResponse.json(
      { error: "Failed to delete config" },
      { status: 500 }
    );
  }
}
