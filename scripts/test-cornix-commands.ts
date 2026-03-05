/**
 * Cornix Commands Test Script
 * Tests all 11 Cornix commands through the API
 * 
 * Usage: npx ts-node scripts/test-cornix-commands.ts
 */

const BASE_URL = "http://localhost:3000";

interface TestResult {
  command: string;
  args: string[];
  success: boolean;
  response?: unknown;
  error?: string;
}

async function testCommand(command: string, args: string[] = []): Promise<TestResult> {
  try {
    const response = await fetch(`${BASE_URL}/api/cornix/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, args, source: "TEST" }),
    });

    const data = await response.json();

    return {
      command,
      args,
      success: data.success === true,
      response: data,
      error: data.success === false ? data.message : undefined,
    };
  } catch (error) {
    return {
      command,
      args,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function runTests() {
  console.log("🧪 Testing Cornix Commands API");
  console.log("=" .repeat(50));

  const tests: Array<{ command: string; args: string[] }> = [
    // Test each command with various arguments
    { command: "config", args: [] },
    { command: "firstentry", args: [] },
    { command: "firstentry", args: ["on", "WAIT_ENTRY", "2"] },
    { command: "tpgrace", args: [] },
    { command: "tpgrace", args: ["on", "0.5", "5"] },
    { command: "trailing", args: [] },
    { command: "trailing", args: ["breakeven"] },
    { command: "trailing", args: ["percent", "3"] },
    { command: "leverage", args: [] },
    { command: "leverage", args: ["20", "EXACTLY"] },
    { command: "direction", args: [] },
    { command: "direction", args: ["long"] },
    { command: "entrystrategy", args: [] },
    { command: "entrystrategy", args: ["fifty"] },
    { command: "tpstrategy", args: [] },
    { command: "tpstrategy", args: ["two"] },
    { command: "sl", args: [] },
    { command: "sl", args: ["5", "AVERAGE_ENTRIES"] },
    { command: "filters", args: [] },
    { command: "filters", args: ["nosl", "on"] },
    { command: "reset", args: [] },
    { command: "config", args: [] }, // Verify reset worked
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    const result = await testCommand(test.command, test.args);
    results.push(result);

    const status = result.success ? "✅" : "❌";
    const argsStr = test.args.length > 0 ? ` ${test.args.join(" ")}` : "";
    console.log(`${status} /${test.command}${argsStr}`);

    if (!result.success) {
      console.log(`   Error: ${result.error}`);
    }

    // Small delay between tests
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 Test Summary");
  console.log("=".repeat(50));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);

  // Test metrics API
  console.log("\n📊 Testing Metrics API...");
  
  try {
    const metricsResponse = await fetch(`${BASE_URL}/api/cornix/metrics?days=1`);
    const metricsData = await metricsResponse.json();

    if (metricsData.success) {
      console.log("✅ Metrics API working");
      console.log(`   Total commands recorded: ${metricsData.summary.totalCommands}`);
      console.log(`   Success rate: ${metricsData.summary.successRate.toFixed(1)}%`);
    } else {
      console.log("❌ Metrics API error:", metricsData.error);
    }
  } catch (error) {
    console.log("❌ Metrics API error:", error instanceof Error ? error.message : "Unknown");
  }

  // Exit with error code if any tests failed
  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);
