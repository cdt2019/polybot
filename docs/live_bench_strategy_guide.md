# LiveBench Coding Strategy - 狙击指南

## 概述

`LiveBenchCodingStrategy` 是一个高频狙击策略，专门用于追踪 LiveBench.ai 的 "Coding" 榜单变化。它旨在捕捉 leaderboard 排名变动带来的瞬时交易机会。

## 核心逻辑

该策略包含三个核心机制：

### 1. 狙击模式 (Sniper Mode)
**触发条件**：榜首发生变化（Usurpation）。
**场景**：
- **当前**：Anthropic (Claude 3.5) 是第一。
- **事件**：OpenAI 发布 GPT-5，LiveBench 分数超过 Claude 3.5。
- **动作**：立即买入 **OpenAI** (Yes)。
- **逻辑**：抢在市场反应过来之前，买入新的冠军。

### 2. 防御/反弹模式 (Defense/Challenger Mode)
**触发条件**：出现新的 **重要模型** (Significant Model)，但分数 **未超过** 当前冠军。
**场景**：
- **当前**：Anthropic (Claude 3.5) 是第一。
- **事件**：Google 发布 Gemini 3 Flash，分数很高但略低于 Claude 3.5。
- **判断**：
    - 新模型是否包含重要关键词（如 `gpt`, `gemini`, `claude`, `o1` 等，支持正则匹配）？ -> **是**。
    - 分数是否超过榜首？ -> **否**。
- **动作**：买入 **Anthropic** (Old Leader)。
- **逻辑**：市场通常会在新模型发布前抛售旧冠军（恐慌预期）。一旦“挑战失败”尘埃落定，旧冠军价格会反弹。策略利用这一点进行套利。

### 3. "Market Sweep" 资金管理
**触发条件**：执行任何买入操作时。
**逻辑**：
- **方案**：
    1. **使用市价单 (Market Order)**：使用 `type: 'MARKET'`。
    2. **资金定额**：直接将 `$ORDER_SIZE` (如 $10) 作为 `amount` 传给交易所。
    3. **TimeInForce**: 使用 `FAK` (Fill-And-Kill)，确保只买入当前可用的流动性，未成交部分（如果有滑点）自动撤销。
- **效果**：
    - **速度最快**：无需计算 Order Book，直接吃单。
    - **资金安全**：Polymarket 的市价买单逻辑是 Input Amount = Collateral (USD)，所以你投入的就是固定的美元金额，不会因为价格波动而超支。

## 配置

### 识别关键词 (Regular Expressions)
策略使用正则表达式来识别“重要模型”。你可以在 `src/strategies/LiveBenchCodingStrategy.ts` 中修改 `significantPatterns`：

```typescript
private significantPatterns: RegExp[] = [
    /gpt/i, 
    /gemini/i, 
    /claude/i, 
    /o1/i, 
    /grok/i,
    // ... 添加更多
];
```

### 资金设置
在 `.env` 或启动参数中设置：
- `ORDER_SIZE`: 每次交易的 **美元金额** (例如 `10` 表示 $10)。

## 运行

```bash
# 启动 LiveBench 监控与策略
node dist/index.js --monitor=LiveBenchCodingMonitor --strategy=LiveBenchCodingStrategy
```

## 测试与验证

可以使用模拟脚本来验证逻辑分支：

```bash
# 验证livebench策略
npx ts-node src/scripts/test_live_bench.ts

```
