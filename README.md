# PhiTarget 开发包

**产品名：** PhiTarget  
**副标题：** Phigros Goal Score & Challenge Planner  
**定位：** Phigros 目标分数反推、可达分数分析、课题模式三曲规划工具。  
**原则：** 纯静态优先、Local-first、无需账号、玩家数据默认只留在本地。

## 文件导航
- `docs/00-NAMING.md`：名称与品牌
- `docs/01-PRD.md`：产品需求
- `docs/02-ARCHITECTURE.md`：纯静态技术架构
- `docs/03-SCORING-AND-SOLVER.md`：计分、反推、可达分数
- `docs/04-PLAYER-DATA.md`：玩家数据与导入适配器
- `docs/05-UI-DESIGN.md`：UI 视觉与交互规范
- `docs/06-ROADMAP-AND-ACCEPTANCE.md`：开发阶段和验收标准
- `CODEX_IMPLEMENTATION_PROMPT.md`：交给 Codex 的总提示词
- `assets/ui-references/`：用户提供的四张设计参考图

## 当前可运行基线

仓库已初始化为 TypeScript + Vite + React 的静态应用。当前页面提供普通模式 FC 目标分数反推，计分核心位于 `src/core/`，不依赖 UI 或浏览器 API；曲库和铭牌规则使用版本化 JSON 占位，尚未接入未经许可的真实数据。

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
3. 课题模式不使用连击分。不同音符类型可获得的判定不同，不能把所有 note 都假设为可出 Good/Bad。
4. 必须区分公式可达、音符类型约束可达、完整谱面顺序验证。
5. 取整、铭牌阈值、曲库版本必须可配置，并用真实结算截图校准。
6. PhiPlugin 图片仅作为视觉参考；不要复制其代码、曲绘、品牌资产或受限数据。检查原仓库许可证后再决定是否借鉴具体实现。

## 建议技术栈
TypeScript + Vite + React（或沿用现有框架）+ IndexedDB + Web Worker + Vitest。第一版不需要后端。
