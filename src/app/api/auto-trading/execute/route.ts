/**
 * Signal Execution API Endpoint
 *
 * Execute a signal with First Entry as Market and TP Grace features
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SignalExecutionService } from "@/lib/auto-trading/signal-executor";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signalId } = body;

    if (!signalId) {
      return NextResponse.json(
        { error: "signalId is required" },
        { status: 400 }
      );
    }

    // Get signal
    const signal = await db.signal.findUnique({
      where: { signalId: parseInt(signalId) },
    });

    if (!signal) {
      return NextResponse.json(
        { error: `Signal #${signalId} not found` },
        { status: 404 }
      );
    }

    // Get bot config
    const botConfig = await db.botConfig.findFirst({
      where: { isActive: true },
    });

    if (!botConfig) {
      return NextResponse.json(
        { error: "No active bot configuration found" },
        { status: 400 }
      );
    }

    // Get market price
    const marketPrice = await db.marketPrice.findUnique({
      where: { symbol: signal.symbol },
    });

    // Get or create account
    let account = await db.account.findFirst({
      where: { accountType: "DEMO", exchangeType: "futures" },
    });

    if (!account) {
      // Create demo account
      const userId = botConfig.userId;
      account = await db.account.create({
        data: {
          userId,
          accountType: "DEMO",
          exchangeId: botConfig.exchangeId,
          exchangeType: "futures",
          exchangeName: "Binance Futures Demo",
          virtualBalance: JSON.stringify({ USDT: 10000 }),
          isActive: true,
        },
      });
    }

    // Execute signal
    const result = await SignalExecutionService.executeSignal({
      signalId: parseInt(signalId),
      botConfig: {
        id: botConfig.id,
        firstEntryAsMarket: botConfig.firstEntryAsMarket,
        firstEntryMode: botConfig.firstEntryMode,
        firstEntryMaxPriceCap: botConfig.firstEntryMaxPriceCap,
        tpGraceEnabled: botConfig.tpGraceEnabled,
        tpGraceCapPercent: botConfig.tpGraceCapPercent,
        tpGraceMaxRetries: botConfig.tpGraceMaxRetries,
        leverage: botConfig.leverage,
        tradeAmount: botConfig.tradeAmount,
        amountType: botConfig.amountType,
        exchangeId: botConfig.exchangeId,
        exchangeType: botConfig.exchangeType,
      },
      marketPrice: marketPrice?.price || 67000,
      accountId: account.id,
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error("Signal execution error:", error);
    return NextResponse.json(
      { error: "Failed to execute signal", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const signalId = searchParams.get("signalId");

  // Get execution stats
  const stats = await SignalExecutionService.getExecutionStats();

  if (signalId) {
    // Get specific signal execution info
    const signal = await db.signal.findUnique({
      where: { signalId: parseInt(signalId) },
      include: { position: true },
    });

    return NextResponse.json({
      success: true,
      signal,
      stats,
    });
  }

  return NextResponse.json({
    success: true,
    stats,
    usage: {
      POST: {
        description: "Execute a signal with auto-trading features",
        body: {
          signalId: "number - Signal ID to execute",
        },
      },
      GET: {
        description: "Get execution statistics or specific signal info",
        params: {
          signalId: "Optional - Get info for specific signal",
        },
      },
    },
  });
}
