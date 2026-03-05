"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Globe,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Key,
  Settings,
  ExternalLink,
  TestTube,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExchangeStatus {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "error" | "testing";
  isTestnet: boolean;
  lastConnect: Date | null;
  lastError: string | null;
  balances?: Array<{ asset: string; free: number; locked: number }>;
}

const EXCHANGES: Array<{
  id: string;
  name: string;
  logo: string;
  testnetUrl: string;
  liveUrl: string;
  requiresPassphrase: boolean;
}> = [
  {
    id: "binance",
    name: "Binance Futures",
    logo: "🟡",
    testnetUrl: "https://testnet.binancefuture.com",
    liveUrl: "https://fapi.binance.com",
    requiresPassphrase: false,
  },
  {
    id: "bybit",
    name: "Bybit Futures",
    logo: "🟠",
    testnetUrl: "https://api-testnet.bybit.com",
    liveUrl: "https://api.bybit.com",
    requiresPassphrase: false,
  },
  {
    id: "okx",
    name: "OKX Futures",
    logo: "⚫",
    testnetUrl: "https://www.okx.com",
    liveUrl: "https://www.okx.com",
    requiresPassphrase: true,
  },
  {
    id: "bitget",
    name: "Bitget Futures",
    logo: "🔵",
    testnetUrl: "https://api.bitget.com",
    liveUrl: "https://api.bitget.com",
    requiresPassphrase: true,
  },
  {
    id: "bingx",
    name: "BingX Futures",
    logo: "🟢",
    testnetUrl: "https://open-api.bingx.com",
    liveUrl: "https://open-api.bingx.com",
    requiresPassphrase: false,
  },
];

export function ExchangeIntegrationPanel() {
  const [exchangeStatuses, setExchangeStatuses] = useState<ExchangeStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingExchange, setTestingExchange] = useState<string | null>(null);
  const [configExchange, setConfigExchange] = useState<string | null>(null);

  useEffect(() => {
    loadExchangeStatuses();
  }, []);

  const loadExchangeStatuses = async () => {
    setLoading(true);
    
    // Initialize with default statuses
    const statuses: ExchangeStatus[] = EXCHANGES.map((exchange) => ({
      id: exchange.id,
      name: exchange.name,
      status: "disconnected",
      isTestnet: true,
      lastConnect: null,
      lastError: null,
    }));
    
    setExchangeStatuses(statuses);
    setLoading(false);
  };

  const testConnection = async (exchangeId: string) => {
    setTestingExchange(exchangeId);
    
    // Update status to testing
    setExchangeStatuses((prev) =>
      prev.map((e) =>
        e.id === exchangeId ? { ...e, status: "testing" as const } : e
      )
    );

    try {
      const response = await fetch("/api/exchange/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: exchangeId,
          testnet: true,
          action: "test",
        }),
      });

      const data = await response.json();

      setExchangeStatuses((prev) =>
        prev.map((e) =>
          e.id === exchangeId
            ? {
                ...e,
                status: data.success ? "connected" : "error",
                lastConnect: data.success ? new Date() : null,
                lastError: data.success ? null : data.error,
              }
            : e
        )
      );
    } catch (error) {
      setExchangeStatuses((prev) =>
        prev.map((e) =>
          e.id === exchangeId
            ? {
                ...e,
                status: "error",
                lastError: error instanceof Error ? error.message : "Unknown error",
              }
            : e
        )
      );
    } finally {
      setTestingExchange(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return (
          <Badge className="bg-[#0ECB81]/10 text-[#0ECB81] border-[#0ECB81]/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-[#F6465D]/10 text-[#F6465D] border-[#F6465D]/30">
            <XCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      case "testing":
        return (
          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Testing
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <AlertCircle className="h-3 w-3 mr-1" />
            Disconnected
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Globe className="h-5 w-5 text-[#0ECB81]" />
            Exchange Integration
          </h2>
          <p className="text-sm text-muted-foreground">
            Connect and manage exchange API connections for all trading bots
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadExchangeStatuses}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Exchange Status Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Exchange Connections</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exchange</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Last Connected</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exchangeStatuses.map((exchange) => {
                const exchangeInfo = EXCHANGES.find((e) => e.id === exchange.id);
                return (
                  <TableRow key={exchange.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{exchangeInfo?.logo}</span>
                        <span className="font-medium">{exchange.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(exchange.status)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {exchange.isTestnet ? "Testnet" : "Live"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {exchange.lastConnect
                        ? new Date(exchange.lastConnect).toLocaleString()
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {exchange.lastError && (
                        <span className="text-[#F6465D] truncate max-w-[150px] block">
                          {exchange.lastError}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testConnection(exchange.id)}
                          disabled={testingExchange === exchange.id}
                        >
                          {testingExchange === exchange.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfigExchange(exchange.id)}
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={exchange.isTestnet ? exchangeInfo?.testnetUrl : exchangeInfo?.liveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Testnet Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TestTube className="h-4 w-4 text-amber-500" />
            Testnet Setup Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="font-medium mb-1">Binance Futures Testnet</div>
              <div className="text-muted-foreground">
                Visit{" "}
                <a
                  href="https://testnet.binancefuture.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  testnet.binancefuture.com
                </a>{" "}
                to create API keys
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="font-medium mb-1">Bybit Testnet</div>
              <div className="text-muted-foreground">
                Visit{" "}
                <a
                  href="https://testnet.bybit.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  testnet.bybit.com
                </a>{" "}
                to create API keys
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="font-medium mb-1">OKX Demo Trading</div>
              <div className="text-muted-foreground">
                Enable Demo Trading in OKX account settings, then use the same API keys
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Dialog */}
      <Dialog open={!!configExchange} onOpenChange={() => setConfigExchange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configure {EXCHANGES.find((e) => e.id === configExchange)?.name}
            </DialogTitle>
            <DialogDescription>
              Enter your API credentials for the exchange. Credentials are stored securely.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="testnet-mode">Testnet Mode</Label>
              <Switch id="testnet-mode" defaultChecked />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input id="api-key" placeholder="Enter API key" type="password" />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="api-secret">API Secret</Label>
              <Input id="api-secret" placeholder="Enter API secret" type="password" />
            </div>
            
            {EXCHANGES.find((e) => e.id === configExchange)?.requiresPassphrase && (
              <div className="space-y-2">
                <Label htmlFor="passphrase">Passphrase</Label>
                <Input id="passphrase" placeholder="Enter passphrase" type="password" />
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigExchange(null)}>
              Cancel
            </Button>
            <Button onClick={() => setConfigExchange(null)}>
              Save & Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
