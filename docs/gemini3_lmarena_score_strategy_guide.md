# Gemini 3 LM Arena Score Strategy - 狙击指南

## 概述

`Gemini3LMArenaScoreStrategy` 是一个基于事件驱动的狙击策略，专门用于追踪 LMSYS Chatbot Arena (LMArena) 榜单。它旨在捕捉 **Google Gemini 3** 系列模型发布并由官方或社区在榜单上披露分数时的交易机会。

策略目标 Polymarket 事件：`google-gemini-3-score-on-lmarena-by-december-31`。

## 核心逻辑

该策略通过监控文本流或 API 数据，执行以下核心循环：

### 1. 模型识别与分数提取
**触发条件**：榜单数据更新。
**逻辑**：
- 遍历所有模型，筛选名称以 **`gemini-3`** 开头（不区分大小写）的模型。
- 如果存在多个 Gemini 3 模型（例如 `gemini-3-pro`, `gemini-3-flash`），提取其中的 **最高分 (Max Score)**。

### 2. 阶梯式狙击 (Tiered Sniping)
策略定义了分层目标，优先匹配高分段位。

**目标配置**：
1. **Title: "1600+"** (阈值: 1600分)
2. **Title: "1500+"** (阈值: 1500分)

**执行流程**：
- **场景 A：Gemini 3 获得 1620 分**
    1. 检查 "1600+" 市场：1620 >= 1600，条件满足。
    2. **动作**：买入 "1600+" 的 **YES**。
    3. **结束**：策略在单次循环中仅执行一个最高优先级的交易（`break`），防止在同一轮次分散资金。

- **场景 B：Gemini 3 获得 1550 分**
    1. 检查 "1600+" 市场：1550 < 1600，跳过。
    2. 检查 "1500+" 市场：1550 >= 1500，条件满足。
    3. **动作**：买入 "1500+" 的 **YES**。

### 3. "Market Sweep" 资金管理与防呆
**触发条件**：满足分数阈值且该市场尚未被本程序交易过（通过 `executedMarkets` 记录）。
**逻辑**：
- **买入方向**：**YES**。
- **价格保护**：设置 `maxPrice = 0.9` (90¢)。如果市场价格已经高于 0.9（意味着消息已经完全priced in），策略将不会买入以避免风险收益比过低。
- **订单类型**：
    - `type: 'MARKET'` (市价单)。
    - `timeInForce: 'FAK'` (Fill-And-Kill)。
- **资金定额**：使用配置中的 `$ORDER_SIZE`。

## 配置

### 资金设置
在 `.env` 或启动参数中设置：
- `ORDER_SIZE`: 每次交易的 **美元金额** (例如 `10` 表示 $10)。

### 代码硬编码配置
策略内部固定了以下参数（如需修改需编辑 `src/strategies/Gemini3LMArenaScoreStrategy.ts`）：
- **Event Slug**: `google-gemini-3-score-on-lmarena-by-december-31`
- **Model Pattern**: `startsWith('gemini-3')`

## 运行

确保已配置 Monitor 抓取 LMArena 数据，并运行策略：

```bash
# 启动 LMArena 监控与 Gemini 3 策略
node dist/index.js --monitor=LMArenaTextNotStyleMonitor --strategy=Gemini3LMArenaScoreStrategy
```

## 风险提示
1. **数据源延迟**：如果 LMArena 网页更新有延迟，或者是通过图片发布的（非文本数据），此策略可能无法第一时间触发。策略依赖 `LMArenaTextMonitor` 解析的 JSON 或文本数据。
2. **单一执行**：为了资金效率，策略在单次检测中只会买入**一个**满足条件的最高分市场。例如分数 1650 会买入 "1600+"，而不会同时买入 "1500+"（尽管逻辑上也满足），因为 "1600+" 通常赔率更高或流动性更集中。