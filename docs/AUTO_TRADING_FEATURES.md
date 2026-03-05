# CITARION Auto-Trading Features Documentation

> Based on Cornix trading platform specifications

## Overview

This document describes all auto-trading features implemented in CITARION, following Cornix specifications for maximum compatibility with signal providers and trading strategies.

---

## Feature List (15 Core Features)

### 1. First Entry as Market

**Purpose:** Execute first entry with market-like behavior while protecting against overpaying.

**Configuration:**
| Field | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `firstEntryAsMarket` | Boolean | false | - | Enable feature |
| `firstEntryMode` | String | WAIT_ENTRY | IMMEDIATE, WAIT_ENTRY | When to activate |
| `firstEntryMaxPriceCap` | Float | 1.0 | 0.05-20% | Maximum price deviation |
| `firstEntryOnlyIfNotDefinedByGroup` | Boolean | false | - | Fallback mode |

**Behavior:**
- **IMMEDIATE**: Create entry range immediately when trade opens
- **WAIT_ENTRY**: Wait for signal entry price to be reached
- Iteratively increases price by 0.1% intervals until filled
- Uses LIMIT orders to prevent entering above cap
- For LONG: cap is ABOVE entry price
- For SHORT: cap is BELOW entry price

**API Endpoint:** `POST /api/auto-trading/first-entry`

---

### 2. Take-Profit Grace

**Purpose:** Retry partially/unfilled TP orders at adjusted prices.

**Configuration:**
| Field | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `tpGraceEnabled` | Boolean | false | - | Enable feature |
| `tpGraceCapPercent` | Float | 0.5 | 0.01-2% | Max total adjustment |
| `tpGraceMaxRetries` | Int | 3 | 1-10 | Max retry attempts |
| `tpGraceRetryInterval` | Int | 5 | 1-60 | Seconds between retries |
| `tpGraceOnlyIfNotDefinedByGroup` | Boolean | false | - | Fallback mode |

**Behavior:**
- For LONG: progressively LOWERS TP price on each retry
- For SHORT: progressively RAISES TP price on each retry
- Tracks filled % and retry count per TP target
- Stops when fully filled or max retries reached

**API Endpoint:** `POST /api/auto-trading/tp-grace`

---

### 3. Trailing Stop-Loss

**Purpose:** Move stop-loss to protect profits as trade becomes profitable.

**Configuration:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `trailingEnabled` | Boolean | false | Enable trailing |
| `trailingType` | String | BREAKEVEN | Type of trailing |
| `trailingValue` | Float | - | Percentage trigger |
| `trailingTriggerType` | String | - | TARGET_REACHED, PERCENT_ABOVE_ENTRY |
| `trailingTriggerValue` | Float | - | Which target or percentage |
| `trailingStopPercent` | Float | - | Stop distance for Moving Target |

**Trailing Types (Cornix spec):**
1. **BREAKEVEN**: Move SL to entry price after trigger
2. **MOVING_TARGET**: Trail behind price at fixed distance after target hit
3. **MOVING_2_TARGET**: Trail after 2nd target reached
4. **PERCENT_BELOW_TRIGGERS**: Trail at % below highest price after triggers
5. **PERCENT_BELOW_HIGHEST**: Trail at % below highest price reached

---

### 4. Trailing Entry

**Purpose:** Create trailing order that follows price before entry.

**Configuration:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `trailingEntryEnabled` | Boolean | false | Enable feature |
| `trailingEntryPercent` | Float | 1.0 | % to trail above min price |
| `trailingEntryOnlyIfNotDefinedByGroup` | Boolean | false | Fallback mode |

**Behavior:**
- Trails ABOVE minimum price reached (for LONG)
- Trails BELOW maximum price reached (for SHORT)
- Enters when price reverses by specified percentage

---

### 5. Trailing Take-Profit

**Purpose:** Trail TP behind maximum price to capture more upside.

**Configuration:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `tpTrailingEnabled` | Boolean | false | Enable feature |
| `tpTrailingPercent` | Float | 1.0 | % to trail behind max price |
| `tpTrailingOnlyIfNotDefinedByGroup` | Boolean | false | Fallback mode |

---

### 6. Entry Strategy

**Purpose:** Define how position is built across multiple entry points.

**Configuration:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `entryStrategy` | String | EVENLY_DIVIDED | Strategy type |
| `entryWeights` | String | - | JSON: [50, 30, 20] custom ratios |
| `entryZoneTargets` | Int | 4 | Number of targets (1-10) |
| `entryOnlyIfNotDefinedByGroup` | Boolean | false | Fallback mode |

**Strategies:**
1. **EVENLY_DIVIDED**: Equal % at each entry
2. **ONE_TARGET**: 100% at single entry
3. **TWO_TARGETS**: 50/50 split
4. **THREE_TARGETS**: 33.3/33.3/33.4 split
5. **FIFTY_ON_FIRST**: 50% first, rest divided evenly
6. **DECREASING_EXP**: Exponential decrease (largest first)
7. **INCREASING_EXP**: Exponential increase (largest last)
8. **SKIP_FIRST**: Skip first entry, divide among rest
9. **CUSTOM_RATIOS**: User-defined percentages

