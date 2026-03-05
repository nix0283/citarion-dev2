/**
 * Position Monitoring Service
 *
 * Production-ready real-time position monitoring for:
 * - Price tracking for trailing stops
 * - Position status updates
 * - TP/SL hit detection
 * - Position PnL calculation
 *
 * Integration:
 * - Uses exchange APIs for price data
 * - Stores state in database
 * - Emits events on triggers
 * - WebSocket for real-time updates
 */

import { db } from "@/lib/db";
import { notifyTelegram, notifyUI, type NotificationEvent } from "@/lib/notification-service";
import { createExchangeClient, type ExchangeId } from "@/lib/exchange";
import { TrailingStopService } from "./trailing-stop";

// ==================== TYPES ====================

export interface PositionMonitorConfig {
  /** Interval for position monitoring in milliseconds */
  monitorIntervalMs: number;
  /** Enable WebSocket real-time updates */
  enableRealtimeUpdates: boolean;
  /** Enable trailing stop monitoring */
  enableTrailingStop: boolean;
  /** Price update interval for REST API fallback (ms) */
  priceUpdateIntervalMs: number;
  /** Maximum positions to monitor per batch */
  maxBatchSize: number;
  /** Enable liquidation warnings */
  enableLiquidationWarnings: boolean;
  /** Liquidation warning threshold (percentage from liquidation) */
  liquidationWarningThreshold: number;
}

export interface PositionStatus {
  positionId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  status: "OPEN" | "CLOSED" | "LIQUIDATED" | "TP_HIT" | "SL_HIT";
  entryPrice: number;
  currentPrice: number;
  highestPrice: number;
  lowestPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  realizedPnl: number;
  totalAmount: number;
  filledAmount: number;
  leverage: number;
  trailingStopActive: boolean;
  lastUpdateAt: Date;
  monitoringStartedAt: Date;
}

export interface PositionTrigger {
  type: "TP_HIT" | "SL_HIT" | "TRAILING_STOP" | "LIQUIDATION_WARNING" | "POSITION_CLOSED";
  positionId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  triggerPrice: number;
  triggerValue?: number;
  triggerIndex?: number;
  pnl: number;
  pnlPercent: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface MonitoringStats {
  totalPositions: number;
  activePositions: number;
  closedPositions: number;
  tpHitCount: number;
  slHitCount: number;
  trailingStopUpdates: number;
  liquidationWarnings: number;
  errors: number;
  lastProcessTime: Date | null;
  averageProcessingTimeMs: number;
  uptimeSeconds: number;
}

export interface PriceData {
  symbol: string;
  price: number;
  bidPrice?: number;
  askPrice?: number;
  timestamp: Date;
}

export interface PnLCalculation {
  entryPrice: number;
  currentPrice: number;
  amount: number;
  leverage: number;
  direction: "LONG" | "SHORT";
  pnl: number;
  pnlPercent: number;
  priceChangePercent: number;
}

// ==================== CONSTANTS ====================

const DEFAULT_CONFIG: PositionMonitorConfig = {
  monitorIntervalMs: 5000,
  enableRealtimeUpdates: true,
  enableTrailingStop: true,
  priceUpdateIntervalMs: 3000,
  maxBatchSize: 50,
  enableLiquidationWarnings: true,
  liquidationWarningThreshold: 5,
};

// Price cache for WebSocket/REST API
const priceCache = new Map<string, PriceData>();

// Monitoring state
const monitoredPositions = new Map<string, PositionStatus>();
const monitoringIntervals = new Map<string, NodeJS.Timeout>();
let globalMonitorInterval: NodeJS.Timeout | null = null;
let isGlobalMonitoring = false;
let startTime: Date | null = null;
let processCount = 0;
let totalProcessingTimeMs = 0;
let errorCount = 0;

// Event subscribers
const eventSubscribers = new Set<(trigger: PositionTrigger) => void | Promise<void>>();

// ==================== MAIN SERVICE CLASS ====================

export class PositionMonitoringService {
  private static config: PositionMonitorConfig = DEFAULT_CONFIG;
  private static exchangeClients = new Map<string, ReturnType<typeof createExchangeClient>>();

