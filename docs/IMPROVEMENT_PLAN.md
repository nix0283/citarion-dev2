# 🚀 CITARION - ФИНАЛЬНЫЙ ПЛАН ПРОДАКШН-МИГРАЦИИ

**Версия:** 2.0.0  
**Дата:** Март 2026  
**Цель:** Привести все компоненты к production-ready статусу

---

## ✅ ВЫПОЛНЕННЫЕ ЗАДАЧИ (v1.x → v2.1)

### UI/UX Редизайн
| Задача | Статус | Описание |
|--------|--------|----------|
| Unified Color System | ✅ Завершено | 40+ компонентов используют #0ECB81/#F6465D |
| Hydration Fix | ✅ Завершено | TimeAgo/TimeUntil компоненты |
| Dark Theme | ✅ Завершено | Binance-inspired theme по умолчанию |
| Responsive Design | ✅ Завершено | Mobile-first, 3-column desktop |
| Demo Data | ✅ Завершено | Комплексные демо-данные для всех views |

### Архитектура
| Задача | Статус | Описание |
|--------|--------|----------|
| Design System Docs | ✅ Завершено | UI_REDESIGN_2026.md |
| Worklog | ✅ Завершено | Полная история изменений |
| GitHub Backup | ✅ Завершено | 2 репозитория (citarion-dev, citarion-dev2) |

---

## 📊 ОБЗОР ОСТАВШИХСЯ ЗАДАЧ

| Категория | Компонентов | Приоритет | Оценка времени |
|-----------|-------------|-----------|----------------|
| Биржевые подключения | 6 ботов | P0 | 30ч |
| ML/AI микросервисы | 3 модуля | P1 | 35ч |
| Инфраструктура | 4 задачи | P0 | 25ч |
| Документация | 2 задачи | P2 | 10ч |
| **ИТОГО** | **15** | | **~100ч (13 дней)** |

---

## 🎯 ЭТАП 1: КРИТИЧЕСКАЯ ИНФРАСТРУКТУРА (P0) — 55ч

### 1.1 TimescaleDB Migration [8ч] ⚠️ В ПРОЦЕССЕ

**Текущее состояние:**
- ✅ SQLite schema готова
- ✅ TimescaleDB migration guide готов
- ❌ Не мигрировано

**Задачи:**

| # | Задача | Время | Статус |
|---|--------|-------|--------|
| 1.1.1 | Настроить PostgreSQL + TimescaleDB | 2ч | ⏳ |
| 1.1.2 | Обновить Prisma schema для PostgreSQL | 1ч | ⏳ |
| 1.1.3 | Создать hypertables | 1ч | ⏳ |
| 1.1.4 | Мигрировать существующие данные | 2ч | ⏳ |
| 1.1.5 | Настроить continuous aggregates | 1ч | ⏳ |
| 1.1.6 | Тестирование производительности | 1ч | ⏳ |

**Производительность (ожидаемая):**

| Операция | SQLite | TimescaleDB |
|----------|--------|-------------|
| Insert 1M candles | ~60s | ~5s |
| Query 1 year hourly | ~2s | ~50ms |
| Storage (1 year) | ~500MB | ~50MB (compressed) |

---

### 1.2 Redis Caching Layer [6ч]

**Текущее состояние:**
- ✅ Redis клиент установлен (5.11.0)
- ⚠️ In-memory fallback работает
- ❌ Production Redis не настроен

**Задачи:**

| # | Задача | Время |
|---|--------|-------|
| 1.2.1 | Настроить Redis cluster | 1.5ч |
| 1.2.2 | Реализовать cache strategies | 2ч |
| 1.2.3 | Добавить cache invalidation | 1.5ч |
| 1.2.4 | Мониторинг hit/miss rates | 1ч |

**Cache Strategy:**

```typescript
const CACHE_STRATEGY = {
  prices: { ttl: 5, pattern: 'price:{symbol}' },
  ohlcv: { ttl: 60, pattern: 'ohlcv:{symbol}:{tf}' },
  positions: { ttl: 10, pattern: 'positions:{userId}' },
  signals: { ttl: 30, pattern: 'signals:{userId}' },
};
```

---

### 1.3 NATS Message Queue [8ч]

**Текущее состояние:**
- ✅ Event Queue заглушка
- ❌ NATS не интегрирован

**Задачи:**

| # | Задача | Время |
|---|--------|-------|
| 1.3.1 | Установить NATS JetStream | 2ч |
| 1.3.2 | Создать event bus | 2ч |
| 1.3.3 | Интегрировать с ботами | 2ч |
| 1.3.4 | Добавить dead letter queue | 2ч |