---

### 7. Take-Profit Strategy

**Purpose:** Define how profits are taken across multiple targets.

**Configuration:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `tpStrategy` | String | EVENLY_DIVIDED | Strategy type |
| `tpTargetCount` | Int | 1 | Number of TP targets (1-10) |
| `tpCustomRatios` | String | - | JSON: [30, 40, 30] |
| `tpOnlyIfNotDefinedByGroup` | Boolean | false | Fallback mode |

---

### 8. Moving Take-Profits

**Purpose:** Dynamically adjust TP targets based on price action.

**Configuration:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `movingTPEnabled` | Boolean | false | Enable feature |

**Behavior:**
- Automatically moves remaining TP targets when earlier ones are hit
- Helps capture more profit on strong moves

---

### 9. Stop-Loss Settings

**Purpose:** Configure stop-loss behavior.

**Configuration:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `defaultStopLoss` | Float | - | Default SL % (null = disabled) |
| `slBaseline` | String | AVERAGE_ENTRIES | AVERAGE_ENTRIES or FIRST_ENTRY |
| `slTimeout` | Int | 0 | Seconds before SL triggers |
| `slTimeoutUnit` | String | SECONDS | SECONDS, MINUTES, HOURS |
| `slOrderType` | String | MARKET | MARKET or LIMIT |
| `slLimitPriceReduction` | Float | 2.0 | % between stop and limit price |
| `slOnlyIfNotDefinedByGroup` | Boolean | false | Fallback mode |

---

### 10. Leverage & Margin Settings

**Purpose:** Configure leverage and margin mode.

**Configuration:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `leverage` | Int | 1 | Leverage multiplier |
| `leverageOverride` | Boolean | false | Override signal leverage |
| `leverageMode` | String | EXACTLY | EXACTLY or UP_TO |
| `hedgeMode` | Boolean | false | One-Way or Hedge Mode |
| `marginMode` | String | ISOLATED | ISOLATED or CROSSED |
| `leverageOnlyIfNotDefinedByGroup` | Boolean | false | Fallback mode |

**Leverage Modes:**
- **EXACTLY**: Use exact leverage specified
- **UP_TO**: Use channel leverage up to limit

---

### 11. Direction Filter

**Purpose:** Filter signals by direction.

**Configuration:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `directionFilter` | String | BOTH | LONG, SHORT, BOTH |

---

### 12. Close on TP/SL Before Entry

**Purpose:** Close position if TP or SL is reached before all entries complete.

**Configuration:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `closeOnTPSLBeforeEntry` | Boolean | true | Enable feature |
| `closeOnTPSLBeforeEntryOnlyIfNotDefinedByGroup` | Boolean | false | Fallback mode |

---

### 13. First Entry Grace Percentage

**Purpose:** Allow entry within % of signal entry price.

**Configuration:**
| Field | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `firstEntryGracePercent` | Float | 0 | 0-5% | Grace percentage (0 = disabled) |

---

### 14. Auto-Execute Settings

**Purpose:** Automatically execute signals without confirmation.

**Configuration:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `autoExecuteEnabled` | Boolean | false | Enable auto-execute |
| `autoExecuteSources` | String | - | JSON: ["TRADINGVIEW", "TELEGRAM"] |
| `autoExecuteRequiresConfirmation` | Boolean | true | Require confirmation |

---

### 15. Signal Filters

**Purpose:** Filter signals before execution.

**Configuration:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ignoreSignalsWithoutSL` | Boolean | false | Skip signals without SL |
| `ignoreSignalsWithoutTP` | Boolean | false | Skip signals without TP |
| `minRiskRewardRatio` | Float | - | Minimum R:R ratio |
| `maxOpenTrades` | Int | 5 | Max concurrent trades |
| `minTradeInterval` | Int | 5 | Minutes between trades |
| `allowedSymbols` | String | - | JSON: ["BTCUSDT", "ETHUSDT"] |
| `blacklistedSymbols` | String | - | JSON of blocked pairs |

---

## "Only If Not Defined By Group" Pattern

Many features have an `onlyIfNotDefinedByGroup` flag. This enables fallback behavior:

- **When TRUE**: Use personal setting only if signal/group doesn't define it
- **When FALSE**: Always use personal setting (override)

This allows users to set defaults while respecting signal-specific configurations.

---

## Database Schema

All features are stored in the `BotConfig` model in Prisma schema:

```prisma
model BotConfig {
  // ... other fields ...
  
  // First Entry as Market
  firstEntryMode       String  @default("WAIT_ENTRY")
  firstEntryMaxPriceCap Float  @default(1.0)
  firstEntryAsMarket   Boolean @default(false)
  firstEntryOnlyIfNotDefinedByGroup Boolean @default(false)
  
  // TP Grace
  tpGraceEnabled   Boolean @default(false)
  tpGraceCapPercent Float  @default(0.5)
  tpGraceMaxRetries Int    @default(3)
  tpGraceRetryInterval Int @default(5)
  tpGraceOnlyIfNotDefinedByGroup Boolean @default(false)
  
  // ... more fields ...
}
```

---

## Backend Services

### FirstEntryMarketService
- Location: `/src/lib/auto-trading/first-entry-market.ts`
- Methods:
  - `calculateEntryPrice()` - Calculate entry with cap
  - `executeFirstEntry()` - Execute with market cap
  - `validateConfig()` - Validate configuration
  - `shouldUseFeature()` - Check if feature applies

### TPGraceService
- Location: `/src/lib/auto-trading/tp-grace.ts`
- Methods:
  - `calculateGracePrice()` - Calculate adjusted TP price
  - `processTPGrace()` - Process all TP targets
  - `executeTPRetry()` - Execute single TP retry
  - `shouldApplyTPGrace()` - Check conditions

### SignalExecutionService
- Location: `/src/lib/auto-trading/signal-executor.ts`
- Methods:
  - `executeSignal()` - Unified signal execution
  - `processActivePositionsTPGrace()` - Batch process positions

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auto-trading/first-entry` | POST/GET | First Entry as Market |
| `/api/auto-trading/tp-grace` | POST/GET | TP Grace operations |
| `/api/auto-trading/execute` | POST/GET | Signal execution |
| `/api/bot/config` | POST/GET | Bot configuration |

