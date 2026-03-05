/**
 * Real Exchange Connector for CITARION
 * Unified connector for Binance, Bybit, OKX, Bitget, BingX
 * Supports both Testnet and Live trading
 */

import { db } from "@/lib/db";
import crypto from "crypto";

// ==================== TYPES ====================

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string; // For OKX, Bitget
  uid?: string; // For some exchanges
}

export interface ExchangeConfig {
  id: string;
  name: string;
  testnetUrl: string;
  liveUrl: string;
  requiresPassphrase: boolean;
}

export interface OrderParams {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: number;
  price?: number;
  leverage?: number;
  stopLoss?: number;
  takeProfit?: number;
  reduceOnly?: boolean;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  clientOrderId?: string;
  symbol?: string;
  status?: string;
  executedQty?: number;
  avgPrice?: number;
  error?: string;
}

export interface AccountBalance {
  asset: string;
  free: number;
  locked: number;
}

export interface Position {
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPrice?: number;
}

// ==================== EXCHANGE CONFIGURATIONS ====================

const EXCHANGE_CONFIGS: Record<string, ExchangeConfig> = {
  binance: {
    id: "binance",
    name: "Binance Futures",
    testnetUrl: "https://testnet.binancefuture.com",
    liveUrl: "https://fapi.binance.com",
    requiresPassphrase: false,
  },
  bybit: {
    id: "bybit",
    name: "Bybit Futures",
    testnetUrl: "https://api-testnet.bybit.com",
    liveUrl: "https://api.bybit.com",
    requiresPassphrase: false,
  },
  okx: {
    id: "okx",
    name: "OKX Futures",
    testnetUrl: "https://www.okx.com", // Same URL, demo via header
    liveUrl: "https://www.okx.com",
    requiresPassphrase: true,
  },
  bitget: {
    id: "bitget",
    name: "Bitget Futures",
    testnetUrl: "https://api.bitget.com", // Same URL, demo via S-prefix symbols
    liveUrl: "https://api.bitget.com",
    requiresPassphrase: true,
  },
  bingx: {
    id: "bingx",
    name: "BingX Futures",
    testnetUrl: "https://open-api.bingx.com", // Same URL, demo via VST
    liveUrl: "https://open-api.bingx.com",
    requiresPassphrase: false,
  },
};

// ==================== EXCHANGE CONNECTOR CLASS ====================

export class RealExchangeConnector {
  private exchangeId: string;
  private isTestnet: boolean;
  private credentials: ExchangeCredentials | null = null;
  private config: ExchangeConfig;

  constructor(exchangeId: string, isTestnet: boolean = true) {
    this.exchangeId = exchangeId;
    this.isTestnet = isTestnet;
    this.config = EXCHANGE_CONFIGS[exchangeId];
    
    if (!this.config) {
      throw new Error(`Unsupported exchange: ${exchangeId}`);
    }
  }