  // ==================== CONFIGURATION ====================

  /**
   * Configure the position monitoring service
   */
  static configure(config: Partial<PositionMonitorConfig>): void {
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log("[PositionMonitoring] Configured:", this.config);
  }

  /**
   * Get current configuration
   */
  static getConfig(): PositionMonitorConfig {
    return { ...this.config };
  }

  // ==================== MONITORING CONTROL ====================

  /**
   * Start monitoring a specific position
   */
  static async startMonitoring(positionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if already monitoring
      if (monitoredPositions.has(positionId)) {
        return { success: true };
      }

      // Get position from database
      const position = await db.position.findUnique({
        where: { id: positionId },
        include: {
          Signal: true,
          account: {
            select: {
              exchangeId: true,
              accountType: true,
              apiKey: true,
              apiSecret: true,
              apiPassphrase: true,
            },
          },
        },
      });

      if (!position) {
        return { success: false, error: "Position not found" };
      }

      if (position.status !== "OPEN") {
        return { success: false, error: "Position is not open" };
      }

      // Initialize position status
      const currentPrice = await this.fetchPrice(position.symbol, position.account.exchangeId);
      const direction = position.direction as "LONG" | "SHORT";

      const positionStatus: PositionStatus = {
        positionId: position.id,
        symbol: position.symbol,
        direction,
        status: "OPEN",
        entryPrice: position.avgEntryPrice,
        currentPrice,
        highestPrice: position.highestPrice ?? (direction === "LONG" ? position.avgEntryPrice : currentPrice),
        lowestPrice: position.lowestPrice ?? (direction === "SHORT" ? position.avgEntryPrice : currentPrice),
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        unrealizedPnl: position.unrealizedPnl,
        unrealizedPnlPercent: 0,
        realizedPnl: position.realizedPnl,
        totalAmount: position.totalAmount,
        filledAmount: position.filledAmount,
        leverage: position.leverage,
        trailingStopActive: position.trailingActivated,
        lastUpdateAt: new Date(),
        monitoringStartedAt: new Date(),
      };

      // Calculate initial PnL
      const pnlCalc = this.calculateUnrealizedPnL(positionStatus);
      positionStatus.unrealizedPnl = pnlCalc.pnl;
      positionStatus.unrealizedPnlPercent = pnlCalc.pnlPercent;

      // Store in monitoring map
      monitoredPositions.set(positionId, positionStatus);

      // Log start
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[PositionMonitoring] Started monitoring position ${positionId}`,
          details: JSON.stringify({
            positionId,
            symbol: position.symbol,
            direction: position.direction,
            entryPrice: position.avgEntryPrice,
            currentPrice,
          }),
        },
      });

      console.log(`[PositionMonitoring] Started monitoring ${positionId} (${position.symbol} ${direction})`);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[PositionMonitoring] Error starting monitoring for ${positionId}:`, errorMessage);
      errorCount++;
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Stop monitoring a specific position
   */
  static async stopMonitoring(positionId: string): Promise<{ success: boolean }> {
    try {
      const position = monitoredPositions.get(positionId);

      if (position) {
        // Clear any per-position interval
        const interval = monitoringIntervals.get(positionId);
        if (interval) {
          clearInterval(interval);
          monitoringIntervals.delete(positionId);
        }

        monitoredPositions.delete(positionId);

        // Log stop
        await db.systemLog.create({
          data: {
            level: "INFO",
            category: "TRADE",
            message: `[PositionMonitoring] Stopped monitoring position ${positionId}`,
            details: JSON.stringify({
              positionId,
              symbol: position.symbol,
              finalPnl: position.unrealizedPnl,
            }),
          },
        });

        console.log(`[PositionMonitoring] Stopped monitoring ${positionId}`);
      }

      return { success: true };
    } catch (error) {
      console.error(`[PositionMonitoring] Error stopping monitoring for ${positionId}:`, error);
      return { success: true }; // Return success anyway to clean up
    }
  }

