/**
 * Order Fill Tracking Service
 *
 * Production-ready service for tracking order fill status and percentage.
 * Monitors order status from exchanges, calculates fill percentage,
 * tracks partial fills, and triggers callbacks on fill events.
 *
 * Features:
 * - Real-time order status tracking
 * - Fill percentage calculation
 * - Partial fill handling with detailed event tracking
 * - Callback system for fill/partial fill events
 * - Database persistence with OrderExecution model
 * - Exchange synchronization support
 */

import { EventEmitter } from 'events';
import { db } from '@/lib/db';
import { ExchangeId } from '@/lib/exchange/types';

// ==================== TYPES ====================

/**
 * Order fill status enumeration
 */
export type OrderFillStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED';

/**
 * Individual fill event from exchange
 */
export interface OrderFillEvent {
  /** Unique identifier for this fill event */
  id: string;
  /** Exchange-assigned trade ID */
  tradeId: string;
  /** Price at which the fill occurred */
  price: number;
  /** Quantity filled in this event */
  quantity: number;
  /** Fee charged for this fill */
  fee: number;
  /** Currency the fee is charged in */
  feeCurrency: string;
  /** Timestamp of the fill */
  timestamp: Date;
  /** Whether this was a maker or taker fill */
  isMaker?: boolean;
  /** Additional metadata from exchange */
  metadata?: Record<string, unknown>;
}

/**
 * Callback function type for fill events
 */
export type OrderFillCallback = (
  orderExecutionId: string,
  event: FillEventResult
) => void | Promise<void>;

/**
 * Result of a fill event processing
 */
export interface FillEventResult {
  /** Order execution ID */
  orderExecutionId: string;
  /** Current fill status */
  status: OrderFillStatus;
  /** Fill percentage (0-100) */
  fillPercentage: number;
  /** Total filled quantity */
  filledQuantity: number;
  /** Remaining quantity */
  remainingQuantity: number;
  /** Average fill price */
  avgFillPrice: number;
  /** The fill event that triggered this callback */
  fillEvent?: OrderFillEvent;
  /** All fill events for this order */
  allFills: OrderFillEvent[];
  /** Timestamp of the event */
  timestamp: Date;
  /** Whether this is a complete fill */
  isComplete: boolean;
  /** Whether this is a partial fill */
  isPartial: boolean;
}

/**
 * Configuration for fill tracking
 */
export interface FillTrackingConfig {
  /** Enable automatic exchange synchronization */
  autoSyncEnabled: boolean;
  /** Interval for automatic sync in milliseconds */
  syncIntervalMs: number;
  /** Maximum retries for failed syncs */
  maxSyncRetries: number;
  /** Enable callback emission */
  enableCallbacks: boolean;
  /** Minimum fill percentage to consider as partial (vs dust) */
  minPartialFillPercent: number;
  /** Persist fill events to database */
  persistFills: boolean;
  /** Batch size for processing pending orders */
  pendingOrderBatchSize: number;
  /** Timeout for exchange API calls in milliseconds */
  exchangeApiTimeout: number;
}

/**
 * Default configuration for fill tracking
 */
export const DEFAULT_FILL_TRACKING_CONFIG: FillTrackingConfig = {
  autoSyncEnabled: true,
  syncIntervalMs: 5000,
  maxSyncRetries: 3,
  enableCallbacks: true,
  minPartialFillPercent: 0.01,
  persistFills: true,
  pendingOrderBatchSize: 50,
  exchangeApiTimeout: 10000,
};

/**
 * Order tracking state
 */
interface OrderTrackingState {
  orderExecutionId: string;
  exchangeOrderId: string | null;
  clientOrderId: string | null;
  symbol: string;
  exchange: ExchangeId;
  side: 'BUY' | 'SELL';
  orderType: string;
  requestedAmount: number;
  filledAmount: number;
  remainingAmount: number;
  price: number | null;
  avgFillPrice: number;
  status: OrderFillStatus;
  fills: OrderFillEvent[];
  positionId: string | null;
  signalId: number | null;
  createdAt: Date;
  updatedAt: Date;
  lastSyncAt: Date | null;
  syncRetryCount: number;
}

/**
 * Exchange order status response
 */
export interface ExchangeOrderStatus {
  exchangeOrderId: string;
  clientOrderId?: string;
  symbol: string;
  status: OrderFillStatus;
  executedQty: number;
  origQty: number;
  avgPrice?: number;
  price?: number;
  type: string;
  side: 'BUY' | 'SELL';
  fills?: Array<{
    tradeId: string;
    price: number;
    qty: number;
    fee: number;
    feeCurrency: string;
    timestamp: Date;
    isMaker: boolean;
  }>;
}

