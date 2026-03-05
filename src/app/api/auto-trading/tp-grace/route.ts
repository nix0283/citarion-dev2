/**
 * Take-Profit Grace API Endpoint
 *
 * Test endpoint for TP Grace feature
 */

import { NextRequest, NextResponse } from "next/server";
import { TPGraceService } from "@/lib/auto-trading/tp-grace";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      originalTPPrice,
      currentMarketPrice,
      direction = "LONG",
      filledPercent = 0,
      retries = 0,
      capPercent = 0.5,
      maxRetries = 3,
    } = body;

    // Validate inputs
    if (!originalTPPrice || !currentMarketPrice) {
      return NextResponse.json(
        { error: "originalTPPrice and currentMarketPrice are required" },
        { status: 400 }
      );
    }

    const config = {
      enabled: true,
      capPercent: parseFloat(capPercent),
      maxRetries: parseInt(maxRetries),
    };

    // Validate config
    const validation = TPGraceService.validateConfig(config);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Invalid config", errors: validation.errors },
        { status: 400 }
      );
    }

    // Create TP target
    const target = {
      price: originalTPPrice,
      percentage: 100,
      filled: parseFloat(filledPercent),
      retries: parseInt(retries),
      originalPrice: originalTPPrice,
    };

    // Calculate grace price
    const calculation = TPGraceService.calculateGracePrice(
      target,
      direction as "LONG" | "SHORT",
      config
    );

    // Check if should apply TP Grace
    const shouldApply = TPGraceService.shouldApplyTPGrace(target, config);

    return NextResponse.json({
      success: true,
      calculation: {
        originalTPPrice: calculation.target.originalPrice,
        newTPPrice: calculation.newPrice,
        priceAdjustment: calculation.priceAdjustment.toFixed(4) + "%",
        withinCap: calculation.withinCap,
        remainingToFill: calculation.remainingToFill,
        direction: calculation.direction,
        shouldApply,
      },
      target: {
        filled: target.filled + "%",
        retries: target.retries,
        remainingRetries: config.maxRetries - target.retries,
      },
      config,
    });

  } catch (error) {
    console.error("TP Grace API error:", error);
    return NextResponse.json(
      { error: "Failed to calculate TP Grace", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Demo calculation with default values
  const originalTPPrice = parseFloat(searchParams.get("tpPrice") || "68000");
  const currentMarketPrice = parseFloat(searchParams.get("marketPrice") || "67900");
  const direction = (searchParams.get("direction") || "LONG") as "LONG" | "SHORT";
  const filledPercent = parseFloat(searchParams.get("filled") || "0");
  const retries = parseInt(searchParams.get("retries") || "0");
  const capPercent = parseFloat(searchParams.get("cap") || "0.5");
  const maxRetries = parseInt(searchParams.get("maxRetries") || "3");

  const config = {
    enabled: true,
    capPercent,
    maxRetries,
  };

  const target = {
    price: originalTPPrice,
    percentage: 100,
    filled: filledPercent,
    retries,
    originalPrice: originalTPPrice,
  };

  const calculation = TPGraceService.calculateGracePrice(
    target,
    direction,
    config
  );

  const shouldApply = TPGraceService.shouldApplyTPGrace(target, config);

  // Calculate multiple retry scenarios
  const retryScenarios = [];
  for (let r = 0; r <= maxRetries; r++) {
    const scenarioTarget = { ...target, retries: r };
    const scenarioCalc = TPGraceService.calculateGracePrice(
      scenarioTarget,
      direction,
      config
    );
    retryScenarios.push({
      retry: r,
      newPrice: scenarioCalc.newPrice,
      adjustment: scenarioCalc.priceAdjustment.toFixed(4) + "%",
    });
  }

  return NextResponse.json({
    success: true,
    demo: true,
    calculation: {
      originalTPPrice: calculation.target.originalPrice,
      newTPPrice: calculation.newPrice,
      priceAdjustment: calculation.priceAdjustment.toFixed(4) + "%",
      withinCap: calculation.withinCap,
      remainingToFill: calculation.remainingToFill,
      direction: calculation.direction,
      shouldApply,
    },
    target: {
      filled: target.filled + "%",
      retries: target.retries,
      remainingRetries: config.maxRetries - target.retries,
    },
    config,
    retryScenarios,
    explanation: {
      LONG: "For LONG positions, TP price is lowered on each retry to increase fill probability. The price is adjusted downward by capPercent per retry.",
      SHORT: "For SHORT positions, TP price is raised on each retry to increase fill probability. The price is adjusted upward by capPercent per retry.",
    },
    usage: {
      POST: {
        description: "Calculate TP Grace parameters",
        body: {
          originalTPPrice: "number - Original TP price from signal",
          currentMarketPrice: "number - Current market price",
          direction: "LONG | SHORT (default: LONG)",
          filledPercent: "number 0-100 (default: 0) - Already filled %",
          retries: "number 0-maxRetries (default: 0) - Current retry count",
          capPercent: "number 0.01-2.0 (default: 0.5)",
          maxRetries: "number 1-10 (default: 3)",
        },
      },
      GET: {
        description: "Demo calculation with query parameters",
        params: {
          tpPrice: "Original TP price",
          marketPrice: "Current market price",
          direction: "LONG or SHORT",
          filled: "Already filled percentage",
          retries: "Current retry count",
          cap: "Cap percent per retry",
          maxRetries: "Maximum retries allowed",
        },
        example: "/api/auto-trading/tp-grace?tpPrice=68000&marketPrice=67900&direction=LONG&filled=0&retries=1&cap=0.5&maxRetries=3",
      },
    },
  });
}
