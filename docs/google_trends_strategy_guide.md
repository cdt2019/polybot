# Google Trends Strategy - 使用指南

## 概述

Google Trends策略现在支持对**多个类别**进行狙击交易，而不仅仅是"Trending > People"。

## 架构

### 监控器 (Monitor)
`GoogleTrendsMonitor` 返回完整的 `GoogleTrendsData` 结构：

```typescript
interface GoogleTrendsData {
  sections: TrendingSection[];
}

interface TrendingSection {
  section: string;  // e.g., "Trending", "Entertainment", "Sports"
  categories: TrendingCategory[];
}

interface TrendingCategory {
  category: string;  // e.g., "People", "Movies", "Athletes"
  items: TrendingItem[];
}

interface TrendingItem {
  rank: number;
  name: string;
}
```

### 策略 (Strategy)
`GoogleTrendsStrategy` 接收完整数据并根据配置的事件映射执行交易。

## 配置事件映射

在 `GoogleTrendsStrategy.ts` 中配置 `eventSlugMap`：

```typescript
private eventSlugMap: { [key: string]: string } = {
    // 已配置
    'Trending > People': '1-searched-person-on-google-this-year',
    
    // 可以添加更多映射
    'Entertainment > Movies': 'top-movie-2024',
    'Sports > Athletes': 'top-athlete-2024',
    'Trending > Searches': 'top-search-2024',
};
```

## 示例：添加新的狙击目标

假设你想狙击"Entertainment > Movies"类别：

1. **找到Polymarket事件的slug**
   - 访问Polymarket事件页面
   - 从URL中提取slug，例如：`https://polymarket.com/event/top-movie-2024` → `top-movie-2024`

2. **添加到事件映射**
   ```typescript
   private eventSlugMap: { [key: string]: string } = {
       'Trending > People': '1-searched-person-on-google-this-year',
       'Entertainment > Movies': 'top-movie-2024',  // 新增
   };
   ```

3. **运行bot**
   ```bash
   node dist/index.js --monitor=GoogleTrendsMonitor --strategy=GoogleTrendsStrategy
   ```

## 可用的类别

根据Google Trends 2024数据，以下类别可用：

### Trending
- Searches
- News
- Passings
- **People** ✅ (已配置)

### Entertainment
- Actors
- Movies
- Musicians
- Songs
- TV Shows

### Sports
- Athletes
- Sports Teams

### Lifestyle and gaming
- Food and Drink Recipes
- Games

### Hum to Search
- Trending Songs

### Google Maps
- Top Parks
- Top Museums
- Top Stadiums

## 工作流程

1. **监控器轮询** → 抓取Google Trends完整数据
2. **策略评估** → 遍历所有section和category
3. **匹配事件** → 检查是否有对应的Polymarket事件
4. **执行交易** → 为#1项目执行BUY YES订单
5. **防重复** → 使用`executedTrades` Set跟踪已执行的交易

## 注意事项

- 每个类别只会执行一次交易（防止重复）
- 只有在`eventSlugMap`中配置的类别才会被处理
- 默认购买价格上限为0.9
- 订单大小由`config.orderSize`控制

## 调试

查看完整的解析数据：
```bash
npx ts-node src/scripts/test_google_trends.ts
```

这将生成 `google_trends_structure.json` 文件，包含所有解析的数据。