**Subject Structure:**

```
bots.grid.{BOT_ID}.started
bots.grid.{BOT_ID}.order.filled
risk.kill_switch.triggered
prices.{SYMBOL}.update
ml.prediction.{SYMBOL}
```

---

### 1.4 WebSocket Infrastructure [8ч]

**Текущее состояние:**
- ✅ Socket.io клиент
- ✅ Exchange WebSocket Manager
- ⚠️ Не все биржи поддерживаются

**Задачи:**

| # | Задача | Время |
|---|--------|-------|
| 1.4.1 | Полная интеграция Binance WS | 2ч |
| 1.4.2 | Полная интеграция Bybit WS | 1.5ч |
| 1.4.3 | Полная интеграция OKX WS | 1.5ч |
| 1.4.4 | Reconnection logic | 1ч |
| 1.4.5 | State recovery | 2ч |

---

### 1.5 Bot Exchange Integration [15ч]

**Текущее состояние:**
- ✅ Grid Bot Engine
- ✅ DCA Bot Engine
- ⚠️ Нет реального подключения к бирже
- ⚠️ Paper Trading работает

**Задачи:**

| # | Задача | Время | Бот |
|---|--------|-------|-----|
| 1.5.1 | Grid Bot → Exchange | 3ч | GridBot |
| 1.5.2 | DCA Bot → Exchange | 3ч | DcaBot |
| 1.5.3 | BB Bot → Exchange | 2ч | BBBot |
| 1.5.4 | Vision Bot → Exchange | 2ч | VisionBot |
| 1.5.5 | Orion Bot → Exchange | 2ч | OrionBot |
| 1.5.6 | Range Bot → Exchange | 2ч | RangeBot |
| 1.5.7 | Integration tests | 1ч | All |

---

### 1.6 HFT Bot — Go Microservice [10ч]

**Проблема:** JavaScript не подходит для реального HFT (< 10ms latency)

**Решение:** Go microservice с WebSocket

**Задачи:**

| # | Задача | Время | Технология |
|---|--------|-------|------------|
| 1.6.1 | Создать Go HFT service | 4ч | Go |
| 1.6.2 | Orderbook manager | 2ч | Go |
| 1.6.3 | Latency monitoring | 1.5ч | Go |
| 1.6.4 | Redis integration | 1.5ч | Go + Redis |
| 1.6.5 | Next.js API bridge | 1ч | TypeScript |

**Структура:**

```
mini-services/hft-service/
├── main.go
├── internal/
│   ├── orderbook/orderbook.go
│   ├── engine/hft.go
│   └── ws/client.go
└── config/config.yaml
```

---

## 🎯 ЭТАП 2: ML/AI МИКРОСЕРВИСЫ (P1) — 35ч

### 2.1 Python ML Service [15ч]

**Текущее состояние:**
- ✅ Feature Engineer (JS)
- ⚠️ AutoML Engine — stub
- ⚠️ Model Registry — stub

**Задачи:**

| # | Задача | Время | Технология |
|---|--------|-------|------------|
| 2.1.1 | Создать FastAPI service | 2ч | Python |
| 2.1.2 | LSTM Price Predictor | 3ч | TensorFlow |
| 2.1.3 | Signal Classifier | 2ч | scikit-learn |
| 2.1.4 | Regime Detector | 2ч | Python |
| 2.1.5 | Model versioning | 2ч | Python |
| 2.1.6 | Training pipeline | 2ч | Python |
| 2.1.7 | API bridge | 2ч | TypeScript |

**Структура:**

```
mini-services/ml-service/
├── main.py
├── models/
│   ├── price_predictor.py
│   ├── signal_classifier.py
│   └── regime_detector.py
├── training/
│   ├── trainer.py
│   └── hyperopt.py
└── api/routes.py
```

---

### 2.2 RL Agents Service [10ч]

**Текущее состояние:**
- ⚠️ PPO Agent — simplified JS
- ⚠️ SAC Agent — simplified JS
- ❌ Нет реального обучения

**Задачи:**

| # | Задача | Время |
|---|--------|-------|
| 2.2.1 | Создать RL training service | 3ч |
| 2.2.2 | Реализовать Gym environment | 2ч |
| 2.2.3 | Stable Baselines3 интеграция | 3ч |
| 2.2.4 | Model export для inference | 2ч |

---

### 2.3 Genetic Algorithm Service [10ч]

