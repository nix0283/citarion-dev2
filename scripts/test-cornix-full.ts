/**
 * Comprehensive Test Script for Cornix Commands
 * Tests all 11 Cornix commands and records metrics
 */

const BASE_URL = "http://localhost:3000";

interface TestResult {
  command: string;
  success: boolean;
  response: unknown;
  executionTime: number;
  error?: string;
}

const CORNIX_COMMANDS = [
  { command: "config", args: [], description: "Show current configuration" },
  { command: "firstentry", args: ["on", "5", "WAIT_ENTRY"], description: "Enable First Entry" },
  { command: "tpgrace", args: ["on", "1", "3"], description: "Enable TP Grace" },
  { command: "trailing", args: ["breakeven"], description: "Enable Trailing Stop" },
  { command: "leverage", args: ["10"], description: "Set leverage to 10x" },
  { command: "direction", args: ["long"], description: "Set direction filter to long" },
  { command: "entrystrategy", args: ["two"], description: "Set entry strategy" },
  { command: "tpstrategy", args: ["three"], description: "Set TP strategy" },
  { command: "sl", args: ["5"], description: "Set stop loss to 5%" },
  { command: "filters", args: ["minrr", "1.5"], description: "Enable signal filters" },
  { command: "reset", args: [], description: "Reset to defaults" },
];

async function testCornixCommand(command: string, args: string[] = []): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${BASE_URL}/api/cornix/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command,
        args,
        source: "api",
        userId: "test-user",
      }),
    });

    const data = await response.json();
    const executionTime = Date.now() - startTime;

    return {
      command: `/${command}`,
      success: response.ok && data.success,
      response: data,
      executionTime,
    };
  } catch (error) {
    return {
      command: `/${command}`,
      success: false,
      response: null,
      executionTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function testMetricsAPI(): Promise<void> {
  console.log("\n📊 Testing Metrics API...");
  
  try {
    const response = await fetch(`${BASE_URL}/api/cornix/metrics?days=7`);
    const data = await response.json();
    
    if (data.success) {
      console.log("  ✅ Metrics API working");
      console.log(`  📈 Total Commands: ${data.summary.totalCommands}`);
      console.log(`  ✓ Success Rate: ${data.summary.successRate.toFixed(1)}%`);
    } else {
      console.log("  ❌ Metrics API failed");
    }
  } catch (error) {
    console.log("  ❌ Metrics API error:", error);
  }
}

async function testExchangeConnection(): Promise<void> {
  console.log("\n🔌 Testing Exchange Connection API...");
  
  const exchanges = ["binance", "bybit", "okx"];
  
  for (const exchange of exchanges) {
    try {
      const response = await fetch(`${BASE_URL}/api/exchange/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange,
          testnet: true,
          action: "test",
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        console.log(`  ✅ ${exchange.toUpperCase()}: ${data.message}`);
      } else {
        console.log(`  ⚠️ ${exchange.toUpperCase()}: ${data.error || "No credentials"}`);
      }
    } catch (error) {
      console.log(`  ❌ ${exchange.toUpperCase()}: Error`);
    }
  }
}

async function runAllTests(): Promise<void> {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║   CITARION Cornix Commands Test Suite      ║");
  console.log("╚════════════════════════════════════════════╝\n");

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  console.log("🧪 Testing Cornix Commands...\n");

  for (const { command, args, description } of CORNIX_COMMANDS) {
    process.stdout.write(`  Testing /${command}... `);
    
    const result = await testCornixCommand(command, args);
    results.push(result);
    
    if (result.success) {
      console.log(`✅ (${result.executionTime}ms)`);
      passed++;
    } else {
      console.log(`❌ ${result.error || "Failed"}`);
      failed++;
    }
  }

  console.log("\n" + "─".repeat(45));
  console.log(`\n📋 Results: ${passed} passed, ${failed} failed`);
  console.log(`⏱️  Total time: ${results.reduce((sum, r) => sum + r.executionTime, 0)}ms`);

  // Test Metrics API
  await testMetricsAPI();

  // Test Exchange Connections
  await testExchangeConnection();

  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║           Test Suite Complete              ║");
  console.log("╚════════════════════════════════════════════╝\n");
}

// Run tests
runAllTests().catch(console.error);
