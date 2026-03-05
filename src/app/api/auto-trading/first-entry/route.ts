/**
 * First Entry as Market API Endpoint
 *
 * Test endpoint for First Entry as Market feature
 */

import { NextRequest, NextResponse } from "next/server";
import { FirstEntryMarketService } from "@/lib/auto-trading/first-entry-market";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      entryPrice,
      marketPrice,
      direction = "LONG",
      mode = "WAIT_ENTRY",
      maxPriceCapPercent = 0.5,
    } = body;

    // Validate inputs
    if (!entryPrice || !marketPrice) {
      return NextResponse.json(
        { error: "entryPrice and marketPrice are required" },
        { status: 400 }
      );
    }

    const config = {
      enabled: true,
      mode: mode as "IMMEDIATE" | "WAIT_ENTRY",
      maxPriceCapPercent: parseFloat(maxPriceCapPercent),
    };

    // Validate config
    const validation = FirstEntryMarketService.validateConfig(config);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Invalid config", errors: validation.errors },
        { status: 400 }
      );
    }

    // Calculate entry parameters
    const calculation = FirstEntryMarketService.calculateEntryPrice(
      parseFloat(entryPrice),
      parseFloat(marketPrice),
      direction as "LONG" | "SHORT",
      config
    );

    return NextResponse.json({
      success: true,
      calculation: {
        originalEntryPrice: calculation.originalEntryPrice,
        cappedEntryPrice: calculation.cappedEntryPrice,
        currentMarketPrice: calculation.currentMarketPrice,
        priceDiffPercent: calculation.priceDiffPercent.toFixed(4),
        shouldExecute: calculation.shouldExecute,
        executionType: calculation.executionType,
        limitPrice: calculation.limitPrice,
        reason: calculation.reason,
      },
      config,
      direction,
    });

  } catch (error) {
    console.error("First Entry API error:", error);
    return NextResponse.json(
      { error: "Failed to calculate entry", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Demo calculation with default values
  const entryPrice = parseFloat(searchParams.get("entryPrice") || "67000");
  const marketPrice = parseFloat(searchParams.get("marketPrice") || "67200");
  const direction = (searchParams.get("direction") || "LONG") as "LONG" | "SHORT";
  const mode = (searchParams.get("mode") || "WAIT_ENTRY") as "IMMEDIATE" | "WAIT_ENTRY";
  const maxPriceCapPercent = parseFloat(searchParams.get("cap") || "0.5");

  const config = {
    enabled: true,
    mode,
    maxPriceCapPercent,
  };

  const calculation = FirstEntryMarketService.calculateEntryPrice(
    entryPrice,
    marketPrice,
    direction,
    config
  );

  return NextResponse.json({
    success: true,
    demo: true,
    calculation: {
      originalEntryPrice: calculation.originalEntryPrice,
      cappedEntryPrice: calculation.cappedEntryPrice,
      currentMarketPrice: calculation.currentMarketPrice,
      priceDiffPercent: calculation.priceDiffPercent.toFixed(4),
      shouldExecute: calculation.shouldExecute,
      executionType: calculation.executionType,
      limitPrice: calculation.limitPrice,
      reason: calculation.reason,
    },
    config,
    direction,
    usage: {
      POST: {
        description: "Calculate First Entry as Market parameters",
        body: {
          entryPrice: "number - Original signal entry price",
          marketPrice: "number - Current market price",
          direction: "LONG | SHORT (default: LONG)",
          mode: "IMMEDIATE | WAIT_ENTRY (default: WAIT_ENTRY)",
          maxPriceCapPercent: "number 0.01-5.0 (default: 0.5)",
        },
      },
      GET: {
        description: "Demo calculation with query parameters",
        params: {
          entryPrice: "Original entry price",
          marketPrice: "Current market price",
          direction: "LONG or SHORT",
          mode: "IMMEDIATE or WAIT_ENTRY",
          cap: "Max price cap percent",
        },
        example: "/api/auto-trading/first-entry?entryPrice=67000&marketPrice=67200&direction=LONG&mode=IMMEDIATE&cap=0.5",
      },
    },
  });
}