// ==================== MAIN SERVICE CLASS ====================

/**
 * OrderFillTrackingService
 *
 * Main service for tracking order fill status across exchanges.
 * Provides real-time tracking, partial fill handling, and callback system.
 */
export class OrderFillTrackingService extends EventEmitter {
  private static instance: OrderFillTrackingService | null = null;
  private config: FillTrackingConfig;
  private trackedOrders: Map<string, OrderTrackingState> = new Map();
  private fillCallbacks: Map<string, Set<OrderFillCallback>> = new Map();
  private partialFillCallbacks: Map<string, Set<OrderFillCallback>> = new Map();
  private syncTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  private constructor(config: Partial<FillTrackingConfig> = {}) {
    super();
    this.config = { ...DEFAULT_FILL_TRACKING_CONFIG, ...config };
  }

  /**
   * Get singleton instance of the service
   */
  public static getInstance(config?: Partial<FillTrackingConfig>): OrderFillTrackingService {
    if (!OrderFillTrackingService.instance) {
      OrderFillTrackingService.instance = new OrderFillTrackingService(config);
    }
    return OrderFillTrackingService.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  public static resetInstance(): void {
    if (OrderFillTrackingService.instance) {
      OrderFillTrackingService.instance.stop();
      OrderFillTrackingService.instance = null;
    }
  }

  // ==================== LIFECYCLE METHODS ====================

  /**
   * Start the tracking service
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // Load pending orders from database
    await this.loadPendingOrders();

    // Start automatic sync if enabled
    if (this.config.autoSyncEnabled) {
      this.startAutoSync();
    }

    this.emit('service:started');
  }

  /**
   * Stop the tracking service
   */
  public stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Stop auto sync
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    this.emit('service:stopped');
  }