  /**
   * Update position with new price
   */
  static async updatePositionPrice(positionId: string, currentPrice: number): Promise<PositionStatus | null> {
    const position = monitoredPositions.get(positionId);
    if (!position) return null;

    // Update highest/lowest prices
    if (position.direction === "LONG") {
      position.highestPrice = Math.max(position.highestPrice, currentPrice);
    } else {
      position.lowestPrice = Math.min(position.lowestPrice, currentPrice);
    }

    position.currentPrice = currentPrice;
    position.lastUpdateAt = new Date();

    // Calculate PnL
    const pnlCalc = this.calculateUnrealizedPnL(position);
    position.unrealizedPnl = pnlCalc.pnl;
    position.unrealizedPnlPercent = pnlCalc.pnlPercent;

    // Update cache
    monitoredPositions.set(positionId, position);

    // Update database
    await db.position.update({
      where: { id: positionId },
      data: {
        currentPrice,
        highestPrice: position.highestPrice,
        lowestPrice: position.lowestPrice,
        unrealizedPnl: position.unrealizedPnl,
      },
    });

    return position;
  }

  /**
   * Check TP/SL triggers for a position
   */
  static async checkTriggers(positionId: string): Promise<PositionTrigger[]> {
    const triggers: PositionTrigger[] = [];
    const position = monitoredPositions.get(positionId);
    if (!position) return triggers;

    const { direction, currentPrice, stopLoss, takeProfit, entryPrice, totalAmount, leverage } = position;

    // Check Stop Loss
    if (stopLoss) {
      const slHit = direction === "LONG" ? currentPrice <= stopLoss : currentPrice >= stopLoss;

      if (slHit) {
        const pnl = this.calculatePnL(entryPrice, stopLoss, totalAmount, direction, leverage);
        const pnlPercent = this.calculatePnLPercent(entryPrice, stopLoss, direction, leverage);

        const trigger: PositionTrigger = {
          type: "SL_HIT",
          positionId,
          symbol: position.symbol,
          direction,
          triggerPrice: stopLoss,
          triggerValue: stopLoss,
          pnl,
          pnlPercent,
          timestamp: new Date(),
          metadata: { reason: "Stop loss triggered" },
        };

        triggers.push(trigger);
        position.status = "SL_HIT";
        await this.handleTrigger(trigger);
      }
    }

    // Check Take Profit
    if (!triggers.length && takeProfit) {
      const tpHit = direction === "LONG" ? currentPrice >= takeProfit : currentPrice <= takeProfit;

      if (tpHit) {
        const pnl = this.calculatePnL(entryPrice, takeProfit, totalAmount, direction, leverage);
        const pnlPercent = this.calculatePnLPercent(entryPrice, takeProfit, direction, leverage);

        const trigger: PositionTrigger = {
          type: "TP_HIT",
          positionId,
          symbol: position.symbol,
          direction,
          triggerPrice: takeProfit,
          triggerValue: takeProfit,
          pnl,
          pnlPercent,
          timestamp: new Date(),
          metadata: { reason: "Take profit triggered" },
        };

        triggers.push(trigger);
        position.status = "TP_HIT";
        await this.handleTrigger(trigger);
      }
    }

    // Check liquidation warning
    if (!triggers.length && this.config.enableLiquidationWarnings && leverage >= 5) {
      const liquidationPrice = this.calculateLiquidationPrice(entryPrice, direction, leverage);
      const distancePercent = direction === "LONG"
        ? ((currentPrice - liquidationPrice) / liquidationPrice) * 100
        : ((liquidationPrice - currentPrice) / liquidationPrice) * 100;

      if (distancePercent <= this.config.liquidationWarningThreshold) {
        const pnl = this.calculatePnL(entryPrice, currentPrice, totalAmount, direction, leverage);
        const pnlPercent = this.calculatePnLPercent(entryPrice, currentPrice, direction, leverage);

        const trigger: PositionTrigger = {
          type: "LIQUIDATION_WARNING",
          positionId,
          symbol: position.symbol,
          direction,
          triggerPrice: currentPrice,
          triggerValue: liquidationPrice,
          pnl,
          pnlPercent,
          timestamp: new Date(),
          metadata: {
            liquidationPrice,
            distancePercent,
          },
        };

        triggers.push(trigger);
        await this.handleTrigger(trigger);
      }
    }

    return triggers;
  }

