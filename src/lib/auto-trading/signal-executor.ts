/**
 * Signal Execution Service
 *
 * Unified signal execution that integrates:
 * - First Entry as Market feature
 * - Take-Profit Grace feature
 * - Standard signal processing
 *
 * This service orchestrates the complete lifecycle of signal execution.
 */

import { db } from "@/lib/db";
import { FirstEntryMarketService, type FirstEntryMarketConfig } from "./first-entry-market";
import { TPGraceService, type TPGraceConfig, type TPTarget } from "./tp-grace";

// ==================== TYPES ====================

export interface SignalExecutionContext {
  signalId: number;
  botConfig: {
    id: string;
    firstEntryAsMarket: boolean;
    firstEntryMode: string;
    firstEntryMaxPriceCap: number;
    tpGraceEnabled: boolean;
    tpGraceCapPercent: number;
    tpGraceMaxRetries: number;
    leverage: number;
    tradeAmount: number;
    amountType: string;
    exchangeId: string;
    exchangeType: string;
  };
  marketPrice: number;
  accountId: string;
}

export interface SignalExecutionResult {
  success: boolean;
  signalId: number;
  positionId?: string;
  entryResult?: {
    executed: boolean;
    price: number;
    orderType: "MARKET" | "LIMIT";
    savedPercent?: number;
    retryScheduled?: boolean;
  };
  tpGraceInitialized?: boolean;
  error?: string;
  logs: string[];
}

// ==================== MAIN SERVICE ====================