  /**
   * Load pending orders from database
   */
  private async loadPendingOrders(): Promise<void> {
    try {
      const pendingExecutions = await db.orderExecution.findMany({
        where: {
          status: {
            in: ['PENDING', 'SUBMITTED', 'PARTIALLY_FILLED'],
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      for (const execution of pendingExecutions) {
        const state: OrderTrackingState = {
          orderExecutionId: execution.id,
          exchangeOrderId: execution.exchangeOrderId,
          clientOrderId: execution.clientOrderId,
          symbol: execution.symbol,
          exchange: execution.exchange as ExchangeId,
          side: execution.side as 'BUY' | 'SELL',
          orderType: execution.type,
          requestedAmount: execution.requestedAmount,
          filledAmount: execution.filledAmount,
          remainingAmount: execution.remainingAmount,
          price: execution.price,
          avgFillPrice: execution.avgFillPrice ?? 0,
          status: execution.status as OrderFillStatus,
          fills: this.parseFillsFromMetadata(execution.metadata),
          positionId: execution.positionId,
          signalId: execution.signalId,
          createdAt: execution.createdAt,
          updatedAt: execution.updatedAt,
          lastSyncAt: null,
          syncRetryCount: 0,
        };

        this.trackedOrders.set(execution.id, state);
      }

      this.emit('orders:loaded', { count: pendingExecutions.length });
    } catch (error) {
      this.emit('error', {
        message: 'Failed to load pending orders',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Start automatic sync timer
   */
  private startAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      this.processPendingOrders().catch((error) => {
        this.emit('error', {
          message: 'Error in auto sync',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, this.config.syncIntervalMs);
  }

  // ==================== ORDER TRACKING METHODS ====================

  /**
   * Start tracking an order
   */
  public async trackOrder(orderExecutionId: string): Promise<{
    success: boolean;
    error?: string;
    state?: OrderTrackingState;
  }> {
    try {
      // Check if already tracking
      if (this.trackedOrders.has(orderExecutionId)) {
        return {
          success: true,
          state: this.trackedOrders.get(orderExecutionId),
        };
      }

      // Load from database
      const execution = await db.orderExecution.findUnique({
        where: { id: orderExecutionId },
      });

      if (!execution) {
        return {
          success: false,
          error: `Order execution not found: ${orderExecutionId}`,
        };
      }

      // Create tracking state
      const state: OrderTrackingState = {
        orderExecutionId: execution.id,
        exchangeOrderId: execution.exchangeOrderId,
        clientOrderId: execution.clientOrderId,
        symbol: execution.symbol,
        exchange: execution.exchange as ExchangeId,
        side: execution.side as 'BUY' | 'SELL',
        orderType: execution.type,
        requestedAmount: execution.requestedAmount,
        filledAmount: execution.filledAmount,
        remainingAmount: execution.remainingAmount,
        price: execution.price,
        avgFillPrice: execution.avgFillPrice ?? 0,
        status: execution.status as OrderFillStatus,
        fills: this.parseFillsFromMetadata(execution.metadata),
        positionId: execution.positionId,
        signalId: execution.signalId,
        createdAt: execution.createdAt,
        updatedAt: execution.updatedAt,
        lastSyncAt: null,
        syncRetryCount: 0,
      };

      this.trackedOrders.set(orderExecutionId, state);

      this.emit('order:tracked', {
        orderExecutionId,
        symbol: state.symbol,
        exchange: state.exchange,
      });

      return {
        success: true,
        state,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Stop tracking an order
   */
  public untrackOrder(orderExecutionId: string): void {
    this.trackedOrders.delete(orderExecutionId);
    this.fillCallbacks.delete(orderExecutionId);
    this.partialFillCallbacks.delete(orderExecutionId);

    this.emit('order:untracked', { orderExecutionId });
  }

  // ==================== STATUS UPDATE METHODS ====================

  /**
   * Update order status from exchange
   */
  public async updateOrderStatus(
    orderExecutionId: string,
    status: OrderFillStatus,
    exchangeData?: Partial<ExchangeOrderStatus>
  ): Promise<{
    success: boolean;
    error?: string;
    result?: FillEventResult;
  }> {
    try {
      const state = this.trackedOrders.get(orderExecutionId);

      if (!state) {
        // Try to load from database
        const loadResult = await this.trackOrder(orderExecutionId);
        if (!loadResult.success || !loadResult.state) {
          return {
            success: false,
            error: `Order not being tracked: ${orderExecutionId}`,
          };
        }
      }

      const currentState = this.trackedOrders.get(orderExecutionId)!;
      const previousStatus = currentState.status;

      // Update state
      currentState.status = status;
      currentState.updatedAt = new Date();

      if (exchangeData) {
        if (exchangeData.executedQty !== undefined) {
          currentState.filledAmount = exchangeData.executedQty;
          currentState.remainingAmount = currentState.requestedAmount - exchangeData.executedQty;
        }
        if (exchangeData.avgPrice !== undefined) {
          currentState.avgFillPrice = exchangeData.avgPrice;
        }
        if (exchangeData.exchangeOrderId) {
          currentState.exchangeOrderId = exchangeData.exchangeOrderId;
        }
      }

      // Persist to database
      if (this.config.persistFills) {
        await this.persistOrderState(currentState);
      }

      // Calculate fill percentage
      const fillPercentage = this.calculateFillPercentage(orderExecutionId);

      // Create result
      const result: FillEventResult = {
        orderExecutionId,
        status: currentState.status,
        fillPercentage,
        filledQuantity: currentState.filledAmount,
        remainingQuantity: currentState.remainingAmount,
        avgFillPrice: currentState.avgFillPrice,
        allFills: [...currentState.fills],
        timestamp: new Date(),
        isComplete: currentState.status === 'FILLED',
        isPartial:
          currentState.status === 'PARTIALLY_FILLED' ||
          (currentState.filledAmount > 0 &&
            currentState.filledAmount < currentState.requestedAmount),
      };

      // Emit status change event
      this.emit('order:status_changed', {
        orderExecutionId,
        previousStatus,
        newStatus: status,
        result,
      });

      // Trigger callbacks based on status
      if (this.config.enableCallbacks) {
        if (status === 'FILLED' && previousStatus !== 'FILLED') {
          await this.triggerFillCallbacks(orderExecutionId, result);
        } else if (
          status === 'PARTIALLY_FILLED' ||
          (exchangeData?.executedQty !== undefined &&
            exchangeData.executedQty > currentState.filledAmount - (exchangeData.executedQty || 0))
        ) {
          await this.triggerPartialFillCallbacks(orderExecutionId, result);
        }
      }

      return {
        success: true,
        result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Process a fill event from exchange
   */
  public async processFillEvent(
    orderExecutionId: string,
    fillEvent: OrderFillEvent
  ): Promise<{
    success: boolean;
    error?: string;
    result?: FillEventResult;
  }> {
    try {
      const state = this.trackedOrders.get(orderExecutionId);

      if (!state) {
        return {
          success: false,
          error: `Order not being tracked: ${orderExecutionId}`,
        };
      }

      // Add fill event to history
      state.fills.push(fillEvent);
      state.updatedAt = new Date();

      // Recalculate totals
      const totalFilled = state.fills.reduce((sum, f) => sum + f.quantity, 0);
      const totalFees = state.fills.reduce((sum, f) => sum + f.fee, 0);

      // Calculate weighted average price
      const avgPrice = this.calculateWeightedAvgPrice(state.fills);

      state.filledAmount = totalFilled;
      state.remainingAmount = state.requestedAmount - totalFilled;
      state.avgFillPrice = avgPrice;

      // Update status based on fill
      const previousStatus = state.status;
      if (totalFilled >= state.requestedAmount) {
        state.status = 'FILLED';
      } else if (totalFilled > 0) {
        state.status = 'PARTIALLY_FILLED';
      }

      // Persist to database
      if (this.config.persistFills) {
        await this.persistOrderState(state, totalFees);
      }

      // Calculate fill percentage
      const fillPercentage = this.calculateFillPercentage(orderExecutionId);

      // Create result
      const result: FillEventResult = {
        orderExecutionId,
        status: state.status,
        fillPercentage,
        filledQuantity: state.filledAmount,
        remainingQuantity: state.remainingAmount,
        avgFillPrice: state.avgFillPrice,
        fillEvent,
        allFills: [...state.fills],
        timestamp: new Date(),
        isComplete: state.status === 'FILLED',
        isPartial:
          state.status === 'PARTIALLY_FILLED' ||
          (state.filledAmount > 0 && state.filledAmount < state.requestedAmount),
      };

      // Emit fill received event
      this.emit('fill:received', {
        orderExecutionId,
        fillEvent,
        result,
      });

      // Trigger callbacks
      if (this.config.enableCallbacks) {
        if (state.status === 'FILLED' && previousStatus !== 'FILLED') {
          await this.triggerFillCallbacks(orderExecutionId, result);
        } else {
          await this.triggerPartialFillCallbacks(orderExecutionId, result);
        }
      }

      return {
        success: true,
        result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==================== CALCULATION METHODS ====================

  /**
   * Calculate fill percentage for an order
   */
  public calculateFillPercentage(orderExecutionId: string): number {
    const state = this.trackedOrders.get(orderExecutionId);

    if (!state || state.requestedAmount <= 0) {
      return 0;
    }

    const percentage = (state.filledAmount / state.requestedAmount) * 100;
    return Math.min(100, Math.max(0, percentage));
  }

  /**
   * Calculate weighted average price from fills
   */
  private calculateWeightedAvgPrice(fills: OrderFillEvent[]): number {
    if (fills.length === 0) return 0;

    let totalValue = 0;
    let totalQuantity = 0;

    for (const fill of fills) {
      totalValue += fill.price * fill.quantity;
      totalQuantity += fill.quantity;
    }

    return totalQuantity > 0 ? totalValue / totalQuantity : 0;
  }

  // ==================== CALLBACK METHODS ====================

  /**
   * Register a callback for complete fill events
   */
  public onFill(orderExecutionId: string, callback: OrderFillCallback): () => void {
    if (!this.fillCallbacks.has(orderExecutionId)) {
      this.fillCallbacks.set(orderExecutionId, new Set());
    }

    this.fillCallbacks.get(orderExecutionId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.fillCallbacks.get(orderExecutionId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.fillCallbacks.delete(orderExecutionId);
        }
      }
    };
  }

  /**
   * Register a callback for partial fill events
   */
  public onPartialFill(orderExecutionId: string, callback: OrderFillCallback): () => void {
    if (!this.partialFillCallbacks.has(orderExecutionId)) {
      this.partialFillCallbacks.set(orderExecutionId, new Set());
    }

    this.partialFillCallbacks.get(orderExecutionId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.partialFillCallbacks.get(orderExecutionId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.partialFillCallbacks.delete(orderExecutionId);
        }
      }
    };
  }

  /**
   * Trigger fill callbacks
   */
  private async triggerFillCallbacks(
    orderExecutionId: string,
    result: FillEventResult
  ): Promise<void> {
    const callbacks = this.fillCallbacks.get(orderExecutionId);
    if (!callbacks || callbacks.size === 0) return;

    const promises: Promise<void>[] = [];

    for (const callback of callbacks) {
      try {
        const cbResult = callback(orderExecutionId, result);
        if (cbResult instanceof Promise) {
          promises.push(cbResult);
        }
      } catch (error) {
        this.emit('callback:error', {
          orderExecutionId,
          error: error instanceof Error ? error.message : 'Callback error',
        });
      }
    }

    await Promise.allSettled(promises);

    this.emit('fill:complete', { orderExecutionId, result });
  }

  /**
   * Trigger partial fill callbacks
   */
  private async triggerPartialFillCallbacks(
    orderExecutionId: string,
    result: FillEventResult
  ): Promise<void> {
    const callbacks = this.partialFillCallbacks.get(orderExecutionId);
    if (!callbacks || callbacks.size === 0) return;

    const promises: Promise<void>[] = [];

    for (const callback of callbacks) {
      try {
        const cbResult = callback(orderExecutionId, result);
        if (cbResult instanceof Promise) {
          promises.push(cbResult);
        }
      } catch (error) {
        this.emit('callback:error', {
          orderExecutionId,
          error: error instanceof Error ? error.message : 'Callback error',
        });
      }
    }

    await Promise.allSettled(promises);

    this.emit('fill:partial', { orderExecutionId, result });
  }

  // ==================== QUERY METHODS ====================

  /**
   * Get fill history for an order
   */
  public async getOrderFills(orderExecutionId: string): Promise<{
    success: boolean;
    error?: string;
    fills?: OrderFillEvent[];
    state?: OrderTrackingState;
  }> {
    try {
      // Check if tracking
      let state = this.trackedOrders.get(orderExecutionId);

      if (!state) {
        // Try to load from database
        const execution = await db.orderExecution.findUnique({
          where: { id: orderExecutionId },
        });

        if (!execution) {
          return {
            success: false,
            error: `Order execution not found: ${orderExecutionId}`,
          };
        }

        state = {
          orderExecutionId: execution.id,
          exchangeOrderId: execution.exchangeOrderId,
          clientOrderId: execution.clientOrderId,
          symbol: execution.symbol,
          exchange: execution.exchange as ExchangeId,
          side: execution.side as 'BUY' | 'SELL',
          orderType: execution.type,
          requestedAmount: execution.requestedAmount,
          filledAmount: execution.filledAmount,
          remainingAmount: execution.remainingAmount,
          price: execution.price,
          avgFillPrice: execution.avgFillPrice ?? 0,
          status: execution.status as OrderFillStatus,
          fills: this.parseFillsFromMetadata(execution.metadata),
          positionId: execution.positionId,
          signalId: execution.signalId,
          createdAt: execution.createdAt,
          updatedAt: execution.updatedAt,
          lastSyncAt: null,
          syncRetryCount: 0,
        };
      }

      return {
        success: true,
        fills: [...state.fills],
        state,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all tracked orders
   */
  public getTrackedOrders(): OrderTrackingState[] {
    return Array.from(this.trackedOrders.values());
  }

  /**
   * Get orders by status
   */
  public getOrdersByStatus(status: OrderFillStatus): OrderTrackingState[] {
    return Array.from(this.trackedOrders.values()).filter((s) => s.status === status);
  }

  /**
   * Get fill summary for an order
   */
  public getFillSummary(orderExecutionId: string): {
    orderExecutionId: string;
    status: OrderFillStatus;
    fillPercentage: number;
    filledQuantity: number;
    remainingQuantity: number;
    avgFillPrice: number;
    fillCount: number;
    totalFees: number;
  } | null {
    const state = this.trackedOrders.get(orderExecutionId);
    if (!state) return null;

    return {
      orderExecutionId,
      status: state.status,
      fillPercentage: this.calculateFillPercentage(orderExecutionId),
      filledQuantity: state.filledAmount,
      remainingQuantity: state.remainingAmount,
      avgFillPrice: state.avgFillPrice,
      fillCount: state.fills.length,
      totalFees: state.fills.reduce((sum, f) => sum + f.fee, 0),
    };
  }

  // ==================== EXCHANGE SYNC METHODS ====================

  /**
   * Sync order status with exchange
   */
  public async syncWithExchange(orderExecutionId: string): Promise<{
    success: boolean;
    error?: string;
    result?: FillEventResult;
    exchangeStatus?: ExchangeOrderStatus;
  }> {
    try {
      const state = this.trackedOrders.get(orderExecutionId);

      if (!state) {
        return {
          success: false,
          error: `Order not being tracked: ${orderExecutionId}`,
        };
      }

      if (!state.exchangeOrderId) {
        return {
          success: false,
          error: 'No exchange order ID available for sync',
        };
      }

      // Get exchange client
      const exchangeStatus = await this.fetchExchangeOrderStatus(
        state.exchange,
        state.exchangeOrderId,
        state.symbol
      );

      if (!exchangeStatus) {
        state.syncRetryCount++;
        state.lastSyncAt = new Date();

        if (state.syncRetryCount >= this.config.maxSyncRetries) {
          this.emit('sync:failed', {
            orderExecutionId,
            retries: state.syncRetryCount,
          });
        }

        return {
          success: false,
          error: 'Failed to fetch exchange status',
        };
      }

      // Update state from exchange status
      state.lastSyncAt = new Date();
      state.syncRetryCount = 0;

      const previousStatus = state.status;
      state.status = exchangeStatus.status;

      // Process fills if any
      if (exchangeStatus.fills && exchangeStatus.fills.length > 0) {
        for (const fill of exchangeStatus.fills) {
          // Check if fill already processed
          const existingFill = state.fills.find((f) => f.tradeId === fill.tradeId);
          if (!existingFill) {
            state.fills.push({
              id: `${orderExecutionId}-${fill.tradeId}`,
              tradeId: fill.tradeId,
              price: fill.price,
              quantity: fill.qty,
              fee: fill.fee,
              feeCurrency: fill.feeCurrency,
              timestamp: fill.timestamp,
              isMaker: fill.isMaker,
            });
          }
        }

        // Recalculate totals
        state.filledAmount = state.fills.reduce((sum, f) => sum + f.quantity, 0);
        state.remainingAmount = state.requestedAmount - state.filledAmount;
        state.avgFillPrice = this.calculateWeightedAvgPrice(state.fills);
      } else {
        // Use summary data from exchange
        state.filledAmount = exchangeStatus.executedQty;
        state.remainingAmount = exchangeStatus.origQty - exchangeStatus.executedQty;
        if (exchangeStatus.avgPrice) {
          state.avgFillPrice = exchangeStatus.avgPrice;
        }
      }

      // Update status based on fill
      if (state.filledAmount >= state.requestedAmount) {
        state.status = 'FILLED';
      } else if (state.filledAmount > 0) {
        state.status = 'PARTIALLY_FILLED';
      }

      state.updatedAt = new Date();

      // Persist to database
      if (this.config.persistFills) {
        await this.persistOrderState(state);
      }

      // Calculate fill percentage
      const fillPercentage = this.calculateFillPercentage(orderExecutionId);

      // Create result
      const result: FillEventResult = {
        orderExecutionId,
        status: state.status,
        fillPercentage,
        filledQuantity: state.filledAmount,
        remainingQuantity: state.remainingAmount,
        avgFillPrice: state.avgFillPrice,
        allFills: [...state.fills],
        timestamp: new Date(),
        isComplete: state.status === 'FILLED',
        isPartial:
          state.status === 'PARTIALLY_FILLED' ||
          (state.filledAmount > 0 && state.filledAmount < state.requestedAmount),
      };

      // Emit sync complete event
      this.emit('sync:complete', {
        orderExecutionId,
        previousStatus,
        newStatus: state.status,
        result,
      });

      // Trigger callbacks if status changed
      if (this.config.enableCallbacks) {
        if (state.status === 'FILLED' && previousStatus !== 'FILLED') {
          await this.triggerFillCallbacks(orderExecutionId, result);
        } else if (
          state.status === 'PARTIALLY_FILLED' &&
          previousStatus !== 'PARTIALLY_FILLED'
        ) {
          await this.triggerPartialFillCallbacks(orderExecutionId, result);
        }
      }

      return {
        success: true,
        result,
        exchangeStatus,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch order status from exchange
   */
  private async fetchExchangeOrderStatus(
    exchange: ExchangeId,
    exchangeOrderId: string,
    symbol: string
  ): Promise<ExchangeOrderStatus | null> {
    try {
      // Dynamic import of exchange client
      const exchangeClient = await this.getExchangeClient(exchange);
      if (!exchangeClient) {
        return null;
      }

      // Call exchange-specific API
      const orderStatus = await exchangeClient.getOrderStatus(exchangeOrderId, symbol);

      return this.normalizeExchangeStatus(exchange, orderStatus);
    } catch (error) {
      this.emit('exchange:error', {
        exchange,
        exchangeOrderId,
        error: error instanceof Error ? error.message : 'Exchange API error',
      });
      return null;
    }
  }

  /**
   * Get exchange client dynamically
   */
  private async getExchangeClient(
    exchange: ExchangeId
  ): Promise<{
    getOrderStatus: (orderId: string, symbol: string) => Promise<unknown>;
  } | null> {
    try {
      switch (exchange) {
        case 'binance':
        case 'binance_futures': {
          const clientModule = await import('@/lib/exchange/binance-client');
          return clientModule.BinanceClient ? new clientModule.BinanceClient() : null;
        }
        case 'bybit':
        case 'bybit_futures': {
          const clientModule = await import('@/lib/exchange/bybit-client');
          return clientModule.BybitClient ? new clientModule.BybitClient() : null;
        }
        case 'okx': {
          const clientModule = await import('@/lib/exchange/okx-client');
          return clientModule.OKXClient ? new clientModule.OKXClient() : null;
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Normalize exchange-specific status to common format
   */
  private normalizeExchangeStatus(
    exchange: ExchangeId,
    rawStatus: unknown
  ): ExchangeOrderStatus | null {
    if (!rawStatus || typeof rawStatus !== 'object') {
      return null;
    }

    const status = rawStatus as Record<string, unknown>;

    // Map exchange-specific status codes
    const mapStatus = (exchangeStatus: string): OrderFillStatus => {
      const normalized = exchangeStatus.toUpperCase();

      switch (normalized) {
        case 'NEW':
        case 'PENDING':
        case 'CREATED':
          return 'PENDING';
        case 'SUBMITTED':
        case 'OPEN':
        case 'UNFILLED':
          return 'SUBMITTED';
        case 'PARTIALLY_FILLED':
        case 'PARTIAL_FILL':
        case 'PARTIAL':
          return 'PARTIALLY_FILLED';
        case 'FILLED':
        case 'FILLED_COMPLETELY':
        case 'COMPLETE':
          return 'FILLED';
        case 'CANCELLED':
        case 'CANCELED':
          return 'CANCELLED';
        case 'REJECTED':
          return 'REJECTED';
        case 'EXPIRED':
          return 'EXPIRED';
        default:
          return 'PENDING';
      }
    };

    try {
      // Handle different exchange response formats
      switch (exchange) {
        case 'binance':
        case 'binance_futures':
          return {
            exchangeOrderId: String(status.orderId || ''),
            clientOrderId: status.clientOrderId as string | undefined,
            symbol: String(status.symbol || ''),
            status: mapStatus(String(status.status || 'PENDING')),
            executedQty: Number(status.executedQty || status.cumQty || 0),
            origQty: Number(status.origQty || status.quantity || 0),
            avgPrice: status.avgPrice ? Number(status.avgPrice) : undefined,
            price: status.price ? Number(status.price) : undefined,
            type: String(status.type || 'LIMIT'),
            side: (status.side as 'BUY' | 'SELL') || 'BUY',
            fills: Array.isArray(status.fills)
              ? status.fills.map((f: Record<string, unknown>) => ({
                  tradeId: String(f.tradeId || f.id || ''),
                  price: Number(f.price || 0),
                  qty: Number(f.qty || f.quantity || 0),
                  fee: Number(f.commission || f.fee || 0),
                  feeCurrency: String(f.commissionAsset || f.feeCurrency || 'USDT'),
                  timestamp: new Date(f.time || Date.now()),
                  isMaker: Boolean(f.maker || f.isMaker),
                }))
              : undefined,
          };

        case 'bybit':
        case 'bybit_futures':
          return {
            exchangeOrderId: String(status.orderId || ''),
            clientOrderId: status.orderLinkId as string | undefined,
            symbol: String(status.symbol || ''),
            status: mapStatus(String(status.orderStatus || status.status || 'PENDING')),
            executedQty: Number(status.cumExecQty || status.executedQty || 0),
            origQty: Number(status.qty || status.quantity || 0),
            avgPrice: status.avgPrice ? Number(status.avgPrice) : undefined,
            price: status.price ? Number(status.price) : undefined,
            type: String(status.orderType || status.type || 'LIMIT'),
            side: (status.side as 'BUY' | 'SELL') || 'BUY',
          };

        case 'okx':
          return {
            exchangeOrderId: String(status.ordId || status.orderId || ''),
            clientOrderId: status.clOrdId as string | undefined,
            symbol: String(status.instId || status.symbol || ''),
            status: mapStatus(String(status.state || status.status || 'PENDING')),
            executedQty: Number(status.fillSz || status.executedQty || 0),
            origQty: Number(status.sz || status.quantity || 0),
            avgPrice: status.avgPx ? Number(status.avgPx) : undefined,
            price: status.px ? Number(status.px) : undefined,
            type: String(status.ordType || status.type || 'LIMIT'),
            side: (status.side as 'BUY' | 'SELL') || 'BUY',
          };

        default:
          // Generic fallback
          return {
            exchangeOrderId: String(status.orderId || status.id || ''),
            clientOrderId: status.clientOrderId as string | undefined,
            symbol: String(status.symbol || ''),
            status: mapStatus(String(status.status || 'PENDING')),
            executedQty: Number(status.executedQty || status.filledQty || 0),
            origQty: Number(status.quantity || status.origQty || 0),
            avgPrice: status.avgPrice ? Number(status.avgPrice) : undefined,
            price: status.price ? Number(status.price) : undefined,
            type: String(status.type || status.orderType || 'LIMIT'),
            side: (status.side as 'BUY' | 'SELL') || 'BUY',
          };
      }
    } catch {
      return null;
    }
  }

  // ==================== BATCH PROCESSING ====================

  /**
   * Process all pending orders
   */
  public async processPendingOrders(): Promise<{
    processed: number;
    updated: number;
    errors: number;
    results: Array<{
      orderExecutionId: string;
      success: boolean;
      error?: string;
    }>;
  }> {
    const results: Array<{
      orderExecutionId: string;
      success: boolean;
      error?: string;
    }> = [];

    let updated = 0;
    let errors = 0;

    // Get orders that need syncing
    const pendingOrders = Array.from(this.trackedOrders.values())
      .filter(
        (s) =>
          s.status !== 'FILLED' &&
          s.status !== 'CANCELLED' &&
          s.status !== 'REJECTED' &&
          s.status !== 'EXPIRED' &&
          s.exchangeOrderId !== null
      )
      .slice(0, this.config.pendingOrderBatchSize);

    for (const order of pendingOrders) {
      try {
        const result = await this.syncWithExchange(order.orderExecutionId);

        results.push({
          orderExecutionId: order.orderExecutionId,
          success: result.success,
          error: result.error,
        });

        if (result.success) {
          updated++;
        } else {
          errors++;
        }
      } catch (error) {
        errors++;
        results.push({
          orderExecutionId: order.orderExecutionId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.emit('batch:processed', {
      processed: pendingOrders.length,
      updated,
      errors,
    });

    return {
      processed: pendingOrders.length,
      updated,
      errors,
      results,
    };
  }

  // ==================== PERSISTENCE METHODS ====================

  /**
   * Persist order state to database
   */
  private async persistOrderState(
    state: OrderTrackingState,
    totalFees?: number
  ): Promise<void> {
    try {
      const metadata: Record<string, unknown> = {
        fills: state.fills,
        lastSyncAt: state.lastSyncAt,
        syncRetryCount: state.syncRetryCount,
      };

      if (totalFees !== undefined) {
        metadata.totalFees = totalFees;
      }

      await db.orderExecution.update({
        where: { id: state.orderExecutionId },
        data: {
          status: state.status,
          filledAmount: state.filledAmount,
          remainingAmount: state.remainingAmount,
          avgFillPrice: state.avgFillPrice > 0 ? state.avgFillPrice : null,
          exchangeOrderId: state.exchangeOrderId,
          metadata: JSON.stringify(metadata),
          filledAt:
            state.status === 'FILLED'
              ? state.fills.length > 0
                ? state.fills[state.fills.length - 1].timestamp
                : new Date()
              : null,
          cancelledAt:
            state.status === 'CANCELLED' || state.status === 'EXPIRED' ? new Date() : null,
        },
      });
    } catch (error) {
      this.emit('persistence:error', {
        orderExecutionId: state.orderExecutionId,
        error: error instanceof Error ? error.message : 'Persistence error',
      });
    }
  }

  /**
   * Parse fills from metadata JSON
   */
  private parseFillsFromMetadata(metadata: string | null): OrderFillEvent[] {
    if (!metadata) return [];

    try {
      const parsed = JSON.parse(metadata);
      if (parsed.fills && Array.isArray(parsed.fills)) {
        return parsed.fills.map(
          (f: Record<string, unknown>): OrderFillEvent => ({
            id: String(f.id || ''),
            tradeId: String(f.tradeId || ''),
            price: Number(f.price || 0),
            quantity: Number(f.quantity || 0),
            fee: Number(f.fee || 0),
            feeCurrency: String(f.feeCurrency || 'USDT'),
            timestamp: f.timestamp ? new Date(f.timestamp as string) : new Date(),
            isMaker: Boolean(f.isMaker),
            metadata: f.metadata as Record<string, unknown> | undefined,
          })
        );
      }
      return [];
    } catch {
      return [];
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Check if status is terminal
   */
  public static isTerminalStatus(status: OrderFillStatus): boolean {
    return ['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(status);
  }

  /**
   * Check if status is active
   */
  public static isActiveStatus(status: OrderFillStatus): boolean {
    return ['PENDING', 'SUBMITTED', 'PARTIALLY_FILLED'].includes(status);
  }

  /**
   * Get current configuration
   */
  public getConfig(): FillTrackingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<FillTrackingConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart auto sync if interval changed
    if (newConfig.syncIntervalMs !== undefined && this.config.autoSyncEnabled && this.isRunning) {
      this.startAutoSync();
    }
  }

  /**
   * Clear all tracking data
   */
  public clear(): void {
    this.trackedOrders.clear();
    this.fillCallbacks.clear();
    this.partialFillCallbacks.clear();
    this.emit('service:cleared');
  }
}

// ==================== CONVENIENCE EXPORTS ====================

/**
 * Get the singleton instance
 */
export function getOrderFillTracker(): OrderFillTrackingService {
  return OrderFillTrackingService.getInstance();
}

/**
 * Initialize with custom config
 */
export function initOrderFillTracker(
  config: Partial<FillTrackingConfig>
): OrderFillTrackingService {
  return OrderFillTrackingService.getInstance(config);
}

export default OrderFillTrackingService;