---

## Signal Format

CITARION supports Cornix signal format. See `/docs/CORNIX_SIGNAL_FORMAT.md` for details.

**Supported Elements:**
- Entry points (up to 10)
- Take-profit targets (up to 10)
- Stop-loss (1)
- Leverage
- Direction (LONG/SHORT)
- Entry Zone
- Trailing configuration
- Signal type (Regular/Breakout)

---

## Testing

Each feature has test API endpoints:

```bash
# Test First Entry as Market
curl -X POST /api/auto-trading/first-entry \
  -H "Content-Type: application/json" \
  -d '{"signalId": 1, "marketPrice": 65000}'

# Test TP Grace
curl -X POST /api/auto-trading/tp-grace \
  -H "Content-Type: application/json" \
  -d '{"positionId": "abc123", "marketPrice": 66000}'
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01 | Initial implementation |
| 1.1.0 | 2025-01 | Added Cornix spec compliance |
| 1.2.0 | 2025-01 | Added "Only If Not Defined By Group" flags |
| 2.0.0 | 2025-01 | Full backend implementation - 10 services, 4 DB models, 18 Telegram commands |

---

## Backend Services (Full Implementation)

### Core Services
| Service | File | Description |
|---------|------|-------------|
| FirstEntryMarketService | `first-entry-market.ts` | Market-like entry with cap protection |
| TPGraceService | `tp-grace.ts` | TP retry logic for partial fills |
| TrailingStopService | `trailing-stop.ts` | 5 types of trailing SL |
| TrailingEntryService | `trailing-entry.ts` | Trailing entry orders |
| TrailingTPService | `trailing-tp.ts` | Trailing take-profit |
| MovingTPService | `moving-tp.ts` | Dynamic TP adjustment |

### Strategy Services
| Service | File | Description |
|---------|------|-------------|
| EntryStrategyService | `entry-strategy.ts` | 9 entry distribution strategies |
| TPStrategyService | `tp-strategy.ts` | 9 TP distribution strategies |

### Support Services
| Service | File | Description |
|---------|------|-------------|
| SignalFilterService | `signal-filter.ts` | 10 filter capabilities |
| PositionMonitoringService | `position-monitor.ts` | Real-time position tracking |
| OrderFillTrackingService | `order-fill-tracker.ts` | Order fill status tracking |
| ExchangeOrderService | `exchange-order.ts` | Real exchange order execution |

---

## Database Models

### New Models (v2.0.0)
1. **TPGraceState** - TP Grace retry state tracking
2. **TrailingState** - Trailing stop state tracking  
3. **FirstEntryIteration** - First Entry iteration history
4. **OrderExecution** - Exchange order tracking

---

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/firstentry` | Configure First Entry as Market |
| `/tpgrace` | Configure TP Grace |
| `/trailing` | Configure Trailing Stop |
| `/trailingentry` | Configure Trailing Entry |
| `/trailingtp` | Configure Trailing TP |
| `/entrystrategy` | Set entry strategy |
| `/tpstrategy` | Set TP strategy |
| `/movingtp` | Toggle Moving TP |
| `/sl` | Configure Stop Loss |
| `/leverage` | Configure Leverage |
| `/direction` | Set direction filter |
| `/autoclose` | Toggle Auto-Close |
| `/grace` | Set Entry Grace |
| `/autoexec` | Toggle Auto-Execute |
| `/filters` | Configure Signal Filters |
| `/config` | Show current configuration |
| `/reset` | Reset to defaults |
| `/cornix` | Show help |

---

## References

- [Cornix First Entry as Market](https://help.cornix.io/en/articles/5814856-first-entry-as-market)
- [Cornix Take-Profit Grace](https://help.cornix.io/en/articles/11121738-take-profit-grace)
- [Cornix Signal Posting](https://help.cornix.io/en/articles/5814956-signal-posting)
