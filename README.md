# PhiTarget 开发包

**产品名：** PhiTarget  
**副标题：** Phigros Goal Score & B30 Toolkit
**定位：** Phigros 目标分数反推、可达分数分析、课题总分三曲组合工具。
**原则：** 纯静态优先、无需 PhiTarget 账号、成绩通过 sessionToken 从 TapTap 云存档读取；默认不保存凭证，用户主动勾选时才在当前浏览器 localStorage 保存账号。

## 文件导航
- `docs/00-NAMING.md`：名称与品牌
- `docs/01-PRD.md`：产品需求
- `docs/02-ARCHITECTURE.md`：静态应用与云存档读取架构
- `docs/03-SCORING-AND-SOLVER.md`：计分、反推、可达分数
- `docs/04-PLAYER-DATA.md`：TapTap 云存档读取与玩家数据边界
- `docs/05-UI-DESIGN.md`：UI 视觉与交互规范
- `docs/06-ROADMAP-AND-ACCEPTANCE.md`：开发阶段和验收标准
- `docs/07-ECOSYSTEM-ROADMAP.md`：PhiPlugin、phib19.top、Kyou 功能分析与后续路线
- `CODEX_IMPLEMENTATION_PROMPT.md`：交给 Codex 的总提示词
- `assets/ui-references/`：用户提供的四张设计参考图

## 当前可运行基线

仓库已初始化为 TypeScript + Vite + React 的静态应用。当前页面提供游戏式章节/歌曲选择、普通模式目标分数反推，以及 FC、固定 Max Combo 和普通模式理论可达分数分析；计分核心位于 `src/core/`，不依赖 UI 或浏览器 API。课题分反推和课题三曲组合现在是两个独立页面；组合页按给定课题总分搜索三首不同歌曲，连接 TapTap 云档后可按个人已有成绩筛选，也可使用数量模型给出公式候选。玩家数据和 B30 页面共享同一组云档连接，可选保存多个本机账号；B30 页面可在浏览器内计算 φ3 + B27 并生成 PNG。铭牌规则仍使用待校准的版本化配置。

当前曲库快照已包含 327 首歌曲、1,037 张谱面，以及章节、曲师、曲绘画师、谱师、定数和四类音符统计。来源与再生成说明见 `src/data/SOURCES.md`。

```bash
npm install
npm run dev
```

验证命令：

```bash
npm test
npm run typecheck
npm run build
```

计分取整和铭牌阈值目前标记为 `approximate`，需要用目标游戏版本的真实结算截图校准后再升级为正式规则。审计结论见 `docs/analysis/INITIAL_AUDIT.md`，后续阶段见 `docs/analysis/IMPLEMENTATION_PLAN.md`。

## 关键边界
1. 普通模式已知判定数量和 Max Combo 时，计算分数不需要完整谱面 JSON。
2. 普通模式仅凭 P/G/B/M 总数不能唯一确定 Max Combo；验证具体谱面顺序下的可达性，需要额外模型或完整谱面事件数据。
3. Bad/Miss 会打断 Combo；给定 P/G/B/M 时，理论 Max Combo 范围为 `ceil((P+G)/(B+M+1))` 到 `P+G`。全 Perfect/Good 时必须是 FC，全 Bad/Miss 时必须是 0；这仍不能仅凭总数恢复实际断连位置。
4. 课题模式不使用连击分。不同音符类型可获得的判定不同，不能把所有 note 都假设为可出 Good/Bad。
5. 必须区分公式可达、音符类型约束可达、完整谱面顺序验证。
6. 取整、铭牌阈值、曲库版本必须可配置，并用真实结算截图校准。
7. PhiPlugin 图片仅作为视觉参考；不要复制其代码、曲绘、品牌资产或受限数据。检查原仓库许可证后再决定是否借鉴具体实现。

## 建议技术栈
TypeScript + Vite + React（或沿用现有框架）+ Web Worker + Vitest。第一版不需要 PhiTarget 自有后端；TapTap 云档读取使用 PhiHub 公开的跨域接口。