export class SignalExecutionService {
  /**
   * Execute a signal with all configured features
   */
  static async executeSignal(context: SignalExecutionContext): Promise<SignalExecutionResult> {
    const logs: string[] = [];
    logs.push(`[SignalExecution] Starting execution for signal #${context.signalId}`);

    try {
      // Get signal details
      const signal = await db.signal.findUnique({
        where: { signalId: context.signalId },
      });

      if (!signal) {
        return {
          success: false,
          signalId: context.signalId,
          error: `Signal #${context.signalId} not found`,
          logs,
        };
      }

      // Check if signal is already processed
      if (signal.status !== "PENDING") {
        return {
          success: false,
          signalId: context.signalId,
          error: `Signal #${context.signalId} already processed (status: ${signal.status})`,
          logs,
        };
      }

      // Parse entry prices
      const entryPrices = signal.entryPrices ? JSON.parse(signal.entryPrices) : [context.marketPrice];
      const firstEntryPrice = entryPrices[0] || context.marketPrice;

      // Get first entry market config
      const firstEntryConfig: FirstEntryMarketConfig = FirstEntryMarketService.getConfigFromBotConfig({
        firstEntryAsMarket: context.botConfig.firstEntryAsMarket,
        firstEntryMode: context.botConfig.firstEntryMode,
        firstEntryMaxPriceCap: context.botConfig.firstEntryMaxPriceCap,
      });

      let entryResult: SignalExecutionResult["entryResult"] = {
        executed: false,
        price: firstEntryPrice,
        orderType: "LIMIT",
      };

      // Process First Entry as Market if enabled
      if (firstEntryConfig.enabled) {
        logs.push(`[FirstEntryMarket] Enabled with mode: ${firstEntryConfig.mode}, cap: ${firstEntryConfig.maxPriceCapPercent}%`);

        // Validate config
        const validation = FirstEntryMarketService.validateConfig(firstEntryConfig);
        if (!validation.valid) {
          logs.push(`[FirstEntryMarket] Invalid config: ${validation.errors.join(", ")}`);
        } else {
          // Calculate entry parameters
          const calculation = FirstEntryMarketService.calculateEntryPrice(
            firstEntryPrice,
            context.marketPrice,
            signal.direction as "LONG" | "SHORT",
            firstEntryConfig
          );

          logs.push(`[FirstEntryMarket] Calculation: ${calculation.reason}`);
          logs.push(`[FirstEntryMarket] Execution type: ${calculation.executionType}, Limit price: ${calculation.limitPrice}`);

          if (calculation.shouldExecute && calculation.limitPrice) {
            // Execute the entry
            const result = await FirstEntryMarketService.executeFirstEntry(
              context.signalId,
              firstEntryConfig,
              context.marketPrice
            );

            if (result.success) {
              entryResult = {
                executed: true,
                price: result.executedPrice || calculation.limitPrice,
                orderType: result.orderType,
                savedPercent: result.savedPercent,
              };
              logs.push(`[FirstEntryMarket] Entry executed at ${result.executedPrice} (saved ${result.savedPercent?.toFixed(2) || 0}%)`);
            } else {
              entryResult = {
                executed: false,
                price: calculation.limitPrice || firstEntryPrice,
                orderType: "LIMIT",
                retryScheduled: result.retryScheduled,
              };
              logs.push(`[FirstEntryMarket] Entry pending: ${result.error}`);
            }
          } else if (calculation.executionType === "WAIT") {
            // Create pending order for WAIT_ENTRY mode
            await FirstEntryMarketService.createPendingEntryOrder(
              context.signalId,
              firstEntryPrice,
              calculation.cappedEntryPrice,
              signal.direction as "LONG" | "SHORT"
            );
            entryResult.retryScheduled = true;
            logs.push(`[FirstEntryMarket] Pending order created, waiting for price reach`);
          }
        }
      } else {
        // Standard entry execution
        logs.push(`[StandardEntry] Processing standard entry at ${firstEntryPrice}`);
        entryResult = {
          executed: true,
          price: context.marketPrice,
          orderType: "MARKET",
        };
      }

      // If entry not executed, return without creating position
      if (!entryResult.executed) {
        await db.signal.update({
          where: { signalId: context.signalId },
          data: {
            status: "PENDING",
            errorMessage: "Waiting for entry conditions",
          },
        });

        return {
          success: true,
          signalId: context.signalId,
          entryResult,
          error: "Entry pending - waiting for conditions",
          logs,
        };
      }

      // Create position
      const quantity = (context.botConfig.tradeAmount * context.botConfig.leverage) / entryResult.price;

      const position = await db.position.create({
        data: {
          accountId: context.accountId,
          symbol: signal.symbol,
          direction: signal.direction,
          status: "OPEN",
          totalAmount: quantity,
          filledAmount: quantity,
          avgEntryPrice: entryResult.price,
          currentPrice: context.marketPrice,
          leverage: context.botConfig.leverage,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfits ? JSON.parse(signal.takeProfits)[0]?.price : null,
          unrealizedPnl: 0,
          realizedPnl: 0,
          isDemo: true,
        },
      });

      logs.push(`[Position] Created ${position.id} for ${signal.symbol} ${signal.direction}`);

      // Initialize TP Grace if enabled
      let tpGraceInitialized = false;
      const tpGraceConfig: TPGraceConfig = TPGraceService.getConfigFromBotConfig({
        tpGraceEnabled: context.botConfig.tpGraceEnabled,
        tpGraceCapPercent: context.botConfig.tpGraceCapPercent,
        tpGraceMaxRetries: context.botConfig.tpGraceMaxRetries,
      });

      if (tpGraceConfig.enabled && signal.takeProfits) {
        logs.push(`[TPGrace] Enabled with cap: ${tpGraceConfig.capPercent}%, max retries: ${tpGraceConfig.maxRetries}`);

        const validation = TPGraceService.validateConfig(tpGraceConfig);
        if (!validation.valid) {
          logs.push(`[TPGrace] Invalid config: ${validation.errors.join(", ")}`);
        } else {
          const tpTargets: TPTarget[] = JSON.parse(signal.takeProfits).map((tp: { price: number; percentage: number }) => ({
            price: tp.price,
            percentage: tp.percentage,
            filled: 0,
            retries: 0,
            originalPrice: tp.price,
          }));

          const initState = await TPGraceService.initializeTPGraceState(position.id, tpTargets);
          if (initState.success) {
            tpGraceInitialized = true;
            logs.push(`[TPGrace] Initialized for ${tpTargets.length} TP targets`);
          } else {
            logs.push(`[TPGrace] Failed to initialize: ${initState.error}`);
          }
        }
      }

      // Update signal status
      await db.signal.update({
        where: { signalId: context.signalId },
        data: {
          status: "ACTIVE",
          positionId: position.id,
          processedAt: new Date(),
        },
      });

      logs.push(`[SignalExecution] Completed successfully`);

      return {
        success: true,
        signalId: context.signalId,
        positionId: position.id,
        entryResult,
        tpGraceInitialized,
        logs,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logs.push(`[SignalExecution] Error: ${errorMessage}`);

      return {
        success: false,
        signalId: context.signalId,
        error: errorMessage,
        logs,
      };
    }
  }

  /**
   * Process TP Grace for all active positions
   * Should be called periodically (e.g., every minute) by cron job
   */
  static async processActivePositionsTPGrace(): Promise<{
    processed: number;
    results: Array<{
      positionId: string;
      success: boolean;
      tpResults?: number;
      error?: string;
    }>;
  }> {
    const results: Array<{
      positionId: string;
      success: boolean;
      tpResults?: number;
      error?: string;
    }> = [];

    try {
      // Get all active positions with TP Grace enabled
      const activePositions = await db.position.findMany({
        where: {
          status: "OPEN",
          Signal: {
            isNot: null,
          },
        },
        include: {
          Signal: true,
        },
      });

      for (const position of activePositions) {
        // Get bot config for this position
        const botConfig = await db.botConfig.findFirst({
          where: {
            userId: position.account?.userId,
            isActive: true,
          },
        });

        if (!botConfig?.tpGraceEnabled) continue;

        const tpGraceConfig = TPGraceService.getConfigFromBotConfig(botConfig);

        // Get current market price
        const marketPrice = await db.marketPrice.findUnique({
          where: { symbol: position.symbol },
        });

        if (!marketPrice) continue;

        // Process TP Grace
        const tpResults = await TPGraceService.processTPGrace(
          position.id,
          tpGraceConfig,
          marketPrice.price
        );

        results.push({
          positionId: position.id,
          success: tpResults.some(r => r.success),
          tpResults: tpResults.filter(r => r.success).length,
        });
      }

      return {
        processed: results.length,
        results,
      };

    } catch (error) {
      console.error("[TP Grace Batch] Error:", error);
      return {
        processed: 0,
        results,
      };
    }
  }

  /**
   * Get execution statistics
   */
  static async getExecutionStats(): Promise<{
    totalSignals: number;
    activeSignals: number;
    pendingEntries: number;
    tpGraceActive: number;
  }> {
    const [totalSignals, activeSignals, pendingSignals, positionsWithTPGrace] = await Promise.all([
      db.signal.count(),
      db.signal.count({ where: { status: "ACTIVE" } }),
      db.signal.count({ where: { status: "PENDING" } }),
      db.position.count({
        where: {
          status: "OPEN",
          Signal: { isNot: null },
        },
      }),
    ]);

    return {
      totalSignals,
      activeSignals,
      pendingEntries: pendingSignals,
      tpGraceActive: positionsWithTPGrace,
    };
  }
}

export default SignalExecutionService;