  /**
   * Calculate unrealized PnL for a position
   */
  static calculateUnrealizedPnL(position: PositionStatus): PnLCalculation {
    const { entryPrice, currentPrice, totalAmount, leverage, direction } = position;

    return this.calculatePnLWithDetails(entryPrice, currentPrice, totalAmount, leverage, direction);
  }

  /**
   * Get full position status
   */
  static async getPositionStatus(positionId: string): Promise<PositionStatus | null> {
    // Check cache first
    const cached = monitoredPositions.get(positionId);
    if (cached) {
      return { ...cached };
    }

    // Fetch from database
    const position = await db.position.findUnique({
      where: { id: positionId },
    });

    if (!position) return null;

    // Get current price
    const currentPrice = position.currentPrice ?? await this.fetchPriceFromDb(position.symbol);

    const direction = position.direction as "LONG" | "SHORT";
    const status: PositionStatus = {
      positionId: position.id,
      symbol: position.symbol,
      direction,
      status: position.status as PositionStatus["status"],
      entryPrice: position.avgEntryPrice,
      currentPrice,
      highestPrice: position.highestPrice ?? position.avgEntryPrice,
      lowestPrice: position.lowestPrice ?? position.avgEntryPrice,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      unrealizedPnl: position.unrealizedPnl,
      unrealizedPnlPercent: 0,
      realizedPnl: position.realizedPnl,
      totalAmount: position.totalAmount,
      filledAmount: position.filledAmount,
      leverage: position.leverage,
      trailingStopActive: position.trailingActivated,
      lastUpdateAt: position.updatedAt,
      monitoringStartedAt: position.createdAt,
    };

    // Calculate PnL
    const pnlCalc = this.calculateUnrealizedPnL(status);
    status.unrealizedPnl = pnlCalc.pnl;
    status.unrealizedPnlPercent = pnlCalc.pnlPercent;

    return status;
  }

  /**
   * Batch process all active positions
   */
  static async processAllPositions(): Promise<{
    processed: number;
    triggers: PositionTrigger[];
    errors: string[];
  }> {
    const startTimeMs = Date.now();
    const triggers: PositionTrigger[] = [];
    const errors: string[] = [];
    let processed = 0;

    try {
      // Get all open positions from database
      const positions = await db.position.findMany({
        where: { status: "OPEN" },
        include: {
          Signal: true,
          account: {
            select: {
              exchangeId: true,
            },
          },
        },
        take: this.config.maxBatchSize,
      });

      for (const position of positions) {
        try {
          // Ensure position is being monitored
          if (!monitoredPositions.has(position.id)) {
            await this.startMonitoring(position.id);
          }

          // Update price
          const currentPrice = await this.fetchPrice(position.symbol, position.account?.exchangeId);
          await this.updatePositionPrice(position.id, currentPrice);

          // Check triggers
          const positionTriggers = await this.checkTriggers(position.id);
          triggers.push(...positionTriggers);

          // Process trailing stop if enabled
          if (this.config.enableTrailingStop && (position.trailingStop || position.trailingActivated)) {
            await this.processTrailingStop(position.id, currentPrice);
          }

          // Check multiple TP targets from signal
          if (position.Signal?.takeProfits) {
            const tpTriggers = await this.checkMultipleTPs(position.id, position.Signal.takeProfits, currentPrice);
            triggers.push(...tpTriggers);
          }

          processed++;
        } catch (error) {
          const errorMsg = `Error processing position ${position.id}: ${error instanceof Error ? error.message : "Unknown"}`;
          errors.push(errorMsg);
          errorCount++;
          console.error(`[PositionMonitoring] ${errorMsg}`);
        }
      }

      // Update stats
      processCount++;
      totalProcessingTimeMs += Date.now() - startTimeMs;

      return { processed, triggers, errors };
    } catch (error) {
      const errorMsg = `Batch processing error: ${error instanceof Error ? error.message : "Unknown"}`;
      errors.push(errorMsg);
      errorCount++;
      return { processed, triggers, errors };
    }
  }

