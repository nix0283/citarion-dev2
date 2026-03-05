import { NextRequest, NextResponse } from "next/server";
import { RealExchangeConnector, testAllConnections } from "@/lib/exchange/real-exchange-connector";
import { db } from "@/lib/db";
import { getDefaultUserId } from "@/lib/default-user";

// GET - Get all exchange connection statuses
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  try {
    const effectiveUserId = userId || await getDefaultUserId();
    
    // Test all connections for the user
    const results = await testAllConnections(effectiveUserId);

    return NextResponse.json({
      success: true,
      connections: results,
    });
  } catch (error) {
    console.error("[Exchange Connect API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST - Test or configure an exchange connection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, accountId, exchangeId, isTestnet, credentials } = body;

    if (action === "test") {
      // Test a specific account connection
      if (!accountId) {
        return NextResponse.json(
          { error: "accountId required for test action" },
          { status: 400 }
        );
      }

      const account = await db.account.findUnique({
        where: { id: accountId },
        select: {
          exchangeId: true,
          isTestnet: true,
        },
      });

      if (!account) {
        return NextResponse.json(
          { error: "Account not found" },
          { status: 404 }
        );
      }

      const connector = new RealExchangeConnector(account.exchangeId, account.isTestnet);
      const loaded = await connector.loadCredentialsFromDB(accountId);

      if (!loaded) {
        return NextResponse.json({
          success: false,
          message: "No API credentials configured for this account",
        });
      }

      const result = await connector.testConnection();

      return NextResponse.json({
        success: result.success,
        message: result.message,
        exchange: account.exchangeId,
        testnet: account.isTestnet,
      });
    }

    if (action === "configure") {
      // Configure credentials for an account
      if (!accountId || !credentials) {
        return NextResponse.json(
          { error: "accountId and credentials required for configure action" },
          { status: 400 }
        );
      }

      // Update account with credentials
      await db.account.update({
        where: { id: accountId },
        data: {
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          apiPassphrase: credentials.passphrase || null,
          apiUid: credentials.uid || null,
        },
      });

      // Test the connection
      const account = await db.account.findUnique({
        where: { id: accountId },
        select: { exchangeId: true, isTestnet: true },
      });

      if (!account) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }

      const connector = new RealExchangeConnector(account.exchangeId, account.isTestnet);
      await connector.loadCredentialsFromDB(accountId);
      const result = await connector.testConnection();

      return NextResponse.json({
        success: result.success,
        message: result.success
          ? `Credentials saved and connection successful: ${result.message}`
          : `Credentials saved but connection failed: ${result.message}`,
      });
    }

    if (action === "create") {
      // Create a new exchange account
      const userId = await getDefaultUserId();
      const effectiveExchangeId = exchangeId || "binance";
      const effectiveIsTestnet = isTestnet !== undefined ? isTestnet : true;

      const account = await db.account.create({
        data: {
          userId,
          exchangeId: effectiveExchangeId,
          exchangeName: effectiveExchangeId.charAt(0).toUpperCase() + effectiveExchangeId.slice(1),
          exchangeType: "futures",
          accountType: "REAL",
          isTestnet: effectiveIsTestnet,
          apiKey: credentials?.apiKey || null,
          apiSecret: credentials?.apiSecret || null,
          apiPassphrase: credentials?.passphrase || null,
        },
      });

      return NextResponse.json({
        success: true,
        account: {
          id: account.id,
          exchangeId: account.exchangeId,
          isTestnet: account.isTestnet,
        },
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'test', 'configure', or 'create'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Exchange Connect API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
