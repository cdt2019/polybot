# Polybot - Polymarket Trading Bot / Polymarket 交易机器人

Polybot is an automated trading bot framework designed for Polymarket. 

Polybot 是一个为 Polymarket 设计的自动化交易机器人框架。

## Features / 功能

*   **Modular Architecture**: Easy to extend with new Monitors, Strategies, and Executors.
    *   **模块化架构**：易于扩展新的监控器、策略和执行器。
*   **HLE Monitor**: Scrapes real-time scores from the HLE leaderboard using Puppeteer (bypasses bot detection).
    *   **HLE 监控**：使用 Puppeteer 从 HLE 排行榜抓取实时分数（绕过机器人检测）。
*   **Secure Wallet**: Uses encrypted Keystore (`wallet.json`) instead of storing raw private keys.
    *   **安全钱包**：使用加密的 Keystore (`wallet.json`)，而不是存储原始私钥。
*   **Notifications**: Supports Telegram and Console notifications.
    *   **通知**：支持 Telegram 和控制台通知。
*   **Logging**: Comprehensive logging to both console and daily log files (`logs/polybot-YYYY-MM-DD.log`).
    *   **日志**：详细的日志记录到控制台和每日日志文件 (`logs/polybot-YYYY-MM-DD.log`)。

## Installation / 安装

1.  **Clone the repository / 克隆仓库**:
    ```bash
    git clone https://github.com/cdt2019/polybot.git
    cd polybot
    ```

2.  **Install dependencies / 安装依赖**:
    ```bash
    npm install
    ```

3.  **Build the project / 构建项目**:
    ```bash
    npm run build
    ```

## Configuration / 配置

### 1. Environment Variables / 环境变量

Copy `.env.example` to `.env` and configure the following:
复制 `.env.example` 到 `.env` 并配置以下内容：

```env
# Telegram Notifications (Optional) / Telegram 通知（可选）
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# Polymarket API Credentials (Optional but Recommended) / API 凭证（可选但推荐）
# Get from: Polymarket → Settings → Builder Codes
# 获取方式：Polymarket → Settings → Builder Codes
CLOB_API_KEY=your_api_key
CLOB_SECRET=your_api_secret
CLOB_PASS_PHRASE=your_passphrase

# Wallet Configuration / 钱包配置
# Private key (0x prefixed hex string) / 私钥（0x 开头的十六进制字符串）
# If not set, bot will use encrypted wallet.json / 如果未设置，将使用加密的 wallet.json
PRIVATE_KEY=0x_your_private_key_here

# Monitor Configuration / 监控配置
# Polling interval in seconds / 轮询间隔（秒）
MONITOR_INTERVAL=60

# Order Configuration / 订单配置
# These can be overridden by CLI arguments / 可被命令行参数覆盖
ORDER_SIZE=10          # Order size (USDC for market buy, shares for limit/sell)
ORDER_TYPE=MARKET      # Order type: MARKET or LIMIT
ORDER_PRICE=0.0        # Price (for LIMIT orders)
```

### 2. Wallet Setup / 钱包设置

**Option A: Use Environment Variable / 使用环境变量**
Set `PRIVATE_KEY` in `.env` file.
在 `.env` 文件中设置 `PRIVATE_KEY`。

**Option B: Use Encrypted Keystore / 使用加密密钥库**
Generate `wallet.json` using the keystore generator:
使用密钥库生成器创建 `wallet.json`：

```bash
npx ts-node src/scripts/generate_keystore.ts
```

Follow the prompts to enter your private key and password. The bot will prioritize `PRIVATE_KEY` from `.env`, falling back to `wallet.json` if not set.
按照提示输入私钥和密码。Bot 优先使用 `.env` 中的 `PRIVATE_KEY`，如果未设置则使用 `wallet.json`。

## Usage / 使用方法

### Running the Bot / 运行机器人

Start the bot with the HLE Monitor and Gemini3 Strategy:
启动带有 HLE 监控和 Gemini3 策略的机器人：

```bash
node dist/index.js --monitor=HLEMonitor --strategy=Gemini3HLEStrategy
```

To start the bot with Gemini 3.0 Flash Monitor and Strategy:
```bash
node dist/index.js --monitor=Gemini3FlashMonitor --strategy=Gemini3FlashStrategy
```

To start the bot with LiveBench Coding Monitor and Strategy:
```bash
node dist/index.js --monitor=LiveBenchCodingMonitor --strategy=LiveBenchCodingStrategy
```

### Command-Line Arguments / 命令行参数

**Required / 必需:**
*   `--monitor`: Monitor class to use / 使用的监控器类 (e.g., `HLEMonitor`)
*   `--strategy`: Strategy class to use / 使用的策略类 (e.g., `Gemini3HLEStrategy`)

**Optional / 可选:**
*   `--interval`: Polling interval in seconds / 轮询间隔（秒）(default: 60 or `MONITOR_INTERVAL` from `.env`)
*   `--orderSize`: Order size / 订单数量 (default: 10 or `ORDER_SIZE` from `.env`)
*   `--orderType`: Order type (`MARKET` or `LIMIT`) / 订单类型 (default: `MARKET` or `ORDER_TYPE` from `.env`)
*   `--orderPrice`: Order price / 订单价格 (default: 0.0 or `ORDER_PRICE` from `.env`)

**Example with custom parameters / 自定义参数示例:**
```bash
node dist/index.js \
  --monitor=HLEMonitor \
  --strategy=Gemini3HLEStrategy \
  --interval=30 \
  --orderSize=50 \
  --orderType=LIMIT \
  --orderPrice=0.95
```

**Configuration Priority / 配置优先级:**
Command-line arguments > Environment variables > Default values
命令行参数 > 环境变量 > 默认值

### Scripts / 脚本

*   **Place Limit Order / 下限价单**:
    ```bash
    npx ts-node src/scripts/place_limit_order.ts
    ```

*   **Test HLE Monitor / 测试 HLE 监控**:
    ```bash
    npx ts-node src/scripts/hleMonitor.ts
    ```

## License / 许可证

MIT