  /**
   * Get monitoring statistics
   */
  static getMonitoringStats(): MonitoringStats {
    const activePositions = Array.from(monitoredPositions.values()).filter(p => p.status === "OPEN").length;
    const closedPositions = Array.from(monitoredPositions.values()).filter(p => p.status !== "OPEN").length;

    return {
      totalPositions: monitoredPositions.size,
      activePositions,
      closedPositions,
      tpHitCount: closedPositions, // Simplified
      slHitCount: 0,
      trailingStopUpdates: 0,
      liquidationWarnings: 0,
      errors: errorCount,
      lastProcessTime: null,
      averageProcessingTimeMs: processCount > 0 ? totalProcessingTimeMs / processCount : 0,
      uptimeSeconds: startTime ? (Date.now() - startTime.getTime()) / 1000 : 0,
    };
  }

  // ==================== EVENT HANDLING ====================

  /**
   * Subscribe to position trigger events
   */
  static subscribeToTriggers(callback: (trigger: PositionTrigger) => void | Promise<void>): () => void {
    eventSubscribers.add(callback);
    return () => eventSubscribers.delete(callback);
  }

  /**
   * Handle a trigger event
   */
  private static async handleTrigger(trigger: PositionTrigger): Promise<void> {
    // Emit to subscribers
    const promises = Array.from(eventSubscribers).map(async (callback) => {
      try {
        await callback(trigger);
      } catch (error) {
        console.error("[PositionMonitoring] Subscriber error:", error);
      }
    });

    await Promise.allSettled(promises);

    // Handle specific trigger types
    switch (trigger.type) {
      case "SL_HIT":
      case "TP_HIT":
        await this.closePositionOnTrigger(trigger);
        break;

      case "LIQUIDATION_WARNING":
        await this.sendLiquidationWarning(trigger);
        break;
    }
  }

  /**
   * Close position when TP/SL is hit
   */
  private static async closePositionOnTrigger(trigger: PositionTrigger): Promise<void> {
    try {
      const position = await db.position.findUnique({
        where: { id: trigger.positionId },
        include: { Signal: true },
      });

      if (!position) return;

      // Update position status
      await db.position.update({
        where: { id: trigger.positionId },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closeReason: trigger.type === "SL_HIT" ? "SL" : "TP",
          unrealizedPnl: trigger.pnl,
          currentPrice: trigger.triggerPrice,
        },
      });

      // Update signal if exists
      if (position.Signal) {
        await db.signal.update({
          where: { id: position.Signal.id },
          data: {
            status: trigger.type === "SL_HIT" ? "SL_HIT" : "TP_HIT",
            closedAt: new Date(),
            closeReason: trigger.type === "SL_HIT" ? "STOP_LOSS" : "TAKE_PROFIT",
          },
        });
      }

      // Create trade record
      const accountId = position.accountId;
      const userId = position.Signal?.userId ?? null;

      if (userId && accountId) {
        await db.trade.create({
          data: {
            userId,
            accountId,
            symbol: position.symbol,
            direction: position.direction,
            status: "CLOSED",
            entryPrice: position.avgEntryPrice,
            exitPrice: trigger.triggerPrice,
            exitTime: new Date(),
            amount: position.totalAmount,
            leverage: position.leverage,
            pnl: trigger.pnl,
            pnlPercent: trigger.pnlPercent,
            closeReason: trigger.type === "SL_HIT" ? "SL" : "TP",
            isDemo: position.isDemo,
            signalId: position.Signal?.id,
          },
        });
      }

      // Stop monitoring
      await this.stopMonitoring(trigger.positionId);

      // Send notifications
      const emoji = trigger.type === "SL_HIT" ? "🛑" : "🎯";
      const title = trigger.type === "SL_HIT" ? "Stop Loss Hit" : "Take Profit Hit";

      await notifyTelegram({
        type: trigger.type === "SL_HIT" ? "SL_HIT" : "TP_HIT",
        title: `${emoji} ${title}`,
        message: `#${position.Signal?.signalId || "?"} ${trigger.symbol} ${trigger.direction}\nPrice: $${trigger.triggerPrice.toLocaleString()}\nPnL: ${trigger.pnl >= 0 ? "+" : ""}$${trigger.pnl.toFixed(2)} (${trigger.pnlPercent >= 0 ? "+" : ""}${trigger.pnlPercent.toFixed(2)}%)`,
        data: { trigger } as Record<string, unknown>,
      });

      await notifyUI({
        type: trigger.type === "SL_HIT" ? "SL_HIT" : "TP_HIT",
        title: `${emoji} ${title}`,
        message: `${trigger.symbol} ${trigger.direction} - ${trigger.type === "SL_HIT" ? "SL" : "TP"} at $${trigger.triggerPrice.toLocaleString()}`,
        data: { trigger } as Record<string, unknown>,
      });

      console.log(`[PositionMonitoring] Position ${trigger.positionId} closed: ${trigger.type}`);
    } catch (error) {
      console.error(`[PositionMonitoring] Error closing position ${trigger.positionId}:`, error);
      errorCount++;
    }
  }

