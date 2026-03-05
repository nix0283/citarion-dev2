"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Crown, Users, TrendingUp, DollarSign, Settings, RefreshCw, 
  AlertCircle, CheckCircle2, ExternalLink, Activity, Target,
  UserPlus, UserMinus, BarChart3, Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface Follower {
  followerId: string;
  nickname?: string;
  subscribedAt: Date;
  active: boolean;
  totalPnl: number;
  totalCopiedTrades: number;
  totalVolume: number;
}

interface MasterStats {
  isMasterTrader: boolean;
  followersCount: number;
  activeFollowers: number;
  totalProfitShared: number;
  totalTradesCopied: number;
  profitSharePercent: number;
}

interface Position {
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  unrealizedPnl: number;
  leverage: number;
  followersCopying: number;
  openedAt: Date;
}

// Exchange API support for Master Traders
const MASTER_TRADER_SUPPORT = {
  okx: { 
    full: true, 
    apply: true, 
    followers: true, 
    profitSharing: true,
    closePosition: true,
    modifyTpsl: true,
    docs: 'https://www.okx.com/docs-v5/en/#copy-trading-rest-api'
  },
  bitget: { 
    full: true, 
    apply: false, // Through UI
    followers: true, 
    profitSharing: true,
    closePosition: true,
    modifyTpsl: true,
    docs: 'https://bitgetlimited.github.io/apidoc/en/copyTrade'
  },
  binance: { 
    full: false, 
    apply: false, 
    followers: false, 
    profitSharing: false,
    closePosition: false,
    modifyTpsl: false,
    docs: 'https://developers.binance.com/docs/copy_trading/future-copy-trading'
  },
  bybit: { 
    full: false, 
    apply: false, 
    followers: false, 
    profitSharing: false,
    closePosition: false,
    modifyTpsl: false,
    docs: 'https://bybit-exchange.github.io/docs/v5/copytrade'
  },
  bingx: { 
    full: false, 
    apply: false, 
    followers: false, 
    profitSharing: false,
    closePosition: false,
    modifyTpsl: false,
    docs: 'https://bingx-api.github.io/docs/'
  },
};

