/**
 * Telegram Bot Configuration Commands for CITARION
 * Implements 15 Cornix auto-trading feature commands
 * 
 * Commands:
 * /firstentry [on|off] [mode] [cap%] - Configure First Entry as Market
 * /tpgrace [on|off] [cap%] [retries] - Configure TP Grace
 * /trailing [type] [value] - Configure Trailing Stop
 * /trailingentry [on|off] [%] - Configure Trailing Entry
 * /trailingtp [on|off] [%] - Configure Trailing TP
 * /entrystrategy [strategy] - Set entry strategy
 * /tpstrategy [strategy] - Set TP strategy
 * /movingtp [on|off] - Toggle Moving TP
 * /sl [value] [baseline] - Configure Stop Loss
 * /leverage [value] [mode] - Configure Leverage
 * /direction [long|short|both] - Set direction filter
 * /autoclose [on|off] - Toggle Close on TP/SL Before Entry
 * /grace [%] - Set First Entry Grace
 * /autoexec [on|off] - Toggle Auto-Execute
 * /filters [options] - Configure Signal Filters
 * /status - Show current configuration
 * /reset - Reset to defaults
 * /help - Show all commands
 */

import { db } from "@/lib/db";
import type { 
  BotConfigSettings, 
  CommandResult, 
  ConfigStatus,
  TrailingType,
  DirectionFilter,
  StrategyType,
  DEFAULT_BOT_CONFIG 
} from "./types";

// ==================== HELPER FUNCTIONS ====================

/**
 * Get or create bot config for user
 */
async function getOrCreateConfig(userId: string): Promise<BotConfigSettings> {
  let config = await db.botConfig.findFirst({
    where: { userId },
  });

  if (!config) {
    // Create default config
    config = await db.botConfig.create({
      data: {
        userId,
        name: "Default Bot Config",
        isActive: true,
      },
    });
  }

  return mapConfigToSettings(config);
}

/**
 * Map database config to settings type
 */
function mapConfigToSettings(config: any): BotConfigSettings {
  return {
    // First Entry as Market
    firstEntryMode: (config.firstEntryMode as 'IMMEDIATE' | 'WAIT_ENTRY') || 'WAIT_ENTRY',
    firstEntryMaxPriceCap: config.firstEntryMaxPriceCap ?? 1.0,
    firstEntryAsMarket: config.firstEntryAsMarket ?? false,
    firstEntryOnlyIfNotDefinedByGroup: config.firstEntryOnlyIfNotDefinedByGroup ?? false,

    // TP Grace
    tpGraceEnabled: config.tpGraceEnabled ?? false,
    tpGraceCapPercent: config.tpGraceCapPercent ?? 0.5,
    tpGraceMaxRetries: config.tpGraceMaxRetries ?? 3,
    tpGraceOnlyIfNotDefinedByGroup: config.tpGraceOnlyIfNotDefinedByGroup ?? false,

    // Trailing Stop
    trailingEnabled: config.trailingEnabled ?? false,
    trailingType: config.trailingType || null,
    trailingValue: config.trailingValue ?? null,
    trailingOnlyIfNotDefinedByGroup: config.trailingOnlyIfNotDefinedByGroup ?? false,

    // Trailing Entry
    trailingEntryEnabled: config.trailingEntryEnabled ?? false,
    trailingEntryPercent: config.trailingEntryPercent ?? 1.0,
    trailingEntryOnlyIfNotDefinedByGroup: config.trailingEntryOnlyIfNotDefinedByGroup ?? false,

    // Trailing TP
    tpTrailingEnabled: config.tpTrailingEnabled ?? false,
    tpTrailingPercent: config.tpTrailingPercent ?? 1.0,
    tpTrailingOnlyIfNotDefinedByGroup: config.tpTrailingOnlyIfNotDefinedByGroup ?? false,

    // Entry Strategy
    entryStrategy: (config.entryStrategy as BotConfigSettings['entryStrategy']) || 'EVENLY_DIVIDED',
    entryZoneTargets: config.entryZoneTargets ?? 4,
    entryOnlyIfNotDefinedByGroup: config.entryOnlyIfNotDefinedByGroup ?? false,

    // TP Strategy
    tpStrategy: (config.tpStrategy as BotConfigSettings['tpStrategy']) || 'EVENLY_DIVIDED',
    tpOnlyIfNotDefinedByGroup: config.tpOnlyIfNotDefinedByGroup ?? false,

    // Moving TP
    movingTPEnabled: config.movingTPEnabled ?? false,

    // Stop Loss
    defaultStopLoss: config.defaultStopLoss ?? null,
    slBaseline: (config.slBaseline as 'AVERAGE_ENTRIES' | 'FIRST_ENTRY') || 'AVERAGE_ENTRIES',
    slOnlyIfNotDefinedByGroup: config.slOnlyIfNotDefinedByGroup ?? false,

    // Leverage
    leverage: config.leverage ?? 10,
    leverageMode: (config.leverageMode as 'EXACTLY' | 'UP_TO') || 'EXACTLY',
    leverageOnlyIfNotDefinedByGroup: config.leverageOnlyIfNotDefinedByGroup ?? false,

    // Direction
    directionFilter: (config.directionFilter as 'LONG' | 'SHORT' | 'BOTH') || 'BOTH',

    // Auto-Close
    closeOnTPSLBeforeEntry: config.closeOnTPSLBeforeEntry ?? true,
    closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup: config.closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup ?? false,

    // First Entry Grace
    firstEntryGracePercent: config.firstEntryGracePercent ?? 0,

    // Auto-Execute
    autoExecuteEnabled: config.autoExecuteEnabled ?? false,

    // Filters
    ignoreSignalsWithoutSL: config.ignoreSignalsWithoutSL ?? false,
    ignoreSignalsWithoutTP: config.ignoreSignalsWithoutTP ?? false,
    minRiskRewardRatio: config.minRiskRewardRatio ?? null,
    allowedSymbols: config.allowedSymbols ? JSON.parse(config.allowedSymbols) : null,
    blacklistedSymbols: config.blacklistedSymbols ? JSON.parse(config.blacklistedSymbols) : null,
  };
}