  /**
   * Send liquidation warning notification
   */
  private static async sendLiquidationWarning(trigger: PositionTrigger): Promise<void> {
    const liquidationPrice = trigger.metadata?.liquidationPrice as number | undefined;

    await notifyTelegram({
      type: "LIQUIDATION_WARNING",
      title: "⚠️ Liquidation Warning",
      message: `${trigger.symbol} ${trigger.direction}\nCurrent: $${trigger.triggerPrice.toLocaleString()}\nLiquidation: $${liquidationPrice?.toLocaleString() || "N/A"}\nPnL: ${trigger.pnlPercent.toFixed(1)}%`,
      data: { trigger } as Record<string, unknown>,
      priority: "critical",
    });

    await notifyUI({
      type: "LIQUIDATION_WARNING",
      title: "⚠️ Near Liquidation",
      message: `${trigger.symbol} ${trigger.direction} - PnL: ${trigger.pnlPercent.toFixed(1)}%`,
      data: { trigger } as Record<string, unknown>,
      priority: "critical",
    });
  }

  // ==================== TRAILING STOP ====================

  /**
   * Process trailing stop for a position
   */
  private static async processTrailingStop(positionId: string, currentPrice: number): Promise<void> {
    try {
      const position = await db.position.findUnique({
        where: { id: positionId },
        include: { Signal: true },
      });

      if (!position || !position.trailingStop) return;

      // Parse trailing config
      let targetsHit = 0;
      if (position.Signal?.takeProfits) {
        const tps = JSON.parse(position.Signal.takeProfits) as Array<{ price: number }>;
        for (const tp of tps) {
          if (position.direction === "LONG" && currentPrice >= tp.price) {
            targetsHit++;
          } else if (position.direction === "SHORT" && currentPrice <= tp.price) {
            targetsHit++;
          }
        }
      }

      // Use TrailingStopService
      const result = await TrailingStopService.processTrailingForPosition(
        positionId,
        currentPrice,
        targetsHit
      );

      if (result.stopLossUpdated && result.newStopLoss) {
        // Update monitoring state
        const monitoredPosition = monitoredPositions.get(positionId);
        if (monitoredPosition) {
          monitoredPosition.stopLoss = result.newStopLoss;
          monitoredPosition.highestPrice = result.highestPrice ?? monitoredPosition.highestPrice;
          monitoredPosition.lowestPrice = result.lowestPrice ?? monitoredPosition.lowestPrice;
          monitoredPositions.set(positionId, monitoredPosition);
        }

        console.log(`[PositionMonitoring] Trailing stop updated for ${positionId}: SL=${result.newStopLoss}`);

        // Emit event
        const trigger: PositionTrigger = {
          type: "TRAILING_STOP",
          positionId,
          symbol: position.symbol,
          direction: position.direction as "LONG" | "SHORT",
          triggerPrice: currentPrice,
          triggerValue: result.newStopLoss,
          pnl: 0,
          pnlPercent: 0,
          timestamp: new Date(),
          metadata: {
            previousStopLoss: result.previousStopLoss,
            newStopLoss: result.newStopLoss,
          },
        };

        // Notify subscribers
        await Promise.allSettled(
          Array.from(eventSubscribers).map(cb => cb(trigger).catch(() => {}))
        );
      }
    } catch (error) {
      console.error(`[PositionMonitoring] Trailing stop error for ${positionId}:`, error);
    }
  }