export function MasterTraderPanel() {
  const [selectedExchange, setSelectedExchange] = useState<string>('okx');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<MasterStats | null>(null);
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'followers' | 'positions' | 'settings'>('overview');

  // Settings form
  const [settings, setSettings] = useState({
    profitSharePercent: 10,
    minCopyAmount: 10,
    maxCopyAmount: 10000,
    requireApproval: false,
    visible: true,
  });

  const support = MASTER_TRADER_SUPPORT[selectedExchange as keyof typeof MASTER_TRADER_SUPPORT];

  // Mock data for demo - using useMemo to avoid cascading re-renders
  const mockData = useMemo(() => {
    if (selectedExchange === 'okx' || selectedExchange === 'bitget') {
      return {
        stats: {
          isMasterTrader: true,
          followersCount: 156,
          activeFollowers: 89,
          totalProfitShared: 12845.50,
          totalTradesCopied: 342,
          profitSharePercent: 10,
        } as MasterStats,
        followers: [
          { followerId: '1', nickname: 'Follower_Alpha', subscribedAt: new Date(Date.now() - 86400000 * 30), active: true, totalPnl: 1234.56, totalCopiedTrades: 45, totalVolume: 50000 },
          { followerId: '2', nickname: 'Crypto_Follow', subscribedAt: new Date(Date.now() - 86400000 * 15), active: true, totalPnl: 567.89, totalCopiedTrades: 23, totalVolume: 25000 },
          { followerId: '3', nickname: 'Trade_Copy_X', subscribedAt: new Date(Date.now() - 86400000 * 7), active: true, totalPnl: 890.12, totalCopiedTrades: 18, totalVolume: 18000 },
        ] as Follower[],
        positions: [
          { symbol: 'BTCUSDT', side: 'long', quantity: 0.5, entryPrice: 98500, unrealizedPnl: 350, leverage: 5, followersCopying: 67, openedAt: new Date(Date.now() - 3600000 * 4) },
          { symbol: 'ETHUSDT', side: 'short', quantity: 5, entryPrice: 3450, unrealizedPnl: -125, leverage: 3, followersCopying: 45, openedAt: new Date(Date.now() - 3600000 * 12) },
        ] as Position[],
      };
    }
    return { stats: null, followers: [] as Follower[], positions: [] as Position[] };
  }, [selectedExchange]);

  // Sync mock data to state
  useEffect(() => {
    setStats(mockData.stats);
    setFollowers(mockData.followers);
    setPositions(mockData.positions);
  }, [mockData]);

  const handleApplyAsMaster = async () => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setLoading(false);
    // Would call: await client.applyAsMasterTrader({ ... })
  };

  const handleRemoveFollower = async (followerId: string) => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setFollowers(prev => prev.filter(f => f.followerId !== followerId));
    setLoading(false);
  };

  const formatNumber = (num: number, decimals = 2) => {
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Crown className="h-6 w-6 text-yellow-500" />
            Master Trader Dashboard
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Управление копитрейдингом как Master Trader
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stats?.isMasterTrader && (
            <Badge variant="default" className="bg-yellow-500 text-black">
              <Crown className="h-3 w-3 mr-1" />
              Master Trader
            </Badge>
          )}
          <Button variant="outline" size="icon" onClick={() => setLoading(true)}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Exchange Selector */}
      <div className="flex items-center gap-4">
        <Label className="text-sm">Биржа:</Label>
        <div className="flex gap-2">
          {Object.entries(MASTER_TRADER_SUPPORT).map(([exchange, support]) => (
            <Button
              key={exchange}
              variant={selectedExchange === exchange ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedExchange(exchange)}
              className="capitalize"
            >
              {exchange}
              {support.full && (
                <CheckCircle2 className="h-3 w-3 ml-1 text-[#0ECB81]" />
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* API Support Warning */}
      {!support.full && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Ограниченная поддержка API</AlertTitle>
          <AlertDescription>
            Для {selectedExchange.toUpperCase()} доступно ограниченное управление Master Trader через API.
            {!support.apply && " Подача заявки на Master Trader доступна только через Web UI биржи."}
            {!support.followers && " Управление подписчиками недоступно через API."}
            <div className="mt-2">
              <a href={support.docs} target="_blank" rel="noopener noreferrer" className="text-sm underline">
                <ExternalLink className="h-3 w-3 inline mr-1" />
                Документация API
              </a>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Not a Master Trader */}
      {support.full && !stats?.isMasterTrader && (
        <Card className="border-yellow-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Станьте Master Trader
            </CardTitle>
            <CardDescription>
              Подайте заявку на получение статуса Master Trader
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Процент от прибыли followers</Label>
                <Input
                  type="number"
                  value={settings.profitSharePercent}
                  onChange={(e) => setSettings(prev => ({ ...prev, profitSharePercent: Number(e.target.value) }))}
                  min={0}
                  max={30}
                />
                <p className="text-xs text-muted-foreground">Обычно 5-15%</p>
              </div>
              <div className="space-y-2">
                <Label>Минимальная сумма копирования</Label>
                <Input
                  type="number"
                  value={settings.minCopyAmount}
                  onChange={(e) => setSettings(prev => ({ ...prev, minCopyAmount: Number(e.target.value) }))}
                />
              </div>
            </div>
            <Button onClick={handleApplyAsMaster} disabled={loading} className="w-full">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Crown className="h-4 w-4 mr-2" />}
              Подать заявку
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Master Trader Dashboard */}
      {stats?.isMasterTrader && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Обзор</TabsTrigger>
            <TabsTrigger value="followers">
              Подписчики
              <Badge variant="secondary" className="ml-1">{followers.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="positions">Позиции</TabsTrigger>
            <TabsTrigger value="settings">Настройки</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Подписчиков</span>
                  </div>
                  <div className="text-2xl font-bold mt-2">{formatNumber(stats.followersCount, 0)}</div>
                  <p className="text-xs text-muted-foreground">{stats.activeFollowers} активных</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-[#0ECB81]" />
                    <span className="text-sm text-muted-foreground">Заработок</span>
                  </div>
                  <div className="text-2xl font-bold mt-2 text-[#0ECB81]">
                    ${formatNumber(stats.totalProfitShared)}
                  </div>
                  <p className="text-xs text-muted-foreground">от profit sharing</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-purple-500" />
                    <span className="text-sm text-muted-foreground">Сделок скопировано</span>
                  </div>
                  <div className="text-2xl font-bold mt-2">{formatNumber(stats.totalTradesCopied, 0)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-orange-500" />
                    <span className="text-sm text-muted-foreground">Profit Share</span>
                  </div>
                  <div className="text-2xl font-bold mt-2">{stats.profitSharePercent}%</div>
                  <p className="text-xs text-muted-foreground">от прибыли followers</p>
                </CardContent>
              </Card>
            </div>

            {/* Active Positions Summary */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Активные позиции
                </CardTitle>
              </CardHeader>
              <CardContent>
                {positions.length > 0 ? (
                  <div className="space-y-2">
                    {positions.map((pos, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className={pos.side === 'long' ? 'border-[#0ECB81] text-[#0ECB81]' : 'border-[#F6465D] text-[#F6465D]'}>
                            {pos.side.toUpperCase()}
                          </Badge>
                          <div>
                            <div className="font-semibold">{pos.symbol}</div>
                            <div className="text-xs text-muted-foreground">
                              Entry: ${formatNumber(pos.entryPrice)} | {pos.leverage}x
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className={cn(
                              "font-semibold",
                              pos.unrealizedPnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                            )}>
                              {pos.unrealizedPnl >= 0 ? '+' : ''}${formatNumber(pos.unrealizedPnl)}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {pos.followersCopying} копируют
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Нет открытых позиций
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Followers Tab */}
          <TabsContent value="followers" className="space-y-4">
            {support.followers ? (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-lg">Управление подписчиками</CardTitle>
                  <CardDescription>
                    Список всех подписчиков, которые копируют ваши сделки
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {followers.map((follower) => (
                        <div 
                          key={follower.followerId}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <div className="font-semibold">{follower.nickname || follower.followerId}</div>
                              <div className="text-xs text-muted-foreground">
                                Подписан: {follower.subscribedAt.toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <div className="font-semibold">{follower.totalCopiedTrades} сделок</div>
                              <div className="text-xs text-muted-foreground">
                                Объём: ${formatNumber(follower.totalVolume)}
                              </div>
                            </div>
                            <div className={cn(
                              "text-right font-semibold",
                              follower.totalPnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                            )}>
                              {follower.totalPnl >= 0 ? '+' : ''}${formatNumber(follower.totalPnl)}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveFollower(follower.followerId)}
                              disabled={loading}
                              title="Удалить подписчика"
                            >
                              <UserMinus className="h-4 w-4 text-[#F6465D]" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Недоступно</AlertTitle>
                <AlertDescription>
                  Управление подписчиками через API недоступно для {selectedExchange.toUpperCase()}.
                  Используйте веб-интерфейс биржи.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* Positions Tab */}
          <TabsContent value="positions" className="space-y-4">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-lg">Позиции Master Trader</CardTitle>
                <CardDescription>
                  Ваши позиции, которые автоматически копируют подписчики
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert className="mb-4">
                  <Activity className="h-4 w-4" />
                  <AlertTitle>Автоматическое копирование</AlertTitle>
                  <AlertDescription>
                    Все ваши позиции автоматически копируются подписчиками согласно их настройкам.
                    Закрытие позиции здесь закроет её и у всех подписчиков.
                  </AlertDescription>
                </Alert>
                
                <div className="text-center py-8 text-muted-foreground">
                  <p>Используйте стандартные торговые инструменты для управления позициями.</p>
                  <p className="text-sm mt-2">Позиции автоматически синхронизируются с подписчиками.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Настройки Master Trader
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Процент Profit Sharing (%)</Label>
                      <Input
                        type="number"
                        value={settings.profitSharePercent}
                        onChange={(e) => setSettings(prev => ({ ...prev, profitSharePercent: Number(e.target.value) }))}
                        min={0}
                        max={30}
                      />
                      <p className="text-xs text-muted-foreground">
                        Процент от прибыли подписчиков, который вы получаете
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Минимальная сумма копирования (USDT)</Label>
                      <Input
                        type="number"
                        value={settings.minCopyAmount}
                        onChange={(e) => setSettings(prev => ({ ...prev, minCopyAmount: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Максимальная сумма копирования (USDT)</Label>
                      <Input
                        type="number"
                        value={settings.maxCopyAmount}
                        onChange={(e) => setSettings(prev => ({ ...prev, maxCopyAmount: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Требовать одобрение подписчиков</Label>
                        <p className="text-xs text-muted-foreground">
                          Подписчики должны получить ваше одобрение
                        </p>
                      </div>
                      <Switch
                        checked={settings.requireApproval}
                        onCheckedChange={(checked) => setSettings(prev => ({ ...prev, requireApproval: checked }))}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Публичный профиль</Label>
                        <p className="text-xs text-muted-foreground">
                          Виден в рейтинге Master Traders
                        </p>
                      </div>
                      <Switch
                        checked={settings.visible}
                        onCheckedChange={(checked) => setSettings(prev => ({ ...prev, visible: checked }))}
                      />
                    </div>
                  </div>
                </div>
                <Separator />
                <Button className="w-full">
                  Сохранить настройки
                </Button>
              </CardContent>
            </Card>

            {/* TP/SL Ratio Settings (Bitget specific) */}
            {selectedExchange === 'bitget' && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-lg">Настройки TP/SL для копирования</CardTitle>
                  <CardDescription>
                    Процент подписчиков, которые автоматически скопируют ваши TP/SL
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Auto Take Profit Ratio (%)</Label>
                      <Input type="number" defaultValue={100} min={0} max={100} />
                    </div>
                    <div className="space-y-2">
                      <Label>Auto Stop Loss Ratio (%)</Label>
                      <Input type="number" defaultValue={100} min={0} max={100} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Exchange-specific instructions */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg">Инструкции для {selectedExchange.toUpperCase()}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {selectedExchange === 'binance' && (
              <>
                <p><strong>Как стать Master Trader на Binance:</strong></p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Подайте заявку через Binance Copy Trading Web UI</li>
                  <li>Требования: минимальный объём 50,000 USDT за 30 дней, ROI &gt; 10%, Win Rate &gt; 50%</li>
                  <li>Используйте стандартный Futures API для торговли</li>
                  <li>Все сделки автоматически копируются подписчиками</li>
                </ol>
              </>
            )}
            {selectedExchange === 'bybit' && (
              <>
                <p><strong>Как стать Master Trader на Bybit:</strong></p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Подайте заявку через Bybit Copy Trading Web UI</li>
                  <li>Требования: 30+ дней торговли, ROI &gt; 15%, Win Rate &gt; 50%</li>
                  <li>Используйте V5 API с правами "Contract - Orders & Positions"</li>
                </ol>
              </>
            )}
            {selectedExchange === 'okx' && (
              <>
                <p><strong>Как стать Master Trader на OKX:</strong></p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Подайте заявку через API или Web UI</li>
                  <li>Полное управление через API: подписчики, настройки, профит</li>
                  <li>Используйте V5 API для торговли</li>
                  <li>Profit Sharing настраивается через API</li>
                </ol>
              </>
            )}
            {selectedExchange === 'bitget' && (
              <>
                <p><strong>Как стать Master Trader на Bitget:</strong></p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Подайте заявку через Bitget Copy Trading Web UI</li>
                  <li>Полное управление подписчиками через API</li>
                  <li>Настройка TP/SL Ratio для автоматического копирования</li>
                  <li>Закрытие позиций транслируется всем подписчикам</li>
                </ol>
              </>
            )}
            {selectedExchange === 'bingx' && (
              <>
                <p><strong>Как стать Master Trader на BingX:</strong></p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Подайте заявку через BingX Copy Trading Web UI</li>
                  <li>Используйте стандартный Perpetual Futures API</li>
                  <li>Copy-by-position mode поддерживает API торговлю</li>
                </ol>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
