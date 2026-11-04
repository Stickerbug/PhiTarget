# 曲库数据来源

当前 `charts.json` 是由公开数据源生成的静态快照，方便纯静态站点离线筛选。

- `Catrong/phi-plugin` 的 `resources/info/info.csv` 提供曲名、曲师、曲绘画师、定数和各难度谱师；`resources/info/notesInfo.json` 提供 Tap/Hold/Flick/Drag 计数。该仓库采用 GPL-3.0，快照保留来源说明；PhiTarget 没有复制其代码、曲绘或字体。
- Kyou (`https://kyou.net.cn`) 的公开数据快照提供曲包/章节映射。其再分发条款仍需在正式公开发布前确认，因此生成文件保留 `source terms pending review` 标记。

重新生成快照：

```bash
node scripts/import-public-chart-data.mjs
```

数据只保存谱面统计，不保存完整谱面事件 JSON。`noteCount` 是四类统计之和，作为目标分数公式的 N；完整谱面顺序验证仍属于后续阶段。

## Phigros_Resource 曲绘

- 仓库：[7aGiven/Phigros_Resource](https://github.com/7aGiven/Phigros_Resource)，GPL-3.0。
- `info` 分支与现有 327 个 `songId` 完全匹配；`illustration`、`illustrationLowRes`、`illustrationBlur` 分支分别提供高清、列表缩略图和背景图。
- 网页通过 `https://cdn.jsdelivr.net/gh/7aGiven/Phigros_Resource@<branch>/<songId>.png` 按需读取资源，不把官方/游戏曲绘复制到构建包。游戏素材的公开发布权利仍需单独确认。