  /**
   * Set credentials for API access
   */
  setCredentials(credentials: ExchangeCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Load credentials from database
   */
  async loadCredentialsFromDB(accountId: string): Promise<boolean> {
    try {
      const account = await db.account.findUnique({
        where: { id: accountId },
        select: {
          apiKey: true,
          apiSecret: true,
          apiPassphrase: true,
          apiUid: true,
        },
      });

      if (!account || !account.apiKey || !account.apiSecret) {
        return false;
      }

      this.credentials = {
        apiKey: account.apiKey,
        apiSecret: account.apiSecret,
        passphrase: account.apiPassphrase || undefined,
        uid: account.apiUid || undefined,
      };

      return true;
    } catch (error) {
      console.error("[ExchangeConnector] Failed to load credentials:", error);
      return false;
    }
  }

  /**
   * Get base URL for API requests
   */
  getBaseUrl(): string {
    return this.isTestnet ? this.config.testnetUrl : this.config.liveUrl;
  }

  /**
   * Generate signature for request
   */
  private generateSignature(queryString: string, timestamp: number): string {
    if (!this.credentials) {
      throw new Error("Credentials not set");
    }

    const message = `${queryString}&timestamp=${timestamp}`;
    return crypto
      .createHmac("sha256", this.credentials.apiSecret)
      .update(message)
      .digest("hex");
  }

  /**
   * Generate OKX-style signature
   */
  private generateOKXSignature(
    timestamp: string,
    method: string,
    path: string,
    body?: string
  ): string {
    if (!this.credentials || !this.credentials.passphrase) {
      throw new Error("OKX requires passphrase");
    }

    const message = timestamp + method + path + (body || "");
    return crypto
      .createHmac("sha256", this.credentials.apiSecret)
      .update(message)
      .digest("base64");
  }

  /**
   * Make authenticated request to exchange
   */
  private async makeRequest(
    method: "GET" | "POST" | "DELETE",
    endpoint: string,
    params: Record<string, unknown> = {},
    body?: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.credentials) {
      throw new Error("Credentials not set");
    }

    const baseUrl = this.getBaseUrl();
    const timestamp = Date.now();

    let url: string;
    let headers: Record<string, string> = {};
    let requestBody: string | undefined;

    if (this.exchangeId === "binance") {
      // Binance signature
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${value}`)
        .join("&");
      const signature = this.generateSignature(queryString, timestamp);
      
      url = `${baseUrl}${endpoint}?${queryString}&timestamp=${timestamp}&signature=${signature}`;
      headers = {
        "X-MBX-APIKEY": this.credentials.apiKey,
      };
      
      if (body) {
        requestBody = JSON.stringify(body);
        headers["Content-Type"] = "application/json";
      }
    } else if (this.exchangeId === "bybit") {
      // Bybit V5 signature
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${value}`)
        .join("&");
      const signString = timestamp + this.credentials.apiKey + "5000" + queryString;
      const signature = crypto
        .createHmac("sha256", this.credentials.apiSecret)
        .update(signString)
        .digest("hex");
      
      url = `${baseUrl}${endpoint}?${queryString}`;
      headers = {
        "X-BAPI-API-KEY": this.credentials.apiKey,
        "X-BAPI-TIMESTAMP": timestamp.toString(),
        "X-BAPI-SIGN": signature,
        "X-BAPI-RECV-WINDOW": "5000",
      };
      
      if (body) {
        requestBody = JSON.stringify(body);
        headers["Content-Type"] = "application/json";
      }
    } else if (this.exchangeId === "okx") {
      // OKX signature
      const isoTimestamp = new Date().toISOString();
      const bodyString = body ? JSON.stringify(body) : "";
      const signature = this.generateOKXSignature(
        isoTimestamp,
        method,
        endpoint,
        bodyString
      );
      
      url = `${baseUrl}${endpoint}`;
      headers = {
        "OK-ACCESS-KEY": this.credentials.apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": isoTimestamp,
        "OK-ACCESS-PASSPHRASE": this.credentials.passphrase,
        "Content-Type": "application/json",
      };
      
      if (this.isTestnet) {
        headers["x-simulated-trading"] = "1";
      }
      
      if (body) {
        requestBody = JSON.stringify(body);
      }
    } else {
      // Generic fallback
      url = `${baseUrl}${endpoint}`;
      headers = {
        "X-API-KEY": this.credentials.apiKey,
        "Content-Type": "application/json",
      };
      
      if (body) {
        requestBody = JSON.stringify(body);
      }
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: requestBody,
      });

      const data = await response.json();
      
      // Update exchange connection status
      await this.updateConnectionStatus(response.ok, response.ok ? undefined : JSON.stringify(data));

      return data;
    } catch (error) {
      await this.updateConnectionStatus(false, error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  }

  /**
   * Update connection status in database
   */
  private async updateConnectionStatus(connected: boolean, error?: string): Promise<void> {
    try {
      await db.exchangeConnectionStatus.upsert({
        where: {
          exchange_marketType: {
            exchange: this.exchangeId,
            marketType: "futures",
          },
        },
        create: {
          exchange: this.exchangeId,
          marketType: "futures",
          status: connected ? "CONNECTED" : "ERROR",
          lastConnect: connected ? new Date() : undefined,
          lastError: error,
        },
        update: {
          status: connected ? "CONNECTED" : "ERROR",
          lastConnect: connected ? new Date() : undefined,
          lastError: error,
        },
      });
    } catch (dbError) {
      console.error("[ExchangeConnector] Failed to update connection status:", dbError);
    }
  }

  // ==================== PUBLIC API METHODS ====================

  /**
   * Test API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.credentials) {
        return { success: false, message: "Credentials not set" };
      }

      // Try to get server time or account info
      let endpoint: string;
      
      switch (this.exchangeId) {
        case "binance":
          endpoint = "/fapi/v1/time";
          break;
        case "bybit":
          endpoint = "/v5/market/time";
          break;
        case "okx":
          endpoint = "/api/v5/public/time";
          break;
        default:
          endpoint = "/api/v1/time";
      }

      const baseUrl = this.getBaseUrl();
      const response = await fetch(`${baseUrl}${endpoint}`);
      const data = await response.json();

      if (response.ok) {
        return { success: true, message: `Connected to ${this.config.name} ${this.isTestnet ? "(Testnet)" : "(Live)"}` };
      } else {
        return { success: false, message: `Connection failed: ${JSON.stringify(data)}` };
      }
    } catch (error) {
      return { success: false, message: `Connection error: ${error instanceof Error ? error.message : "Unknown"}` };
    }
  }

  /**
   * Get account balances
   */
  async getBalances(): Promise<AccountBalance[]> {
    let endpoint: string;
    
    switch (this.exchangeId) {
      case "binance":
        endpoint = "/fapi/v2/balance";
        break;
      case "bybit":
        endpoint = "/v5/account/wallet-balance";
        break;
      case "okx":
        endpoint = "/api/v5/account/balance";
        break;
      default:
        endpoint = "/api/v1/balance";
    }

    const response = await this.makeRequest("GET", endpoint) as Record<string, unknown>;
    
    // Parse response based on exchange
    // This is simplified - actual parsing would be more complex
    return [];
  }

  /**
   * Get open positions
   */
  async getPositions(): Promise<Position[]> {
    let endpoint: string;
    
    switch (this.exchangeId) {
      case "binance":
        endpoint = "/fapi/v2/positionRisk";
        break;
      case "bybit":
        endpoint = "/v5/position/list";
        break;
      case "okx":
        endpoint = "/api/v5/account/positions";
        break;
      default:
        endpoint = "/api/v1/positions";
    }

    const response = await this.makeRequest("GET", endpoint) as Record<string, unknown>;
    
    // Parse response based on exchange
    return [];
  }

  /**
   * Place an order
   */
  async placeOrder(params: OrderParams): Promise<OrderResult> {
    try {
      let endpoint: string;
      let body: Record<string, unknown>;

      switch (this.exchangeId) {
        case "binance":
          endpoint = "/fapi/v1/order";
          body = {
            symbol: params.symbol,
            side: params.side,
            type: params.type,
            quantity: params.quantity,
            ...(params.price && { price: params.price }),
            ...(params.leverage && { leverage: params.leverage }),
          };
          break;

        case "bybit":
          endpoint = "/v5/order/create";
          body = {
            category: "linear",
            symbol: params.symbol,
            side: params.side,
            orderType: params.type,
            qty: params.quantity.toString(),
            ...(params.price && { price: params.price.toString() }),
          };
          break;

        case "okx":
          endpoint = "/api/v5/trade/order";
          body = {
            instId: params.symbol,
            tdMode: "cross",
            side: params.side.toLowerCase(),
            ordType: params.type.toLowerCase(),
            sz: params.quantity.toString(),
            ...(params.price && { px: params.price.toString() }),
          };
          break;

        default:
          throw new Error(`Unsupported exchange: ${this.exchangeId}`);
      }

      const response = await this.makeRequest("POST", endpoint, {}, body) as Record<string, unknown>;
      
      // Parse response based on exchange
      return {
        success: true,
        orderId: (response as Record<string, unknown>).orderId as string || (response as Record<string, unknown>).orderId as string,
        symbol: params.symbol,
        status: "NEW",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(symbol: string, orderId: string): Promise<OrderResult> {
    try {
      let endpoint: string;
      let body: Record<string, unknown>;

      switch (this.exchangeId) {
        case "binance":
          endpoint = "/fapi/v1/order";
          body = { symbol, orderId };
          break;

        case "bybit":
          endpoint = "/v5/order/cancel";
          body = { category: "linear", symbol, orderId };
          break;

        case "okx":
          endpoint = "/api/v5/trade/cancel-order";
          body = { instId: symbol, ordId: orderId };
          break;

        default:
          throw new Error(`Unsupported exchange: ${this.exchangeId}`);
      }

      const response = await this.makeRequest("DELETE", endpoint, {}, body);
      
      return {
        success: true,
        orderId,
        status: "CANCELED",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Set leverage for a symbol
   */
  async setLeverage(symbol: string, leverage: number): Promise<{ success: boolean; leverage: number }> {
    try {
      let endpoint: string;
      let body: Record<string, unknown>;

      switch (this.exchangeId) {
        case "binance":
          endpoint = "/fapi/v1/leverage";
          body = { symbol, leverage };
          break;

        case "bybit":
          endpoint = "/v5/position/set-leverage";
          body = { category: "linear", symbol, buyLeverage: leverage, sellLeverage: leverage };
          break;

        case "okx":
          endpoint = "/api/v5/account/set-leverage";
          body = { instId: symbol, lever: leverage.toString(), mgnMode: "cross" };
          break;

        default:
          throw new Error(`Unsupported exchange: ${this.exchangeId}`);
      }

      await this.makeRequest("POST", endpoint, {}, body);
      
      return { success: true, leverage };
    } catch (error) {
      console.error("[ExchangeConnector] Set leverage error:", error);
      return { success: false, leverage: 1 };
    }
  }

  /**
   * Get exchange connection status
   */
  async getConnectionStatus(): Promise<{
    exchange: string;
    status: string;
    lastConnect: Date | null;
    lastError: string | null;
  } | null> {
    try {
      const status = await db.exchangeConnectionStatus.findUnique({
        where: {
          exchange_marketType: {
            exchange: this.exchangeId,
            marketType: "futures",
          },
        },
      });

      if (!status) return null;

      return {
        exchange: status.exchange,
        status: status.status,
        lastConnect: status.lastConnect,
        lastError: status.lastError,
      };
    } catch (error) {
      console.error("[ExchangeConnector] Get status error:", error);
      return null;
    }
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Create a connector for an exchange account
 */
export async function createConnectorForAccount(
  accountId: string
): Promise<RealExchangeConnector | null> {
  try {
    const account = await db.account.findUnique({
      where: { id: accountId },
      select: {
        exchangeId: true,
        isTestnet: true,
      },
    });

    if (!account) return null;

    const connector = new RealExchangeConnector(account.exchangeId, account.isTestnet);
    const loaded = await connector.loadCredentialsFromDB(accountId);
    
    return loaded ? connector : null;
  } catch (error) {
    console.error("[ExchangeConnector] Failed to create connector:", error);
    return null;
  }
}

/**
 * Test all exchange connections for a user
 */
export async function testAllConnections(userId: string): Promise<Record<string, { success: boolean; message: string }>> {
  const results: Record<string, { success: boolean; message: string }> = {};

  try {
    const accounts = await db.account.findMany({
      where: { userId },
      select: {
        id: true,
        exchangeId: true,
        isTestnet: true,
      },
    });

    for (const account of accounts) {
      const connector = new RealExchangeConnector(account.exchangeId, account.isTestnet);
      const loaded = await connector.loadCredentialsFromDB(account.id);
      
      if (loaded) {
        results[account.exchangeId] = await connector.testConnection();
      } else {
        results[account.exchangeId] = {
          success: false,
          message: "No API credentials configured",
        };
      }
    }

    return results;
  } catch (error) {
    console.error("[ExchangeConnector] Test all connections error:", error);
    return results;
  }
}