  /**
   * Check multiple TP targets from signal
   */
  private static async checkMultipleTPs(
    positionId: string,
    takeProfitsJson: string,
    currentPrice: number
  ): Promise<PositionTrigger[]> {
    const triggers: PositionTrigger[] = [];

    try {
      const position = await db.position.findUnique({
        where: { id: positionId },
        include: { Signal: true },
      });

      if (!position) return triggers;

      const tps = JSON.parse(takeProfitsJson) as Array<{ price: number; percentage: number }>;
      const direction = position.direction as "LONG" | "SHORT";

      for (let i = 0; i < tps.length; i++) {
        const tp = tps[i];
        const tpHit = direction === "LONG" ? currentPrice >= tp.price : currentPrice <= tp.price;

        if (tpHit) {
          const pnl = this.calculatePnL(
            position.avgEntryPrice,
            tp.price,
            position.totalAmount * (tp.percentage / 100),
            direction,
            position.leverage
          );

          const trigger: PositionTrigger = {
            type: "TP_HIT",
            positionId,
            symbol: position.symbol,
            direction,
            triggerPrice: tp.price,
            triggerValue: tp.percentage,
            triggerIndex: i + 1,
            pnl,
            pnlPercent: this.calculatePnLPercent(position.avgEntryPrice, tp.price, direction, position.leverage),
            timestamp: new Date(),
            metadata: { tpIndex: i + 1, tpPercentage: tp.percentage },
          };

          triggers.push(trigger);
          await this.handleTrigger(trigger);
        }
      }
    } catch (error) {
      console.error(`[PositionMonitoring] Error checking multiple TPs for ${positionId}:`, error);
    }

    return triggers;
  }

  // ==================== PRICE FETCHING ====================

  /**
   * Fetch price for a symbol
   */
  private static async fetchPrice(symbol: string, exchangeId?: string): Promise<number> {
    // Check cache first
    const cached = priceCache.get(symbol);
    if (cached && Date.now() - cached.timestamp.getTime() < this.config.priceUpdateIntervalMs) {
      return cached.price;
    }

    // Try to fetch from database (MarketPrice table)
    const dbPrice = await this.fetchPriceFromDb(symbol);
    if (dbPrice > 0) {
      priceCache.set(symbol, {
        symbol,
        price: dbPrice,
        timestamp: new Date(),
      });
      return dbPrice;
    }

    // Try to fetch from exchange API
    try {
      const exchangePrice = await this.fetchPriceFromExchange(symbol, exchangeId);
      if (exchangePrice > 0) {
        priceCache.set(symbol, {
          symbol,
          price: exchangePrice,
          timestamp: new Date(),
        });
        return exchangePrice;
      }
    } catch {
      // Fall through to fallback
    }

    // Fallback to cached price or return error
    if (cached) {
      return cached.price;
    }

    throw new Error(`Unable to fetch price for ${symbol}`);
  }

