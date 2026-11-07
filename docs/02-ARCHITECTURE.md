# 02 — 纯静态技术架构

## 总体结论
第一版不需要 PhiTarget 自有服务器。站点只托管静态 HTML/CSS/JS/JSON；所有计算在浏览器运行；玩家通过 sessionToken 从 PhiHub 的 TapTap 云档接口读取成绩，成绩只保留在当前页面内存。

## 推荐技术栈
TypeScript + Vite；React（若已有仓库则沿用）；Web Worker；Vitest；Playwright（可选）；PWA 离线能力作为后续增强。

## 模块边界
```text
src/
  pages/ target-score/ challenge-combinations/ reachable-scores/ player-profile/ settings/
  components/ chart-card/ score-breakdown/ badge-selector/ plan-card/ filter-panel/ score-bucket-chart/
  core/ scoring/ normal-solver/ challenge-solver/ reachable-scores/ challenge-combinations/ personal-model/
  data/ schemas/ loaders/ versions/
  adapters/ phigros-cloud/
  workers/
  tests/
```
`core` 不依赖 React、DOM 或浏览器 API。UI 不得复制计分公式；所有计算通过 core service 完成。

## 架构图
```mermaid
flowchart TD
 A["静态站点 / PWA"] --> B["UI"]
 B --> C["应用服务层"]
 C --> D["计分引擎"]
 C --> E["课题三曲组合器"]
 C --> F["可达分数分析器"]
 G["charts.json / rules.json"] --> D
 G --> E
 H["sessionToken"] --> I["TapTap 云档适配器"]
 I --> J["统一玩家数据模型"]
 J --> E
 D --> L["Web Worker"]
 E --> L
 F --> L
```

## 云档读取边界
`src/core/phigrosCloud.ts` 负责调用 `https://phib19.top:8080/get/cloud/saves`，把 PhiHub/phi-plugin 使用的 `saveInfo` 与 `gameRecord` 映射成 PhiTarget 的成绩模型。浏览器直接请求该接口，接口需要返回 CORS 许可；PhiTarget 不做代理、不保存 token、不写入 localStorage、IndexedDB、URL 或日志。刷新页面后需要重新连接。

云档只提供最高分、ACC、FC 等摘要时，规划器不能推断完整的 P/G/B/M 和谱面顺序；界面应把这些结果标为个人成绩参考，而不是实际胜率。

## 性能策略
- 单曲公式计算直接在主线程。
- 三曲组合搜索与可达分数枚举放入 Web Worker。
- 先按难度、曲包、难度范围筛选，再组合搜索。
- 使用排序+双指针、哈希或 meet-in-the-middle；避免保存所有三重组合。
- 只返回不同策略的 Top-K/Pareto 方案。
- 支持取消任务、进度反馈和结果缓存。

## 后端边界
只有接口取消 CORS、需要一次性导入链接、OAuth、受控 API 代理、机器人推送或跨设备同步时，才考虑 Serverless Worker。Worker 不得成为核心计算依赖，不得成为开放代理，不记录 sessionToken/API Token。