/**
 * Update bot config in database
 */
async function updateConfig(userId: string, updates: Partial<BotConfigSettings>): Promise<void> {
  const config = await db.botConfig.findFirst({
    where: { userId },
  });

  if (config) {
    await db.botConfig.update({
      where: { id: config.id },
      data: {
        ...updates,
        allowedSymbols: updates.allowedSymbols ? JSON.stringify(updates.allowedSymbols) : undefined,
        blacklistedSymbols: updates.blacklistedSymbols ? JSON.stringify(updates.blacklistedSymbols) : undefined,
      },
    });
  } else {
    await db.botConfig.create({
      data: {
        userId,
        name: "Default Bot Config",
        isActive: true,
        ...updates,
        allowedSymbols: updates.allowedSymbols ? JSON.stringify(updates.allowedSymbols) : undefined,
        blacklistedSymbols: updates.blacklistedSymbols ? JSON.stringify(updates.blacklistedSymbols) : undefined,
      },
    });
  }
}

// ==================== COMMAND HANDLERS ====================

/**
 * /firstentry [on|off] [mode] [cap%]
 * Configure First Entry as Market
 * 
 * Examples:
 * /firstentry on IMMEDIATE 2.5
 * /firstentry on WAIT_ENTRY 1
 * /firstentry off
 */