  /**
   * Fetch price from database (MarketPrice table)
   */
  private static async fetchPriceFromDb(symbol: string): Promise<number> {
    try {
      const marketPrice = await db.marketPrice.findUnique({
        where: { symbol },
      });
      return marketPrice?.price ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Fetch price from exchange API
   */
  private static async fetchPriceFromExchange(symbol: string, exchangeId?: string): Promise<number> {
    try {
      // Use Binance public API as fallback
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}`,
        { signal: AbortSignal.timeout(3000) }
      );

      if (response.ok) {
        const data = await response.json();
        return parseFloat(data.price);
      }
    } catch {
      // Ignore errors
    }

    return 0;
  }

  // ==================== PNL CALCULATIONS ====================

  /**
   * Calculate PnL with full details
   */
  private static calculatePnLWithDetails(
    entryPrice: number,
    currentPrice: number,
    amount: number,
    leverage: number,
    direction: "LONG" | "SHORT"
  ): PnLCalculation {
    const priceChangePercent = direction === "LONG"
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;

    const pnlPercent = priceChangePercent * leverage;
    const pnl = amount * entryPrice * (pnlPercent / 100);

    return {
      entryPrice,
      currentPrice,
      amount,
      leverage,
      direction,
      pnl,
      pnlPercent,
      priceChangePercent,
    };
  }

  /**
   * Calculate simple PnL
   */
  private static calculatePnL(
    entryPrice: number,
    exitPrice: number,
    amount: number,
    direction: "LONG" | "SHORT",
    leverage: number
  ): number {
    const priceChange = direction === "LONG"
      ? (exitPrice - entryPrice) / entryPrice
      : (entryPrice - exitPrice) / entryPrice;

    return amount * entryPrice * priceChange * leverage;
  }

  /**
   * Calculate PnL percentage
   */
  private static calculatePnLPercent(
    entryPrice: number,
    currentPrice: number,
    direction: "LONG" | "SHORT",
    leverage: number
  ): number {
    const priceChange = direction === "LONG"
      ? (currentPrice - entryPrice) / entryPrice
      : (entryPrice - currentPrice) / entryPrice;

    return priceChange * leverage * 100;
  }

  /**
   * Calculate liquidation price
   */
  private static calculateLiquidationPrice(
    entryPrice: number,
    direction: "LONG" | "SHORT",
    leverage: number
  ): number {
    // Assuming 100% liquidation (losing 100% / leverage)
    const liquidationDistance = 1 / leverage;

    return direction === "LONG"
      ? entryPrice * (1 - liquidationDistance)
      : entryPrice * (1 + liquidationDistance);
  }

  // ==================== GLOBAL MONITORING ====================

  /**
   * Start global monitoring loop
   */
  static startGlobalMonitoring(): void {
    if (globalMonitorInterval) {
      console.log("[PositionMonitoring] Global monitoring already running");
      return;
    }

    startTime = new Date();
    console.log("[PositionMonitoring] Starting global monitoring...");

    globalMonitorInterval = setInterval(async () => {
      if (isGlobalMonitoring) return;
      isGlobalMonitoring = true;

      try {
        await this.processAllPositions();
      } catch (error) {
        console.error("[PositionMonitoring] Global monitoring error:", error);
      } finally {
        isGlobalMonitoring = false;
      }
    }, this.config.monitorIntervalMs);

    // Run first process immediately
    this.processAllPositions().catch(console.error);
  }

  /**
   * Stop global monitoring
   */
  static stopGlobalMonitoring(): void {
    if (globalMonitorInterval) {
      clearInterval(globalMonitorInterval);
      globalMonitorInterval = null;
      console.log("[PositionMonitoring] Global monitoring stopped");
    }

    // Clear all position monitors
    for (const positionId of monitoredPositions.keys()) {
      this.stopMonitoring(positionId);
    }
  }

  /**
   * Check if global monitoring is active
   */
  static isMonitoring(): boolean {
    return globalMonitorInterval !== null;
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get all monitored positions
   */
  static getAllMonitoredPositions(): PositionStatus[] {
    return Array.from(monitoredPositions.values());
  }

  /**
   * Clear all monitoring state (for testing/reset)
   */
  static reset(): void {
    this.stopGlobalMonitoring();
    monitoredPositions.clear();
    monitoringIntervals.clear();
    priceCache.clear();
    eventSubscribers.clear();
    this.exchangeClients.clear();
    processCount = 0;
    totalProcessingTimeMs = 0;
    errorCount = 0;
    startTime = null;
  }

  /**
   * Update price cache from external source (e.g., WebSocket)
   */
  static updatePriceCache(symbol: string, price: number, bidPrice?: number, askPrice?: number): void {
    priceCache.set(symbol, {
      symbol,
      price,
      bidPrice,
      askPrice,
      timestamp: new Date(),
    });
  }

  /**
   * Get cached price
   */
  static getCachedPrice(symbol: string): number | null {
    const cached = priceCache.get(symbol);
    return cached?.price ?? null;
  }
}

// ==================== EXPORTS ====================

export default PositionMonitoringService;

// Re-export types
export type {
  PositionMonitorConfig,
  PositionStatus,
  PositionTrigger,
  MonitoringStats,
  PriceData,
  PnLCalculation,
};
