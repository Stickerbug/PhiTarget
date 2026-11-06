# 曲库数据来源

当前 `charts.json` 是由公开数据源生成的静态快照，方便纯静态站点离线筛选。

- `Catrong/phi-plugin` 的 `resources/info/info.csv` 提供曲名、曲师、曲绘画师、定数和各难度谱师；`resources/info/notesInfo.json` 提供 Tap/Hold/Flick/Drag 计数。该仓库采用 GPL-3.0，快照保留来源说明；PhiTarget 没有复制其代码、曲绘或字体。
- `Catrong/phi-plugin` 的 `resources/info/infolist.json` 提供歌曲 BPM 和时长，页面将这两项并入歌曲详情；缺失值显示为 `—`。
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

## 章节选择背景

- 章节卡片的本地 WebP 来自 [SanGeDian123/Phi-Score-Query](https://github.com/SanGeDian123/Phi-Score-Query) 的 `psq-web/public/images/chapters`（Apache-2.0 项目，快照提交 `796c817f340be428c4cf1be5d55654fdd19b1701`）。
- Chapter 9 的补充图来自 [shdb5166-art/rule-of-law-tianjin](https://github.com/shdb5166-art/rule-of-law-tianjin) 的 `phigros/assets/images/chapterImages/chapter9.jpg`（快照提交 `8cd5878862f359a83312e0277cd630fad4bbc364`），并转成同尺寸 WebP。
- 这组资源包含游戏中独立的 Legacy、maimai 等章节图；因此不会再把章节的第一首歌曲绘误当成章节背景。游戏曲绘的著作权仍归原权利人所有。

## 字体和成绩等级图

- `Catrong/phi-plugin/resources/html/common/font/phi.ttf` 的字体元数据为 `Source Han Sans & Saira Hybrid`，并附带资源目录中的 Apache 2.0 许可文本；网页将其作为主字体使用。
- `resources/html/otherimg/{F,C,B,A,S,V,FC,phi,NEW}.png` 是插件资源中的等级图，已放入 `public/assets/ranks/`，用于目标分数等级显示。该资源与插件仓库的游戏素材仍应按公开发布场景单独复核。
- 蓝 V 图标使用 Phi-Plugin 资源目录的 `FC.png`（原 `V-blue.png` 文件误用了白 V 的 `V.png`），用于“任意非 Phi 分数只要全连即为蓝 V”的显示规则。
- `phi.ttf` 本身不含 U+058E（`֎`，歌曲「百鬼֎夜行」中间的符号）字形；网页为这个字符提供 Noto Sans Armenian OFL fallback，保证它不会显示成方框。若取得官方 APK 的 TextMeshPro 字体资产，可再替换为官方字形。

## 排序和搜索

- 默认歌曲顺序使用 `Phigros_Resource/info/info.tsv` 的排列索引；章节卡片顺序按录屏可见的 `Phigros → Single → Legacy → Chapter 5…9 → Side Story → 联动精选集` 组织，未出现的新增章节追加到末尾。
- Kyou 的 `aliases.json` 作为公开社区别名来源。搜索会对大小写、空格、标点和重音符号做归一化，因此 `DESTRUCTION 3,2,1` 可以用 `321` 搜到。
- “未归类”只会在曲名无法映射到曲包时出现；导入器现在会先做 Unicode/标点归一化，再用包含关系兜底匹配（例如 `The Mountain Eater` 对应 Kyou 的 `The Mountain Eater from MUSYNC`）。当前快照的 327 首歌曲已全部映射到章节。
