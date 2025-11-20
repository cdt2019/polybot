本项目 polybot 主要作为 polymarket预测平台 的 狙击bot 。
需求：polymarket 的有些 预测时间 结果评判 居于 第三网站的 信息判定。
polybot 主要定时监控 第三方网站 的结果，进行下单，达到狙击的结果。

举例： 
https://polymarket.com/event/google-gemini-3-score-on-lmarena-by-december-31?tid=1763538437184

Google Gemini 3 score on LMArena by December 31?

OUTCOME    % CHANCE
1500+      47%
1600+      4%


Rules
This market will resolve to "Yes" if at any point any Google Gemini 3 model has at least the specified arena score based on the Chatbot Arena LLM Leaderboard (https://lmarena.ai/leaderboard/text) by December 31, 2025, 12:00 PM ET. Otherwise, this market will resolve to "No".

Results from the "Arena Score" section on the Leaderboard tab of https://lmarena.ai/leaderboard/text/overall-no-style-control with the style control off will be used to resolve this market.

The resolution source for this market is the Chatbot Arena LLM Leaderboard found at https://lmarena.ai/. If this resolution source is unavailable at check time, this market will remain open until the leaderboard comes back online and resolve based on the first check after it becomes available. If it becomes permanently unavailable, this market will resolve based on another resolution source.
Resolver

Google Gemini 3 score on LMArena by December 31? 这个事件 结果判定依赖，
https://lmarena.ai/leaderboard/text 的排行榜


编程语言:typescript
sdk需要官方的sdk包

先设计 搭起来框架 再实现，方便后续扩展。比如 不同的预测平台，不同的 预测事件 监控第三方网站不一样，需要快速扩展实现。
