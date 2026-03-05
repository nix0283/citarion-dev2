import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDefaultUserId } from "@/lib/default-user";
import type { BotConfigSettings, CommandResult } from "@/lib/telegram/types";

// ==================== HELPER FUNCTIONS ====================

async function getOrCreateConfig(userId: string): Promise<BotConfigSettings> {
  let config = await db.botConfig.findFirst({
    where: { userId },
  });

  if (!config) {
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

function mapConfigToSettings(config: Record<string, unknown>): BotConfigSettings {
  return {
    firstEntryMode: (config.firstEntryMode as BotConfigSettings['firstEntryMode']) || 'WAIT_ENTRY',
    firstEntryMaxPriceCap: (config.firstEntryMaxPriceCap as number) ?? 1.0,
    firstEntryAsMarket: (config.firstEntryAsMarket as boolean) ?? false,
    firstEntryOnlyIfNotDefinedByGroup: (config.firstEntryOnlyIfNotDefinedByGroup as boolean) ?? false,

    tpGraceEnabled: (config.tpGraceEnabled as boolean) ?? false,
    tpGraceCapPercent: (config.tpGraceCapPercent as number) ?? 0.5,
    tpGraceMaxRetries: (config.tpGraceMaxRetries as number) ?? 3,
    tpGraceOnlyIfNotDefinedByGroup: (config.tpGraceOnlyIfNotDefinedByGroup as boolean) ?? false,

    trailingEnabled: (config.trailingEnabled as boolean) ?? false,
    trailingType: (config.trailingType as BotConfigSettings['trailingType']) || null,
    trailingValue: (config.trailingValue as number | null) ?? null,
    trailingOnlyIfNotDefinedByGroup: (config.trailingOnlyIfNotDefinedByGroup as boolean) ?? false,

    trailingEntryEnabled: (config.trailingEntryEnabled as boolean) ?? false,
    trailingEntryPercent: (config.trailingEntryPercent as number) ?? 1.0,
    trailingEntryOnlyIfNotDefinedByGroup: (config.trailingEntryOnlyIfNotDefinedByGroup as boolean) ?? false,

    tpTrailingEnabled: (config.tpTrailingEnabled as boolean) ?? false,
    tpTrailingPercent: (config.tpTrailingPercent as number) ?? 1.0,
    tpTrailingOnlyIfNotDefinedByGroup: (config.tpTrailingOnlyIfNotDefinedByGroup as boolean) ?? false,

    entryStrategy: (config.entryStrategy as BotConfigSettings['entryStrategy']) || 'EVENLY_DIVIDED',
    entryZoneTargets: (config.entryZoneTargets as number) ?? 4,
    entryOnlyIfNotDefinedByGroup: (config.entryOnlyIfNotDefinedByGroup as boolean) ?? false,

    tpStrategy: (config.tpStrategy as BotConfigSettings['tpStrategy']) || 'EVENLY_DIVIDED',
    tpOnlyIfNotDefinedByGroup: (config.tpOnlyIfNotDefinedByGroup as boolean) ?? false,

    movingTPEnabled: (config.movingTPEnabled as boolean) ?? false,

    defaultStopLoss: (config.defaultStopLoss as number | null) ?? null,
    slBaseline: (config.slBaseline as BotConfigSettings['slBaseline']) || 'AVERAGE_ENTRIES',
    slOnlyIfNotDefinedByGroup: (config.slOnlyIfNotDefinedByGroup as boolean) ?? false,

    leverage: (config.leverage as number) ?? 10,
    leverageMode: (config.leverageMode as BotConfigSettings['leverageMode']) || 'EXACTLY',
    leverageOnlyIfNotDefinedByGroup: (config.leverageOnlyIfNotDefinedByGroup as boolean) ?? false,

    directionFilter: (config.directionFilter as BotConfigSettings['directionFilter']) || 'BOTH',

    closeOnTPSLBeforeEntry: (config.closeOnTPSLBeforeEntry as boolean) ?? true,
    closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup: (config.closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup as boolean) ?? false,

    firstEntryGracePercent: (config.firstEntryGracePercent as number) ?? 0,

    autoExecuteEnabled: (config.autoExecuteEnabled as boolean) ?? false,

    ignoreSignalsWithoutSL: (config.ignoreSignalsWithoutSL as boolean) ?? false,
    ignoreSignalsWithoutTP: (config.ignoreSignalsWithoutTP as boolean) ?? false,
    minRiskRewardRatio: (config.minRiskRewardRatio as number | null) ?? null,
    allowedSymbols: config.allowedSymbols ? JSON.parse(config.allowedSymbols as string) : null,
    blacklistedSymbols: config.blacklistedSymbols ? JSON.parse(config.blacklistedSymbols as string) : null,
  };
}

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

async function handleFirstEntry(userId: string, args: string[]): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const status = config.firstEntryAsMarket ? "✅ ON" : "❌ OFF";
      return {
        success: true,
        message: `📍 *First Entry as Market*\n\n` +
          `Status: ${status}\n` +
          `Mode: \`${config.firstEntryMode}\`\n` +
          `Max Price Cap: \`${config.firstEntryMaxPriceCap}%\`\n\n` +
          `Usage: \`/firstentry [on|off] [IMMEDIATE|WAIT_ENTRY] [cap%]\`\n\n` +
          `• \`IMMEDIATE\` - Активировать сразу при открытии\n` +
          `• \`WAIT_ENTRY\` - Ждать достижения цены входа`,
        config: { firstEntryAsMarket: config.firstEntryAsMarket },
      };
    }

    const updates: Partial<BotConfigSettings> = {};

    if (args[0].toLowerCase() === 'on') {
      updates.firstEntryAsMarket = true;
    } else if (args[0].toLowerCase() === 'off') {
      updates.firstEntryAsMarket = false;
    } else {
      return {
        success: false,
        message: "❌ Неверный аргумент. Используйте `on` или `off`.",
        error: "INVALID_ARGUMENT",
      };
    }

    if (args[1]) {
      const mode = args[1].toUpperCase();
      if (mode === 'IMMEDIATE' || mode === 'WAIT_ENTRY') {
        updates.firstEntryMode = mode as 'IMMEDIATE' | 'WAIT_ENTRY';
      }
    }

    if (args[2]) {
      const cap = parseFloat(args[2]);
      if (!isNaN(cap) && cap >= 0.05 && cap <= 20) {
        updates.firstEntryMaxPriceCap = cap;
      }
    }

    await updateConfig(userId, updates);

    const statusText = updates.firstEntryAsMarket ? "✅ Включено" : "❌ Выключено";
    const modeText = updates.firstEntryMode ? `\nРежим: \`${updates.firstEntryMode}\`` : '';
    const capText = updates.firstEntryMaxPriceCap ? `\nCap: \`${updates.firstEntryMaxPriceCap}%\`` : '';

    return {
      success: true,
      message: `📍 *First Entry as Market*\n\n${statusText}${modeText}${capText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[CornixCommand] First entry error:", error);
    return {
      success: false,
      message: "❌ Ошибка обновления First Entry настроек.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

async function handleTPGrace(userId: string, args: string[]): Promise<CommandResult> {
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
          `Usage: \`/tpgrace [on|off] [cap%] [retries]\`\n\n` +
          `*Cornix спецификация:*\n` +
          `• LONG: последовательно ПОНИЖАЕТ TP\n` +
          `• SHORT: последовательно ПОВЫШАЕТ TP`,
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
        message: "❌ Неверный аргумент. Используйте `on` или `off`.",
        error: "INVALID_ARGUMENT",
      };
    }

    if (args[1]) {
      const cap = parseFloat(args[1]);
      if (!isNaN(cap) && cap >= 0.01 && cap <= 2) {
        updates.tpGraceCapPercent = cap;
      }
    }

    if (args[2]) {
      const retries = parseInt(args[2], 10);
      if (!isNaN(retries) && retries >= 1 && retries <= 10) {
        updates.tpGraceMaxRetries = retries;
      }
    }

    await updateConfig(userId, updates);

    const statusText = updates.tpGraceEnabled ? "✅ Включено" : "❌ Выключено";
    const capText = updates.tpGraceCapPercent ? `\nCap: \`${updates.tpGraceCapPercent}%\`` : '';
    const retriesText = updates.tpGraceMaxRetries ? `\nRetries: \`${updates.tpGraceMaxRetries}\`` : '';

    return {
      success: true,
      message: `🎯 *TP Grace*\n\n${statusText}${capText}${retriesText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[CornixCommand] TP Grace error:", error);
    return {
      success: false,
      message: "❌ Ошибка обновления TP Grace настроек.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

async function handleTrailing(userId: string, args: string[]): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const status = config.trailingEnabled ? "✅ ON" : "❌ OFF";
      return {
        success: true,
        message: `📈 *Trailing Stop (5 типов Cornix)*\n\n` +
          `Status: ${status}\n` +
          `Type: \`${config.trailingType || 'Не установлен'}\`\n` +
          `Value: \`${config.trailingValue || 'Не установлено'}\`\n\n` +
          `*Типы:*\n` +
          `• \`breakeven\` - SL на безубыток\n` +
          `• \`moving\` - За ценой после таргета\n` +
          `• \`moving2\` - После 2-го таргета\n` +
          `• \`percent\` - % от макс. цены\n` +
          `• \`triggers\` - % после триггеров\n\n` +
          `Usage:\n` +
          `• \`/trailing breakeven\`\n` +
          `• \`/trailing moving 2\`\n` +
          `• \`/trailing percent 5\`\n` +
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
    } else if (type === 'moving') {
      updates.trailingEnabled = true;
      updates.trailingType = 'MOVING_TARGET';
      if (args[1]) {
        const value = parseFloat(args[1]);
        if (!isNaN(value) && value >= 0.1 && value <= 50) {
          updates.trailingValue = value;
        }
      }
    } else if (type === 'moving2') {
      updates.trailingEnabled = true;
      updates.trailingType = 'MOVING_2_TARGET';
      if (args[1]) {
        const value = parseFloat(args[1]);
        if (!isNaN(value) && value >= 0.1 && value <= 50) {
          updates.trailingValue = value;
        }
      }
    } else if (type === 'percent') {
      updates.trailingEnabled = true;
      updates.trailingType = 'PERCENT_BELOW_HIGHEST';
      if (args[1]) {
        const value = parseFloat(args[1]);
        if (!isNaN(value) && value >= 0.1 && value <= 50) {
          updates.trailingValue = value;
        }
      } else {
        return {
          success: false,
          message: "❌ Percent тип требует значение. Usage: `/trailing percent [stop%]`",
          error: "MISSING_VALUE",
        };
      }
    } else if (type === 'triggers') {
      updates.trailingEnabled = true;
      updates.trailingType = 'PERCENT_BELOW_TRIGGERS';
      if (args[1]) {
        const value = parseFloat(args[1]);
        if (!isNaN(value) && value >= 0.1 && value <= 50) {
          updates.trailingValue = value;
        }
      }
    } else {
      return {
        success: false,
        message: "❌ Неверный тип. Используйте: `breakeven`, `moving`, `moving2`, `percent`, `triggers`, или `off`.",
        error: "INVALID_TYPE",
      };
    }

    await updateConfig(userId, updates);

    const statusText = updates.trailingEnabled ? "✅ Включено" : "❌ Выключено";
    const typeText = updates.trailingType ? `\nТип: \`${updates.trailingType}\`` : '';
    const valueText = updates.trailingValue !== undefined && updates.trailingValue !== null ?
      `\nЗначение: \`${updates.trailingValue}%\`` : '';

    return {
      success: true,
      message: `📈 *Trailing Stop*\n\n${statusText}${typeText}${valueText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[CornixCommand] Trailing error:", error);
    return {
      success: false,
      message: "❌ Ошибка обновления Trailing Stop настроек.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

async function handleLeverage(userId: string, args: string[]): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      return {
        success: true,
        message: `⚡ *Leverage (Плечо)*\n\n` +
          `Current: \`${config.leverage}x\`\n` +
          `Mode: \`${config.leverageMode}\`\n\n` +
          `Usage:\n` +
          `• \`/leverage [value]\`\n` +
          `• \`/leverage [value] EXACTLY\`\n` +
          `• \`/leverage [value] UP_TO\`\n\n` +
          `*Режимы:*\n` +
          `• \`EXACTLY\` - Точное плечо\n` +
          `• \`UP_TO\` - До указанного`,
        config: { leverage: config.leverage },
      };
    }

    const updates: Partial<BotConfigSettings> = {};

    const leverage = parseInt(args[0], 10);
    if (isNaN(leverage) || leverage < 1 || leverage > 125) {
      return {
        success: false,
        message: "❌ Неверное плечо. Диапазон: 1-125x.",
        error: "INVALID_VALUE",
      };
    }
    updates.leverage = leverage;

    if (args[1]) {
      const mode = args[1].toUpperCase();
      if (mode === 'EXACTLY' || mode === 'UP_TO') {
        updates.leverageMode = mode as 'EXACTLY' | 'UP_TO';
      }
    }

    await updateConfig(userId, updates);

    const modeText = updates.leverageMode ? `\nРежим: \`${updates.leverageMode}\`` : '';

    return {
      success: true,
      message: `⚡ *Leverage*\n\nУстановлено: \`${updates.leverage}x\`${modeText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[CornixCommand] Leverage error:", error);
    return {
      success: false,
      message: "❌ Ошибка обновления Leverage.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

async function handleDirection(userId: string, args: string[]): Promise<CommandResult> {
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
        message: "❌ Неверное направление. Используйте `long`, `short`, или `both`.",
        error: "INVALID_DIRECTION",
      };
    }

    await updateConfig(userId, { directionFilter: direction as 'LONG' | 'SHORT' | 'BOTH' });

    return {
      success: true,
      message: `📍 *Direction Filter*\n\nУстановлено: \`${direction}\``,
      config: { directionFilter: direction },
    };
  } catch (error) {
    console.error("[CornixCommand] Direction error:", error);
    return {
      success: false,
      message: "❌ Ошибка обновления Direction Filter.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

async function handleEntryStrategy(userId: string, args: string[]): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      return {
        success: true,
        message: `📍 *Entry Strategy (9 стратегий Cornix)*\n\n` +
          `Текущая: \`${config.entryStrategy}\`\n\n` +
          `*Стратегии:*\n` +
          `• \`evenly\` - Равномерное распределение\n` +
          `• \`one\` - Одна точка входа\n` +
          `• \`two\` - Два входа (50/50)\n` +
          `• \`three\` - Три входа (33/33/34)\n` +
          `• \`fifty\` - 50% первый, остальное равномерно\n` +
          `• \`decreasing\` - Убывающее (эксп.)\n` +
          `• \`increasing\` - Нарастающее (эксп.)\n` +
          `• \`skip\` - Пропустить первый\n` +
          `• \`custom\` - Пользовательские %\n\n` +
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
        message: "❌ Неверная стратегия. Используйте: evenly, one, two, three, fifty, decreasing, increasing, или skip.",
        error: "INVALID_STRATEGY",
      };
    }

    await updateConfig(userId, { entryStrategy: mappedStrategy });

    return {
      success: true,
      message: `📍 *Entry Strategy*\n\nУстановлено: \`${mappedStrategy}\``,
      config: { entryStrategy: mappedStrategy },
    };
  } catch (error) {
    console.error("[CornixCommand] Entry Strategy error:", error);
    return {
      success: false,
      message: "❌ Ошибка обновления Entry Strategy.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

async function handleTPStrategy(userId: string, args: string[]): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      return {
        success: true,
        message: `🎯 *TP Strategy (9 стратегий Cornix)*\n\n` +
          `Текущая: \`${config.tpStrategy}\`\n\n` +
          `*Стратегии:*\n` +
          `• \`evenly\` - Равномерное распределение\n` +
          `• \`one\` - Один таргет\n` +
          `• \`two\` - Два таргета (50/50)\n` +
          `• \`three\` - Три таргета (33/33/34)\n` +
          `• \`fifty\` - 50% первый, остальное равномерно\n` +
          `• \`decreasing\` - Убывающее (эксп.)\n` +
          `• \`increasing\` - Нарастающее (эксп.)\n` +
          `• \`skip\` - Пропустить первый\n` +
          `• \`custom\` - Пользовательские %\n\n` +
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
        message: "❌ Неверная стратегия. Используйте: evenly, one, two, three, fifty, decreasing, increasing, или skip.",
        error: "INVALID_STRATEGY",
      };
    }

    await updateConfig(userId, { tpStrategy: mappedStrategy });

    return {
      success: true,
      message: `🎯 *TP Strategy*\n\nУстановлено: \`${mappedStrategy}\``,
      config: { tpStrategy: mappedStrategy },
    };
  } catch (error) {
    console.error("[CornixCommand] TP Strategy error:", error);
    return {
      success: false,
      message: "❌ Ошибка обновления TP Strategy.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

async function handleSL(userId: string, args: string[]): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const status = config.defaultStopLoss ? `\`${config.defaultStopLoss}%\`` : "Не установлен";
      return {
        success: true,
        message: `🛑 *Stop Loss*\n\n` +
          `Текущий: ${status}\n` +
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
          message: "❌ Неверное SL значение. Диапазон: 0.1%-100%.",
          error: "INVALID_VALUE",
        };
      }
      updates.defaultStopLoss = sl;
    }

    if (args[1]) {
      const baseline = args[1].toUpperCase();
      if (baseline === 'AVERAGE_ENTRIES' || baseline === 'FIRST_ENTRY') {
        updates.slBaseline = baseline as 'AVERAGE_ENTRIES' | 'FIRST_ENTRY';
      }
    }

    await updateConfig(userId, updates);

    const slText = updates.defaultStopLoss !== null ?
      `Установлено: \`${updates.defaultStopLoss}%\`` :
      "❌ Выключено";
    const baselineText = updates.slBaseline ? `\nBaseline: \`${updates.slBaseline}\`` : '';

    return {
      success: true,
      message: `🛑 *Stop Loss*\n\n${slText}${baselineText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[CornixCommand] SL error:", error);
    return {
      success: false,
      message: "❌ Ошибка обновления Stop Loss.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

async function handleFilters(userId: string, args: string[]): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    if (args.length === 0) {
      const allowedSymbolsText = config.allowedSymbols?.length ?
        config.allowedSymbols.join(', ') : 'Все';
      const blacklistedSymbolsText = config.blacklistedSymbols?.length ?
        config.blacklistedSymbols.join(', ') : 'Нет';

      return {
        success: true,
        message: `🔍 *Signal Filters*\n\n` +
          `Ignore No SL: ${config.ignoreSignalsWithoutSL ? '✅' : '❌'}\n` +
          `Ignore No TP: ${config.ignoreSignalsWithoutTP ? '✅' : '❌'}\n` +
          `Min R:R: ${config.minRiskRewardRatio || 'Не установлен'}\n` +
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
            message: "❌ Неверное R:R значение. Диапазон: 0.5-10.",
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
          message: "❌ Неверная опция. Используйте: nosl, notp, minrr, allow, или block.",
          error: "INVALID_OPTION",
        };
    }

    await updateConfig(userId, updates);

    const optionText = Object.entries(updates)
      .map(([key, value]) => `${key}: \`${JSON.stringify(value)}\``)
      .join('\n');

    return {
      success: true,
      message: `🔍 *Signal Filters*\n\nОбновлено:\n${optionText}`,
      config: updates,
    };
  } catch (error) {
    console.error("[CornixCommand] Filters error:", error);
    return {
      success: false,
      message: "❌ Ошибка обновления Signal Filters.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

async function handleConfig(userId: string): Promise<CommandResult> {
  try {
    const config = await getOrCreateConfig(userId);

    return {
      success: true,
      message: `⚙️ *Полная конфигурация Cornix*\n\n` +
        `📍 *First Entry as Market:* ${config.firstEntryAsMarket ? '✅' : '❌'} (${config.firstEntryMode}, ${config.firstEntryMaxPriceCap}%)\n` +
        `🎯 *TP Grace:* ${config.tpGraceEnabled ? '✅' : '❌'} (${config.tpGraceCapPercent}%, ${config.tpGraceMaxRetries} retries)\n` +
        `📈 *Trailing Stop:* ${config.trailingEnabled ? '✅' : '❌'} (${config.trailingType || 'N/A'})\n` +
        `📍 *Trailing Entry:* ${config.trailingEntryEnabled ? '✅' : '❌'} (${config.trailingEntryPercent}%)\n` +
        `🎯 *Trailing TP:* ${config.tpTrailingEnabled ? '✅' : '❌'} (${config.tpTrailingPercent}%)\n` +
        `📍 *Entry Strategy:* \`${config.entryStrategy}\`\n` +
        `🎯 *TP Strategy:* \`${config.tpStrategy}\`\n` +
        `🎯 *Moving TP:* ${config.movingTPEnabled ? '✅' : '❌'}\n` +
        `🛑 *Stop Loss:* ${config.defaultStopLoss ? `${config.defaultStopLoss}%` : 'N/A'} (${config.slBaseline})\n` +
        `⚡ *Leverage:* ${config.leverage}x (${config.leverageMode})\n` +
        `📍 *Direction:* \`${config.directionFilter}\`\n` +
        `🔄 *Auto-Close:* ${config.closeOnTPSLBeforeEntry ? '✅' : '❌'}\n` +
        `📍 *Entry Grace:* ${config.firstEntryGracePercent}%\n` +
        `⚡ *Auto-Execute:* ${config.autoExecuteEnabled ? '✅' : '❌'}\n` +
        `🔍 *Ignore No SL:* ${config.ignoreSignalsWithoutSL ? '✅' : '❌'}\n` +
        `🔍 *Ignore No TP:* ${config.ignoreSignalsWithoutTP ? '✅' : '❌'}`,
      config,
    };
  } catch (error) {
    console.error("[CornixCommand] Config error:", error);
    return {
      success: false,
      message: "❌ Ошибка получения конфигурации.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

async function handleReset(userId: string): Promise<CommandResult> {
  try {
    const defaultConfig: Partial<BotConfigSettings> = {
      firstEntryAsMarket: false,
      firstEntryMode: 'WAIT_ENTRY',
      firstEntryMaxPriceCap: 1.0,
      tpGraceEnabled: false,
      tpGraceCapPercent: 0.5,
      tpGraceMaxRetries: 3,
      trailingEnabled: false,
      trailingType: null,
      trailingValue: null,
      trailingEntryEnabled: false,
      trailingEntryPercent: 1.0,
      tpTrailingEnabled: false,
      tpTrailingPercent: 1.0,
      entryStrategy: 'EVENLY_DIVIDED',
      tpStrategy: 'EVENLY_DIVIDED',
      movingTPEnabled: false,
      defaultStopLoss: null,
      slBaseline: 'AVERAGE_ENTRIES',
      leverage: 10,
      leverageMode: 'EXACTLY',
      directionFilter: 'BOTH',
      closeOnTPSLBeforeEntry: true,
      firstEntryGracePercent: 0,
      autoExecuteEnabled: false,
      ignoreSignalsWithoutSL: false,
      ignoreSignalsWithoutTP: false,
      minRiskRewardRatio: null,
      allowedSymbols: null,
      blacklistedSymbols: null,
    };

    await updateConfig(userId, defaultConfig);

    return {
      success: true,
      message: "🔄 *Сброс конфигурации*\n\n✅ Все настройки сброшены к значениям по умолчанию.",
      config: defaultConfig,
    };
  } catch (error) {
    console.error("[CornixCommand] Reset error:", error);
    return {
      success: false,
      message: "❌ Ошибка сброса конфигурации.",
      error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}

// ==================== MAIN API HANDLERS ====================

// POST - Execute Cornix command
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { command, args = [], userId: providedUserId } = body;

    if (!command) {
      return NextResponse.json(
        { error: "Command is required" },
        { status: 400 }
      );
    }

    const userId = providedUserId || await getDefaultUserId();

    let result: CommandResult;

    switch (command.toLowerCase()) {
      case 'firstentry':
      case 'first_entry':
        result = await handleFirstEntry(userId, args);
        break;
      case 'tpgrace':
      case 'tp_grace':
        result = await handleTPGrace(userId, args);
        break;
      case 'trailing':
      case 'trailing_stop':
        result = await handleTrailing(userId, args);
        break;
      case 'leverage':
        result = await handleLeverage(userId, args);
        break;
      case 'direction':
        result = await handleDirection(userId, args);
        break;
      case 'entrystrategy':
      case 'entry_strategy':
        result = await handleEntryStrategy(userId, args);
        break;
      case 'tpstrategy':
      case 'tp_strategy':
        result = await handleTPStrategy(userId, args);
        break;
      case 'sl':
      case 'stoploss':
        result = await handleSL(userId, args);
        break;
      case 'filters':
        result = await handleFilters(userId, args);
        break;
      case 'config':
      case 'status':
        result = await handleConfig(userId);
        break;
      case 'reset':
        result = await handleReset(userId);
        break;
      default:
        result = {
          success: false,
          message: `❌ Неизвестная команда: \`${command}\`\n\nДоступные команды:\n• firstentry, tpgrace, trailing, leverage\n• direction, entrystrategy, tpstrategy\n• sl, filters, config, reset`,
          error: "UNKNOWN_COMMAND",
        };
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error("Cornix command error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "❌ Внутренняя ошибка сервера",
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR"
      },
      { status: 500 }
    );
  }
}

// GET - Get help and available commands
export async function GET() {
  return NextResponse.json({
    success: true,
    message: "🌽 *Cornix Auto-Trading Commands*\n\nПолная интеграция с Cornix платформой.",
    commands: [
      {
        command: "firstentry",
        description: "First Entry as Market - рыночный вход с защитой",
        usage: "/firstentry [on|off] [IMMEDIATE|WAIT_ENTRY] [cap%]",
        example: "/firstentry on WAIT_ENTRY 2"
      },
      {
        command: "tpgrace",
        description: "TP Grace - повтор TP при частичном исполнении",
        usage: "/tpgrace [on|off] [cap%] [retries]",
        example: "/tpgrace on 0.5 5"
      },
      {
        command: "trailing",
        description: "Trailing Stop - 5 типов трейлинга",
        usage: "/trailing [breakeven|moving|moving2|percent|triggers|off] [value]",
        example: "/trailing percent 3"
      },
      {
        command: "leverage",
        description: "Leverage - настройка плеча",
        usage: "/leverage [value] [EXACTLY|UP_TO]",
        example: "/leverage 20 EXACTLY"
      },
      {
        command: "direction",
        description: "Direction Filter - фильтр по направлению",
        usage: "/direction [long|short|both]",
        example: "/direction long"
      },
      {
        command: "entrystrategy",
        description: "Entry Strategy - 9 стратегий входа",
        usage: "/entrystrategy [strategy]",
        example: "/entrystrategy fifty"
      },
      {
        command: "tpstrategy",
        description: "TP Strategy - 9 стратегий TP",
        usage: "/tpstrategy [strategy]",
        example: "/tpstrategy two"
      },
      {
        command: "sl",
        description: "Stop Loss - настройка SL",
        usage: "/sl [percent|off] [AVERAGE_ENTRIES|FIRST_ENTRY]",
        example: "/sl 5 AVERAGE_ENTRIES"
      },
      {
        command: "filters",
        description: "Signal Filters - фильтры сигналов",
        usage: "/filters [nosl|notp|minrr|allow|block] [value]",
        example: "/filters nosl on"
      },
      {
        command: "config",
        description: "Показать полную конфигурацию",
        usage: "/config",
        example: "/config"
      },
      {
        command: "reset",
        description: "Сбросить все настройки",
        usage: "/reset",
        example: "/reset"
      }
    ],
    strategies: {
      entry: ["evenly", "one", "two", "three", "fifty", "decreasing", "increasing", "skip", "custom"],
      tp: ["evenly", "one", "two", "three", "fifty", "decreasing", "increasing", "skip", "custom"]
    },
    trailingTypes: ["breakeven", "moving", "moving2", "percent", "triggers"]
  });
}
