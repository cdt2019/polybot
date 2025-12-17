基于您提供的代码文件，以下是 `LMArenaTextNoStyleStrategy` 和 `LMArenaTextStrategy` 的详细使用指南。这两个策略共享基于排名的核心逻辑，但分别针对 LMArena 的不同榜单（有/无风格控制）。

---

# LMArena Text Ranking Strategies 使用指南

本指南涵盖了两个核心排名追踪策略：
1.  **LMArenaTextNoStyleStrategy** (针对 No Style Control 榜单)
2.  **LMArenaTextStrategy** (针对 Style Control ON 榜单)

## 1. LMArena Text (No Style Control) Strategy

### 概述
该策略追踪 [LMSYS Chatbot Arena (No Style Control)](https://lmarena.ai/leaderboard/text/overall-no-style-control) 榜单。由于新模型往往最先出现在 "No Style Control" 榜单上（因为风格控制计算需要更多时间或数据），该策略通常比标准榜单反应更快。

### 核心逻辑
策略监控榜单的前 3 名（Rank #1, #2, #3）。当监测到**排名持有公司发生变化**时，触发交易。

#### 运作流程：
1.  **数据抓取**：使用 `LMArenaTextNoStyleMonitor` 抓取网页。
2.  **公司映射**：将模型名称映射为公司实体（Polymarket 选项）。
    *   *例如：`claude-3.5-sonnet` -> Anthropic*
    *   *例如：`gemini-1.5-pro` -> Google*
3.  **状态对比**：
    *   **场景**：榜首从 **Google** 变为 **OpenAI**。
    *   **动作 1**：在 "Rank #1" 市场买入 **OpenAI** 的 **YES**。
    *   **动作 2**：在 "Rank #1" 市场买入 **Google** 的 **NO** (如果之前 Google 是榜首)。
4.  **防抖动**：通过 `lastUpdated` 字段（榜单版本号）防止在同一次榜单更新中重复交易。

### 目标市场 (Polymarket)
策略会根据当前日期自动选择对应的月份合约（代码中已硬编码至 2026 年 6 月）。

**示例 Event Slugs (Dec 2025):**
*   Rank #1: `which-company-has-best-ai-model-end-of-2025`
*   Rank #2: `which-company-has-second-best-ai-model-end-of-december`
*   Rank #3: `which-company-has-the-third-best-ai-model-end-of-december`

### 运行命令

```bash
# 启动 No Style Control 监控与策略
node dist/index.js --monitor=LMArenaTextNoStyleMonitor --strategy=LMArenaTextNoStyleStrategy
```

---

## 2. LMArena Text (Style Control ON) Strategy

### 概述
该策略追踪标准的 [LMSYS Chatbot Arena (Style Control ON)](https://lmarena.ai/leaderboard/text) 榜单。这是 Polymarket 大多数长期合约（如 "End of Month"）默认参考的结算标准。

### 核心逻辑
逻辑与 No Style Control 版本完全一致，区别仅在于**数据源**和**目标市场**。

### 目标市场 (Polymarket)
目标市场 Slug 通常带有 `style-control-on` 后缀。

**示例 Event Slugs (Dec 2025):**
*   Rank #1: `which-company-has-top-ai-model-end-of-december-style-control-on`
*   Rank #2: `which-company-has-the-2-ai-model-end-of-december-style-control-on`
*   Rank #3: `which-company-has-the-3-ai-model-end-of-december-style-control-on`

### 运行命令

```bash
# 启动标准 Style Control 监控与策略
node dist/index.js --monitor=LMArenaTextMonitor --strategy=LMArenaTextStrategy
```

---

## 通用配置与注意事项

### 环境变量 (.env)
这两个策略都依赖以下基础配置：
*   `ORDER_SIZE`: 单笔交易金额 (USD)。
*   `ORDER_PRICE`: 价格保护阈值 (默认 0.9)。如果当前 Ask 价格高于此值，策略将跳过购买，避免接盘。

### 公司名称映射 (Company Map)
策略依赖 `COMPANY_MAP` 将模型名称前缀转换为公司名。如果出现全新命名的模型系列（例如 Apple 发布了 `ajax-1`），需要在代码中更新映射表，否则策略会识别为 `Unknown` 并跳过交易。

**当前支持的映射前缀：**
`claude` (Anthropic), `gpt` (OpenAI), `gemini` (Google), `grok` (xAI), `llama` (Meta), `mistral`/`codestral` (Mistral), `deepseek` (DeepSeek) 等。

### 风险提示
1.  **网页结构变更**：策略使用 Puppeteer 解析 HTML 表格。如果 LMArena 更改了网页 DOM 结构（例如改变列顺序），Monitor 可能会解析失败或报错。
2.  **数据滞后**：Puppeteer 抓取速度慢于 API，且 LMArena 可能有 Cloudflare 防护。
3.  **榜单版本识别**：策略强依赖页面上的 "Last Updated" 文本来判断是否更新。如果该日期格式变更（代码支持多种格式，但非全部），策略可能会停止触发。

### 调试与维护
*   **重置状态**：策略类提供了 `reset()` 方法，可在不重启进程的情况下清空内存中的排名状态。
*   **增加月份**：`getEventPeriods()` 方法中硬编码了到 2026 年 6 月的 Slug。随着时间推移，需要手动在代码中添加新的月份合约 Slug。