**Текущее состояние:**
- ✅ NSGA2 implementation
- ✅ Overfitting protection
- ⚠️ Параллелизация ограничена

**Задачи:**

| # | Задача | Время |
|---|--------|-------|
| 2.3.1 | Worker pool для evaluation | 3ч |
| 2.3.2 | Distributed evaluation | 3ч |
| 2.3.3 | Checkpoint/Resume | 2ч |
| 2.3.4 | Real-time progress streaming | 2ч |

---

## 🎯 ЭТАП 3: ДОКУМЕНТАЦИЯ И ДЕПЛОЙ (P2) — 10ч

### 3.1 API Documentation [5ч]

| # | Задача | Время |
|---|--------|-------|
| 3.1.1 | OpenAPI spec для всех endpoints | 3ч |
| 3.1.2 | Postman collection | 1ч |
| 3.1.3 | Примеры запросов | 1ч |

### 3.2 Deployment Guide [5ч]

| # | Задача | Время |
|---|--------|-------|
| 3.2.1 | Docker Compose для production | 2ч |
| 3.2.2 | Kubernetes manifests | 2ч |
| 3.2.3 | CI/CD pipeline | 1ч |

---

## 📊 ПРИОРИТЕТЫ

| Приоритет | Задача | Impact | Effort | Когда |
|-----------|--------|--------|--------|-------|
| P0 | TimescaleDB Migration | Высокий | Средний | Неделя 1 |
| P0 | Redis Caching | Высокий | Низкий | Неделя 1 |
| P0 | WebSocket Infrastructure | Высокий | Средний | Неделя 1 |
| P0 | Bot Exchange Integration | Критический | Высокий | Неделя 2 |
| P1 | NATS Message Queue | Средний | Средний | Неделя 2 |
| P1 | Python ML Service | Высокий | Высокий | Неделя 3 |
| P1 | HFT Go Service | Средний | Средний | Неделя 3 |
| P1 | RL Agents Service | Средний | Средний | Неделя 4 |
| P2 | Documentation | Низкий | Низкий | Неделя 4 |

---

## 🗓️ ТАЙМЛАЙН

### Неделя 1 (Инфраструктура)
- [ ] TimescaleDB setup
- [ ] Redis caching
- [ ] WebSocket improvements

### Неделя 2 (Боты)
- [ ] Grid/DCA/BB exchange integration
- [ ] Vision/Orion/Range exchange integration
- [ ] NATS message queue

### Неделя 3 (ML/AI)
- [ ] Python ML service
- [ ] TensorFlow models
- [ ] HFT Go service

### Неделя 4 (Финализация)
- [ ] RL Agents service
- [ ] Genetic Algorithm optimization
- [ ] Documentation
- [ ] Deployment guides

---

## 🔧 ТЕХНОЛОГИЧЕСКИЙ СТЕК (ИТОГОВЫЙ)

### Frontend (Готово ✅)
- Next.js 16 + React 19 + TypeScript 5
- Tailwind CSS 4 + Shadcn/ui
- Recharts + Lightweight Charts
- Zustand + TanStack Query

### Backend (Готово ✅)
- Bun runtime
- Prisma ORM
- NextAuth.js
- Zod validation

### Database (В процессе ⏳)
- SQLite → TimescaleDB (PostgreSQL)
- Redis для кеширования

### Messaging (В процессе ⏳)
- NATS JetStream
- Socket.IO

### AI/ML Services (В процессе ⏳)
- Python FastAPI
- TensorFlow / PyTorch
- Stable Baselines3 (RL)
- scikit-learn

### HFT (В процессе ⏳)
- Go microservice
- WebSocket exchange connections

### Infrastructure (В процессе ⏳)
- Docker Compose
- Kubernetes (optional)
- Prometheus + Grafana

---

## 📝 ЗАМЕЧАНИЯ

### Выполнено в v2.1:
1. **Unified Color System** — Все 40+ компонентов используют брендовые цвета
2. **Hydration Fix** — Корректная обработка времени на сервере/клиенте
3. **GitHub Backup** — Два репозитория для резервного копирования
4. **Documentation** — Полная документация UI redesign

### Известные ограничения:
1. HFT Bot требует Go для реальных скоростей (< 10ms)
2. ML Pipeline требует Python для TensorFlow
3. SQLite не подходит для production (нужен TimescaleDB)

---

**Версия документа:** 2.0.0  
**Последнее обновление:** Март 2026  
**Автор:** CITARION Team