export async function handleFirstEntryCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      // Show current status
      const status = config.firstEntryAsMarket ? "✅ ON" : "❌ OFF";
      return {
        success: true,
        message: `📍 *First Entry as Market*\n\n` +
          `Status: ${status}\n` +
          `Mode: \`${config.firstEntryMode}\`\n` +
          `Max Price Cap: \`${config.firstEntryMaxPriceCap}%\`\n\n` +
          `Usage: \`/firstentry [on|off] [IMMEDIATE|WAIT_ENTRY] [cap%]\``,
        config: { firstEntryAsMarket: config.firstEntryAsMarket },
      };
    }

    const updates: Partial<BotConfigSettings> = {};

    // Parse enabled
    if (args[0].toLowerCase() === 'on') {
      updates.firstEntryAsMarket = true;
    } else if (args[0].toLowerCase() === 'off') {
      updates.firstEntryAsMarket = false;
    } else {
      return {
        success: false,
        message: "❌ Invalid argument. Use `on` or `off`.",
        error: "INVALID_ARGUMENT",
      };
    }

    // Parse mode
    if (args[1]) {
      const mode = args[1].toUpperCase();
      if (mode === 'IMMEDIATE' || mode === 'WAIT_ENTRY') {
        updates.firstEntryMode = mode;
      } else {
        return {
          success: false,
          message: "❌ Invalid mode. Use `IMMEDIATE` or `WAIT_ENTRY`.",
          error: "INVALID_MODE",
        };
      }
    }

    // Parse cap percent
    if (args[2]) {
      const cap = parseFloat(args[2]);
      if (isNaN(cap) || cap < 0.05 || cap > 20) {
        return {
          success: false,
          message: "❌ Invalid cap. Must be between 0.05% and 20%.",
          error: "INVALID_CAP",
        };
      }
      updates.firstEntryMaxPriceCap = cap;
    }

    await updateConfig(userId, updates);

    const statusText = updates.firstEntryAsMarket ? "✅ Enabled" : "❌ Disabled";
    const modeText = updates.firstEntryMode ? `\nMode: \`${updates.firstEntryMode}\`` : '';
    const capText = updates.firstEntryMaxPriceCap ? `\nCap: \`${updates.firstEntryMaxPriceCap}%\`` : '';

    return {
      success: true,
      message: `📍 *First Entry as Market*\n\n${statusText}${modeText}${capText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[TelegramBot] First entry command error:", error);
    return {
      success: false,
      message: "❌ Failed to update First Entry settings.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /tpgrace [on|off] [cap%] [retries]
 * Configure TP Grace
 * 
 * Examples:
 * /tpgrace on 0.5 5
 * /tpgrace off
 */
export async function handleTPGraceCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const status = config.tpGraceEnabled ? "✅ ON" : "❌ OFF";
      return {
        success: true,
        message: `🎯 *TP Grace*\n\n` +
          `Status: ${status}\n` +
          `Cap Percent: \`${config.tpGraceCapPercent}%\`\n` +
          `Max Retries: \`${config.tpGraceMaxRetries}\`\n\n` +
          `Usage: \`/tpgrace [on|off] [cap%] [retries]\``,
        config: { tpGraceEnabled: config.tpGraceEnabled },
      };
    }

    const updates: Partial<BotConfigSettings> = {};

    if (args[0].toLowerCase() === 'on') {
      updates.tpGraceEnabled = true;
    } else if (args[0].toLowerCase() === 'off') {
      updates.tpGraceEnabled = false;
    } else {
      return {
        success: false,
        message: "❌ Invalid argument. Use `on` or `off`.",
        error: "INVALID_ARGUMENT",
      };
    }

    if (args[1]) {
      const cap = parseFloat(args[1]);
      if (isNaN(cap) || cap < 0.01 || cap > 2) {
        return {
          success: false,
          message: "❌ Invalid cap. Must be between 0.01% and 2%.",
          error: "INVALID_CAP",
        };
      }
      updates.tpGraceCapPercent = cap;
    }

    if (args[2]) {
      const retries = parseInt(args[2], 10);
      if (isNaN(retries) || retries < 1 || retries > 10) {
        return {
          success: false,
          message: "❌ Invalid retries. Must be between 1 and 10.",
          error: "INVALID_RETRIES",
        };
      }
      updates.tpGraceMaxRetries = retries;
    }

    await updateConfig(userId, updates);

    const statusText = updates.tpGraceEnabled ? "✅ Enabled" : "❌ Disabled";
    const capText = updates.tpGraceCapPercent ? `\nCap: \`${updates.tpGraceCapPercent}%\`` : '';
    const retriesText = updates.tpGraceMaxRetries ? `\nMax Retries: \`${updates.tpGraceMaxRetries}\`` : '';

    return {
      success: true,
      message: `🎯 *TP Grace*\n\n${statusText}${capText}${retriesText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[TelegramBot] TP Grace command error:", error);
    return {
      success: false,
      message: "❌ Failed to update TP Grace settings.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /trailing [type] [value]
 * Configure Trailing Stop
 * 
 * Types: breakeven, moving, percent
 * 
 * Examples:
 * /trailing breakeven
 * /trailing moving 2
 * /trailing percent 5
 * /trailing off
 */
export async function handleTrailingCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const status = config.trailingEnabled ? "✅ ON" : "❌ OFF";
      return {
        success: true,
        message: `📈 *Trailing Stop*\n\n` +
          `Status: ${status}\n` +
          `Type: \`${config.trailingType || 'Not set'}\`\n` +
          `Value: \`${config.trailingValue || 'Not set'}\`\n\n` +
          `Usage:\n` +
          `• \`/trailing breakeven\`\n` +
          `• \`/trailing moving [trigger%]\`\n` +
          `• \`/trailing percent [stop%]\`\n` +
          `• \`/trailing off\``,
        config: { trailingEnabled: config.trailingEnabled },
      };
    }

    const updates: Partial<BotConfigSettings> = {};
    const type = args[0].toLowerCase();

    if (type === 'off') {
      updates.trailingEnabled = false;
      updates.trailingType = null;
      updates.trailingValue = null;
    } else if (type === 'breakeven') {
      updates.trailingEnabled = true;
      updates.trailingType = 'BREAKEVEN';
      updates.trailingValue = 0;
    } else if (type === 'moving' || type === 'moving_target') {
      updates.trailingEnabled = true;
      updates.trailingType = 'MOVING_TARGET';
      
      if (args[1]) {
        const value = parseFloat(args[1]);
        if (isNaN(value) || value < 0.1 || value > 50) {
          return {
            success: false,
            message: "❌ Invalid trigger value. Must be between 0.1% and 50%.",
            error: "INVALID_VALUE",
          };
        }
        updates.trailingValue = value;
      }
    } else if (type === 'percent') {
      updates.trailingEnabled = true;
      updates.trailingType = 'PERCENT_BELOW_HIGHEST';
      
      if (args[1]) {
        const value = parseFloat(args[1]);
        if (isNaN(value) || value < 0.1 || value > 50) {
          return {
            success: false,
            message: "❌ Invalid stop percent. Must be between 0.1% and 50%.",
            error: "INVALID_VALUE",
          };
        }
        updates.trailingValue = value;
      } else {
        return {
          success: false,
          message: "❌ Percent type requires a value. Usage: `/trailing percent [stop%]`",
          error: "MISSING_VALUE",
        };
      }
    } else {
      return {
        success: false,
        message: "❌ Invalid type. Use `breakeven`, `moving`, `percent`, or `off`.",
        error: "INVALID_TYPE",
      };
    }

    await updateConfig(userId, updates);

    const statusText = updates.trailingEnabled ? "✅ Enabled" : "❌ Disabled";
    const typeText = updates.trailingType ? `\nType: \`${updates.trailingType}\`` : '';
    const valueText = updates.trailingValue !== undefined && updates.trailingValue !== null ? 
      `\nValue: \`${updates.trailingValue}%\`` : '';

    return {
      success: true,
      message: `📈 *Trailing Stop*\n\n${statusText}${typeText}${valueText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[TelegramBot] Trailing command error:", error);
    return {
      success: false,
      message: "❌ Failed to update Trailing Stop settings.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /trailingentry [on|off] [%]
 * Configure Trailing Entry
 * 
 * Examples:
 * /trailingentry on 1.5
 * /trailingentry off
 */
export async function handleTrailingEntryCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const status = config.trailingEntryEnabled ? "✅ ON" : "❌ OFF";
      return {
        success: true,
        message: `📍 *Trailing Entry*\n\n` +
          `Status: ${status}\n` +
          `Trail Percent: \`${config.trailingEntryPercent}%\`\n\n` +
          `Usage: \`/trailingentry [on|off] [%]\``,
        config: { trailingEntryEnabled: config.trailingEntryEnabled },
      };
    }

    const updates: Partial<BotConfigSettings> = {};

    if (args[0].toLowerCase() === 'on') {
      updates.trailingEntryEnabled = true;
    } else if (args[0].toLowerCase() === 'off') {
      updates.trailingEntryEnabled = false;
    } else {
      return {
        success: false,
        message: "❌ Invalid argument. Use `on` or `off`.",
        error: "INVALID_ARGUMENT",
      };
    }

    if (args[1]) {
      const percent = parseFloat(args[1]);
      if (isNaN(percent) || percent < 0.01 || percent > 10) {
        return {
          success: false,
          message: "❌ Invalid percent. Must be between 0.01% and 10%.",
          error: "INVALID_PERCENT",
        };
      }
      updates.trailingEntryPercent = percent;
    }

    await updateConfig(userId, updates);

    const statusText = updates.trailingEntryEnabled ? "✅ Enabled" : "❌ Disabled";
    const percentText = updates.trailingEntryPercent ? `\nTrail: \`${updates.trailingEntryPercent}%\`` : '';

    return {
      success: true,
      message: `📍 *Trailing Entry*\n\n${statusText}${percentText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[TelegramBot] Trailing Entry command error:", error);
    return {
      success: false,
      message: "❌ Failed to update Trailing Entry settings.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /trailingtp [on|off] [%]
 * Configure Trailing Take Profit
 * 
 * Examples:
 * /trailingtp on 2
 * /trailingtp off
 */
export async function handleTrailingTPCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const status = config.tpTrailingEnabled ? "✅ ON" : "❌ OFF";
      return {
        success: true,
        message: `🎯 *Trailing TP*\n\n` +
          `Status: ${status}\n` +
          `Trail Percent: \`${config.tpTrailingPercent}%\`\n\n` +
          `Usage: \`/trailingtp [on|off] [%]\``,
        config: { tpTrailingEnabled: config.tpTrailingEnabled },
      };
    }

    const updates: Partial<BotConfigSettings> = {};

    if (args[0].toLowerCase() === 'on') {
      updates.tpTrailingEnabled = true;
    } else if (args[0].toLowerCase() === 'off') {
      updates.tpTrailingEnabled = false;
    } else {
      return {
        success: false,
        message: "❌ Invalid argument. Use `on` or `off`.",
        error: "INVALID_ARGUMENT",
      };
    }

    if (args[1]) {
      const percent = parseFloat(args[1]);
      if (isNaN(percent) || percent < 0.01 || percent > 10) {
        return {
          success: false,
          message: "❌ Invalid percent. Must be between 0.01% and 10%.",
          error: "INVALID_PERCENT",
        };
      }
      updates.tpTrailingPercent = percent;
    }

    await updateConfig(userId, updates);

    const statusText = updates.tpTrailingEnabled ? "✅ Enabled" : "❌ Disabled";
    const percentText = updates.tpTrailingPercent ? `\nTrail: \`${updates.tpTrailingPercent}%\`` : '';

    return {
      success: true,
      message: `🎯 *Trailing TP*\n\n${statusText}${percentText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[TelegramBot] Trailing TP command error:", error);
    return {
      success: false,
      message: "❌ Failed to update Trailing TP settings.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /entrystrategy [strategy]
 * Set entry strategy
 * 
 * Strategies: evenly, one, two, three, fifty, decreasing, increasing, skip
 * 
 * Examples:
 * /entrystrategy evenly
 * /entrystrategy two
 */
export async function handleEntryStrategyCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      return {
        success: true,
        message: `📍 *Entry Strategy*\n\n` +
          `Current: \`${config.entryStrategy}\`\n\n` +
          `Available strategies:\n` +
          `• \`evenly\` - Evenly Divided\n` +
          `• \`one\` - One Target\n` +
          `• \`two\` - Two Targets\n` +
          `• \`three\` - Three Targets\n` +
          `• \`fifty\` - Fifty On First\n` +
          `• \`decreasing\` - Decreasing Exponential\n` +
          `• \`increasing\` - Increasing Exponential\n` +
          `• \`skip\` - Skip First\n\n` +
          `Usage: \`/entrystrategy [strategy]\``,
        config: { entryStrategy: config.entryStrategy },
      };
    }

    const strategyMap: Record<string, BotConfigSettings['entryStrategy']> = {
      'evenly': 'EVENLY_DIVIDED',
      'one': 'ONE_TARGET',
      'two': 'TWO_TARGETS',
      'three': 'THREE_TARGETS',
      'fifty': 'FIFTY_ON_FIRST',
      'decreasing': 'DECREASING_EXP',
      'increasing': 'INCREASING_EXP',
      'skip': 'SKIP_FIRST',
      'custom': 'CUSTOM_RATIOS',
    };

    const strategy = args[0].toLowerCase();
    const mappedStrategy = strategyMap[strategy];

    if (!mappedStrategy) {
      return {
        success: false,
        message: "❌ Invalid strategy. Use: evenly, one, two, three, fifty, decreasing, increasing, or skip.",
        error: "INVALID_STRATEGY",
      };
    }

    await updateConfig(userId, { entryStrategy: mappedStrategy });

    return {
      success: true,
      message: `📍 *Entry Strategy*\n\nSet to: \`${mappedStrategy}\``,
      config: { entryStrategy: mappedStrategy },
    };
  } catch (error) {
    console.error("[TelegramBot] Entry Strategy command error:", error);
    return {
      success: false,
      message: "❌ Failed to update Entry Strategy.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /tpstrategy [strategy]
 * Set TP strategy
 * 
 * Strategies: evenly, one, two, three, fifty, decreasing, increasing, skip
 */
export async function handleTPStrategyCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      return {
        success: true,
        message: `🎯 *TP Strategy*\n\n` +
          `Current: \`${config.tpStrategy}\`\n\n` +
          `Available strategies:\n` +
          `• \`evenly\` - Evenly Divided\n` +
          `• \`one\` - One Target\n` +
          `• \`two\` - Two Targets\n` +
          `• \`three\` - Three Targets\n` +
          `• \`fifty\` - Fifty On First\n` +
          `• \`decreasing\` - Decreasing Exponential\n` +
          `• \`increasing\` - Increasing Exponential\n` +
          `• \`skip\` - Skip First\n\n` +
          `Usage: \`/tpstrategy [strategy]\``,
        config: { tpStrategy: config.tpStrategy },
      };
    }

    const strategyMap: Record<string, BotConfigSettings['tpStrategy']> = {
      'evenly': 'EVENLY_DIVIDED',
      'one': 'ONE_TARGET',
      'two': 'TWO_TARGETS',
      'three': 'THREE_TARGETS',
      'fifty': 'FIFTY_ON_FIRST',
      'decreasing': 'DECREASING_EXP',
      'increasing': 'INCREASING_EXP',
      'skip': 'SKIP_FIRST',
      'custom': 'CUSTOM_RATIOS',
    };

    const strategy = args[0].toLowerCase();
    const mappedStrategy = strategyMap[strategy];

    if (!mappedStrategy) {
      return {
        success: false,
        message: "❌ Invalid strategy. Use: evenly, one, two, three, fifty, decreasing, increasing, or skip.",
        error: "INVALID_STRATEGY",
      };
    }

    await updateConfig(userId, { tpStrategy: mappedStrategy });

    return {
      success: true,
      message: `🎯 *TP Strategy*\n\nSet to: \`${mappedStrategy}\``,
      config: { tpStrategy: mappedStrategy },
    };
  } catch (error) {
    console.error("[TelegramBot] TP Strategy command error:", error);
    return {
      success: false,
      message: "❌ Failed to update TP Strategy.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /movingtp [on|off]
 * Toggle Moving TP
 */
export async function handleMovingTPCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const status = config.movingTPEnabled ? "✅ ON" : "❌ OFF";
      return {
        success: true,
        message: `🎯 *Moving TP*\n\nStatus: ${status}\n\nUsage: \`/movingtp [on|off]\``,
        config: { movingTPEnabled: config.movingTPEnabled },
      };
    }

    const updates: Partial<BotConfigSettings> = {};

    if (args[0].toLowerCase() === 'on') {
      updates.movingTPEnabled = true;
    } else if (args[0].toLowerCase() === 'off') {
      updates.movingTPEnabled = false;
    } else {
      return {
        success: false,
        message: "❌ Invalid argument. Use `on` or `off`.",
        error: "INVALID_ARGUMENT",
      };
    }

    await updateConfig(userId, updates);

    const statusText = updates.movingTPEnabled ? "✅ Enabled" : "❌ Disabled";

    return {
      success: true,
      message: `🎯 *Moving TP*\n\n${statusText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[TelegramBot] Moving TP command error:", error);
    return {
      success: false,
      message: "❌ Failed to update Moving TP settings.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /sl [value] [baseline]
 * Configure Stop Loss
 * 
 * Examples:
 * /sl 15
 * /sl 10 AVERAGE_ENTRIES
 * /sl 5 FIRST_ENTRY
 * /sl off
 */
export async function handleSLCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const status = config.defaultStopLoss ? `\`${config.defaultStopLoss}%\`` : "Not set";
      return {
        success: true,
        message: `🛑 *Stop Loss*\n\n` +
          `Current: ${status}\n` +
          `Baseline: \`${config.slBaseline}\`\n\n` +
          `Usage:\n` +
          `• \`/sl [percent]\`\n` +
          `• \`/sl [percent] AVERAGE_ENTRIES\`\n` +
          `• \`/sl [percent] FIRST_ENTRY\`\n` +
          `• \`/sl off\``,
        config: { defaultStopLoss: config.defaultStopLoss },
      };
    }

    const updates: Partial<BotConfigSettings> = {};

    if (args[0].toLowerCase() === 'off') {
      updates.defaultStopLoss = null;
    } else {
      const sl = parseFloat(args[0]);
      if (isNaN(sl) || sl < 0.1 || sl > 100) {
        return {
          success: false,
          message: "❌ Invalid SL value. Must be between 0.1% and 100%.",
          error: "INVALID_VALUE",
        };
      }
      updates.defaultStopLoss = sl;
    }

    if (args[1]) {
      const baseline = args[1].toUpperCase();
      if (baseline === 'AVERAGE_ENTRIES' || baseline === 'FIRST_ENTRY') {
        updates.slBaseline = baseline;
      } else {
        return {
          success: false,
          message: "❌ Invalid baseline. Use `AVERAGE_ENTRIES` or `FIRST_ENTRY`.",
          error: "INVALID_BASELINE",
        };
      }
    }

    await updateConfig(userId, updates);

    const slText = updates.defaultStopLoss !== null ? 
      `Set to: \`${updates.defaultStopLoss}%\`` : 
      "❌ Disabled";
    const baselineText = updates.slBaseline ? `\nBaseline: \`${updates.slBaseline}\`` : '';

    return {
      success: true,
      message: `🛑 *Stop Loss*\n\n${slText}${baselineText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[TelegramBot] SL command error:", error);
    return {
      success: false,
      message: "❌ Failed to update Stop Loss settings.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /leverage [value] [mode]
 * Configure Leverage
 * 
 * Examples:
 * /leverage 20
 * /leverage 50 EXACTLY
 * /leverage 100 UP_TO
 */
export async function handleLeverageCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      return {
        success: true,
        message: `⚡ *Leverage*\n\n` +
          `Current: \`${config.leverage}x\`\n` +
          `Mode: \`${config.leverageMode}\`\n\n` +
          `Usage:\n` +
          `• \`/leverage [value]\`\n` +
          `• \`/leverage [value] EXACTLY\`\n` +
          `• \`/leverage [value] UP_TO\``,
        config: { leverage: config.leverage },
      };
    }

    const updates: Partial<BotConfigSettings> = {};

    const leverage = parseInt(args[0], 10);
    if (isNaN(leverage) || leverage < 1 || leverage > 125) {
      return {
        success: false,
        message: "❌ Invalid leverage. Must be between 1 and 125.",
        error: "INVALID_VALUE",
      };
    }
    updates.leverage = leverage;

    if (args[1]) {
      const mode = args[1].toUpperCase();
      if (mode === 'EXACTLY' || mode === 'UP_TO') {
        updates.leverageMode = mode;
      } else {
        return {
          success: false,
          message: "❌ Invalid mode. Use `EXACTLY` or `UP_TO`.",
          error: "INVALID_MODE",
        };
      }
    }

    await updateConfig(userId, updates);

    const modeText = updates.leverageMode ? `\nMode: \`${updates.leverageMode}\`` : '';

    return {
      success: true,
      message: `⚡ *Leverage*\n\nSet to: \`${updates.leverage}x\`${modeText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[TelegramBot] Leverage command error:", error);
    return {
      success: false,
      message: "❌ Failed to update Leverage settings.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /direction [long|short|both]
 * Set direction filter
 */
export async function handleDirectionCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      return {
        success: true,
        message: `📍 *Direction Filter*\n\nCurrent: \`${config.directionFilter}\`\n\nUsage: \`/direction [long|short|both]\``,
        config: { directionFilter: config.directionFilter },
      };
    }

    const direction = args[0].toUpperCase();
    if (direction !== 'LONG' && direction !== 'SHORT' && direction !== 'BOTH') {
      return {
        success: false,
        message: "❌ Invalid direction. Use `long`, `short`, or `both`.",
        error: "INVALID_DIRECTION",
      };
    }

    await updateConfig(userId, { directionFilter: direction });

    return {
      success: true,
      message: `📍 *Direction Filter*\n\nSet to: \`${direction}\``,
      config: { directionFilter: direction },
    };
  } catch (error) {
    console.error("[TelegramBot] Direction command error:", error);
    return {
      success: false,
      message: "❌ Failed to update Direction Filter.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /autoclose [on|off]
 * Toggle Close on TP/SL Before Entry
 */
export async function handleAutoCloseCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const status = config.closeOnTPSLBeforeEntry ? "✅ ON" : "❌ OFF";
      return {
        success: true,
        message: `🔄 *Auto-Close on TP/SL Before Entry*\n\nStatus: ${status}\n\nUsage: \`/autoclose [on|off]\``,
        config: { closeOnTPSLBeforeEntry: config.closeOnTPSLBeforeEntry },
      };
    }

    const updates: Partial<BotConfigSettings> = {};

    if (args[0].toLowerCase() === 'on') {
      updates.closeOnTPSLBeforeEntry = true;
    } else if (args[0].toLowerCase() === 'off') {
      updates.closeOnTPSLBeforeEntry = false;
    } else {
      return {
        success: false,
        message: "❌ Invalid argument. Use `on` or `off`.",
        error: "INVALID_ARGUMENT",
      };
    }

    await updateConfig(userId, updates);

    const statusText = updates.closeOnTPSLBeforeEntry ? "✅ Enabled" : "❌ Disabled";

    return {
      success: true,
      message: `🔄 *Auto-Close on TP/SL Before Entry*\n\n${statusText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[TelegramBot] Auto-Close command error:", error);
    return {
      success: false,
      message: "❌ Failed to update Auto-Close settings.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /grace [%]
 * Set First Entry Grace
 */
export async function handleGraceCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const status = config.firstEntryGracePercent > 0 ? `\`${config.firstEntryGracePercent}%\`` : "Disabled (0%)";
      return {
        success: true,
        message: `📍 *First Entry Grace*\n\nCurrent: ${status}\n\nUsage: \`/grace [%]\` (0-5%)`,
        config: { firstEntryGracePercent: config.firstEntryGracePercent },
      };
    }

    const percent = parseFloat(args[0]);
    if (isNaN(percent) || percent < 0 || percent > 5) {
      return {
        success: false,
        message: "❌ Invalid percent. Must be between 0% and 5%.",
        error: "INVALID_PERCENT",
      };
    }

    await updateConfig(userId, { firstEntryGracePercent: percent });

    const statusText = percent > 0 ? `Set to: \`${percent}%\`` : "❌ Disabled";

    return {
      success: true,
      message: `📍 *First Entry Grace*\n\n${statusText}`,
      config: { firstEntryGracePercent: percent },
    };
  } catch (error) {
    console.error("[TelegramBot] Grace command error:", error);
    return {
      success: false,
      message: "❌ Failed to update First Entry Grace.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /autoexec [on|off]
 * Toggle Auto-Execute
 */
export async function handleAutoExecCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const status = config.autoExecuteEnabled ? "✅ ON" : "❌ OFF";
      return {
        success: true,
        message: `⚡ *Auto-Execute*\n\nStatus: ${status}\n\nUsage: \`/autoexec [on|off]\``,
        config: { autoExecuteEnabled: config.autoExecuteEnabled },
      };
    }

    const updates: Partial<BotConfigSettings> = {};

    if (args[0].toLowerCase() === 'on') {
      updates.autoExecuteEnabled = true;
    } else if (args[0].toLowerCase() === 'off') {
      updates.autoExecuteEnabled = false;
    } else {
      return {
        success: false,
        message: "❌ Invalid argument. Use `on` or `off`.",
        error: "INVALID_ARGUMENT",
      };
    }

    await updateConfig(userId, updates);

    const statusText = updates.autoExecuteEnabled ? "✅ Enabled" : "❌ Disabled";

    return {
      success: true,
      message: `⚡ *Auto-Execute*\n\n${statusText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[TelegramBot] Auto-Execute command error:", error);
    return {
      success: false,
      message: "❌ Failed to update Auto-Execute settings.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /filters [options]
 * Configure Signal Filters
 * 
 * Options:
 * - nosl on|off - Ignore signals without SL
 * - notp on|off - Ignore signals without TP
 * - minrr [value] - Minimum R:R ratio
 * - allow [symbols] - Allowed symbols (comma-separated)
 * - block [symbols] - Blacklisted symbols (comma-separated)
 */
export async function handleFiltersCommand(
  userId: string,
  args: string[]
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const allowedSymbolsText = config.allowedSymbols?.length ? 
        config.allowedSymbols.join(', ') : 'All';
      const blacklistedSymbolsText = config.blacklistedSymbols?.length ? 
        config.blacklistedSymbols.join(', ') : 'None';

      return {
        success: true,
        message: `🔍 *Signal Filters*\n\n` +
          `Ignore No SL: ${config.ignoreSignalsWithoutSL ? '✅' : '❌'}\n` +
          `Ignore No TP: ${config.ignoreSignalsWithoutTP ? '✅' : '❌'}\n` +
          `Min R:R: ${config.minRiskRewardRatio || 'Not set'}\n` +
          `Allowed Symbols: \`${allowedSymbolsText}\`\n` +
          `Blacklisted: \`${blacklistedSymbolsText}\`\n\n` +
          `Usage:\n` +
          `• \`/filters nosl on|off\`\n` +
          `• \`/filters notp on|off\`\n` +
          `• \`/filters minrr [value]\`\n` +
          `• \`/filters allow BTC,ETH,SOL\`\n` +
          `• \`/filters block DOGE,SHIB\``,
        config: { 
          ignoreSignalsWithoutSL: config.ignoreSignalsWithoutSL,
          ignoreSignalsWithoutTP: config.ignoreSignalsWithoutTP,
        },
      };
    }

    const updates: Partial<BotConfigSettings> = {};
    const option = args[0].toLowerCase();

    switch (option) {
      case 'nosl':
        updates.ignoreSignalsWithoutSL = args[1]?.toLowerCase() === 'on';
        break;

      case 'notp':
        updates.ignoreSignalsWithoutTP = args[1]?.toLowerCase() === 'on';
        break;

      case 'minrr':
        const minRR = parseFloat(args[1]);
        if (isNaN(minRR) || minRR < 0.5 || minRR > 10) {
          return {
            success: false,
            message: "❌ Invalid R:R value. Must be between 0.5 and 10.",
            error: "INVALID_VALUE",
          };
        }
        updates.minRiskRewardRatio = minRR;
        break;

      case 'allow':
        if (args[1]) {
          updates.allowedSymbols = args[1].toUpperCase().split(',').map(s => s.trim() + 'USDT');
        } else {
          updates.allowedSymbols = null;
        }
        break;

      case 'block':
        if (args[1]) {
          updates.blacklistedSymbols = args[1].toUpperCase().split(',').map(s => s.trim() + 'USDT');
        } else {
          updates.blacklistedSymbols = null;
        }
        break;

      default:
        return {
          success: false,
          message: "❌ Invalid option. Use: nosl, notp, minrr, allow, or block.",
          error: "INVALID_OPTION",
        };
    }

    await updateConfig(userId, updates);

    const optionText = Object.entries(updates)
      .map(([key, value]) => `${key}: \`${JSON.stringify(value)}\``)
      .join('\n');

    return {
      success: true,
      message: `🔍 *Signal Filters*\n\nUpdated:\n${optionText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[TelegramBot] Filters command error:", error);
    return {
      success: false,
      message: "❌ Failed to update Signal Filters.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /status
 * Show current configuration
 */
export async function handleStatusCommandConfig(
  userId: string
): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    const formatBool = (value: boolean) => value ? '✅' : '❌';
    const formatNull = (value: number | null) => value !== null ? `\`${value}\`` : 'Not set';

    return {
      success: true,
      message: `📊 *Bot Configuration Status*\n\n` +
        `📍 *First Entry as Market*\n` +
        `  Enabled: ${formatBool(config.firstEntryAsMarket)}\n` +
        `  Mode: \`${config.firstEntryMode}\`\n` +
        `  Cap: \`${config.firstEntryMaxPriceCap}%\`\n\n` +
        `🎯 *TP Grace*\n` +
        `  Enabled: ${formatBool(config.tpGraceEnabled)}\n` +
        `  Cap: \`${config.tpGraceCapPercent}%\`\n` +
        `  Retries: \`${config.tpGraceMaxRetries}\`\n\n` +
        `📈 *Trailing Stop*\n` +
        `  Enabled: ${formatBool(config.trailingEnabled)}\n` +
        `  Type: \`${config.trailingType || 'Off'}\`\n` +
        `  Value: \`${config.trailingValue || 'N/A'}\`\n\n` +
        `📍 *Trailing Entry/TP*\n` +
        `  Trailing Entry: ${formatBool(config.trailingEntryEnabled)} (\`${config.trailingEntryPercent}%\`)\n` +
        `  Trailing TP: ${formatBool(config.tpTrailingEnabled)} (\`${config.tpTrailingPercent}%\`)\n\n` +
        `📊 *Strategies*\n` +
        `  Entry: \`${config.entryStrategy}\`\n` +
        `  TP: \`${config.tpStrategy}\`\n` +
        `  Moving TP: ${formatBool(config.movingTPEnabled)}\n\n` +
        `🛑 *Risk Management*\n` +
        `  Stop Loss: ${formatNull(config.defaultStopLoss)}\n` +
        `  SL Baseline: \`${config.slBaseline}\`\n` +
        `  Leverage: \`${config.leverage}x\` (${config.leverageMode})\n` +
        `  Direction: \`${config.directionFilter}\`\n\n` +
        `⚡ *Auto Settings*\n` +
        `  Auto-Close: ${formatBool(config.closeOnTPSLBeforeEntry)}\n` +
        `  First Entry Grace: \`${config.firstEntryGracePercent}%\`\n` +
        `  Auto-Execute: ${formatBool(config.autoExecuteEnabled)}\n\n` +
        `🔍 *Filters*\n` +
        `  Ignore No SL: ${formatBool(config.ignoreSignalsWithoutSL)}\n` +
        `  Ignore No TP: ${formatBool(config.ignoreSignalsWithoutTP)}\n` +
        `  Min R:R: ${formatNull(config.minRiskRewardRatio)}`,
      config: config,
    };
  } catch (error) {
    console.error("[TelegramBot] Status command error:", error);
    return {
      success: false,
      message: "❌ Failed to get configuration status.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /reset
 * Reset to defaults
 */
export async function handleResetCommandConfig(
  userId: string
): Promise<CommandResult> {
  try {
    const defaultConfig: Partial<BotConfigSettings> = {
      // First Entry as Market
      firstEntryMode: 'WAIT_ENTRY',
      firstEntryMaxPriceCap: 1.0,
      firstEntryAsMarket: false,
      firstEntryOnlyIfNotDefinedByGroup: false,

      // TP Grace
      tpGraceEnabled: false,
      tpGraceCapPercent: 0.5,
      tpGraceMaxRetries: 3,
      tpGraceOnlyIfNotDefinedByGroup: false,

      // Trailing Stop
      trailingEnabled: false,
      trailingType: null,
      trailingValue: null,
      trailingOnlyIfNotDefinedByGroup: false,

      // Trailing Entry
      trailingEntryEnabled: false,
      trailingEntryPercent: 1.0,
      trailingEntryOnlyIfNotDefinedByGroup: false,

      // Trailing TP
      tpTrailingEnabled: false,
      tpTrailingPercent: 1.0,
      tpTrailingOnlyIfNotDefinedByGroup: false,

      // Entry Strategy
      entryStrategy: 'EVENLY_DIVIDED',
      entryZoneTargets: 4,
      entryOnlyIfNotDefinedByGroup: false,

      // TP Strategy
      tpStrategy: 'EVENLY_DIVIDED',
      tpOnlyIfNotDefinedByGroup: false,

      // Moving TP
      movingTPEnabled: false,

      // Stop Loss
      defaultStopLoss: null,
      slBaseline: 'AVERAGE_ENTRIES',
      slOnlyIfNotDefinedByGroup: false,

      // Leverage
      leverage: 10,
      leverageMode: 'EXACTLY',
      leverageOnlyIfNotDefinedByGroup: false,

      // Direction
      directionFilter: 'BOTH',

      // Auto-Close
      closeOnTPSLBeforeEntry: true,
      closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup: false,

      // First Entry Grace
      firstEntryGracePercent: 0,

      // Auto-Execute
      autoExecuteEnabled: false,

      // Filters
      ignoreSignalsWithoutSL: false,
      ignoreSignalsWithoutTP: false,
      minRiskRewardRatio: null,
      allowedSymbols: null,
      blacklistedSymbols: null,
    };

    await updateConfig(userId, defaultConfig);

    return {
      success: true,
      message: `🔄 *Configuration Reset*\n\nAll settings restored to defaults.`,
      config: defaultConfig,
    };
  } catch (error) {
    console.error("[TelegramBot] Reset command error:", error);
    return {
      success: false,
      message: "❌ Failed to reset configuration.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

/**
 * /help
 * Show all commands
 */
export function handleHelpCommandConfig(): string {
  return `📚 *Cornix Auto-Trading Commands*\n
📍 *Entry Settings*
\`/firstentry [on|off] [mode] [cap%]\` - First Entry as Market
\`/trailingentry [on|off] [%]\` - Trailing Entry
\`/entrystrategy [strategy]\` - Entry strategy
\`/grace [%]\` - First Entry Grace

🎯 *Take Profit Settings*
\`/tpgrace [on|off] [cap%] [retries]\` - TP Grace
\`/trailingtp [on|off] [%]\` - Trailing TP
\`/tpstrategy [strategy]\` - TP strategy
\`/movingtp [on|off]\` - Moving TP

📈 *Trailing Stop*
\`/trailing [type] [value]\` - Configure trailing
  • \`breakeven\` - Move SL to entry
  • \`moving\` - Trail behind price
  • \`percent\` - % below highest

🛑 *Risk Management*
\`/sl [value] [baseline]\` - Stop Loss
\`/leverage [value] [mode]\` - Leverage
\`/direction [long|short|both]\` - Direction filter

⚡ *Automation*
\`/autoclose [on|off]\` - Close on TP/SL Before Entry
\`/autoexec [on|off]\` - Auto-execute signals
\`/filters [options]\` - Signal filters

📊 *Information*
\`/status\` - Show current config
\`/reset\` - Reset to defaults
\`/help\` - Show this message

🔧 *Strategies*
\`evenly\` \`one\` \`two\` \`three\` \`fifty\` \`decreasing\` \`increasing\` \`skip\``;
}

// ==================== INDEX EXPORT ====================

export const configCommands = {
  firstentry: handleFirstEntryCommand,
  tpgrace: handleTPGraceCommand,
  trailing: handleTrailingCommand,
  trailingentry: handleTrailingEntryCommand,
  trailingtp: handleTrailingTPCommand,
  entrystrategy: handleEntryStrategyCommand,
  tpstrategy: handleTPStrategyCommand,
  movingtp: handleMovingTPCommand,
  sl: handleSLCommand,
  leverage: handleLeverageCommand,
  direction: handleDirectionCommand,
  autoclose: handleAutoCloseCommand,
  grace: handleGraceCommand,
  autoexec: handleAutoExecCommand,
  filters: handleFiltersCommand,
  status: handleStatusCommandConfig,
  reset: handleResetCommandConfig,
  help: handleHelpCommandConfig,
};
