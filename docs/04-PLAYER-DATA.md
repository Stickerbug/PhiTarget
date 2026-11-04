# 04 — 玩家数据与导入适配器

## 设计原则
玩家数据默认不离开设备。不要要求 sessionToken；不要将私人凭证写入 URL、日志、统计服务或 IndexedDB。不要把 PhiPlugin 设为唯一数据来源。

## 统一内部格式
```json
{
  "source": "manual|phi-plugin|phigros-tools|other",
  "sourceVersion": "optional",
  "gameVersion": "optional",
  "updatedAt": "ISO-8601",
  "records": [{
    "songId": "stable-song-id",
    "difficulty": "IN",
    "score": 987654,
    "accuracy": 99.12,
    "perfect": null,
    "good": null,
    "bad": null,
    "miss": null,
    "maxCombo": null,
    "fc": true,
    "phi": false,
    "playedAt": null
  }]
}
```

字段可缺省。存档/查分 API 经常只有最高分、ACC、FC/Phi，不一定有每次结算的 P/G/B/M 和 Max Combo。不得假定成绩文件必然含完整历史。

## 数据来源优先级
1. 用户手动录入；
2. 用户导入 JSON/CSV；
3. 用户从结算截图 OCR（后续功能）；
4. PhiPlugin 导出文件；
5. 其他站点/工具导出文件；
6. 正式授权 API（只有对方明确提供接口、许可和 CORS/授权方案后）。

## PhiPlugin 集成判断
PhiPlugin README/CHANGELOG 表明其有 API 测试/公测、历史成绩同步、Bot 认领和渲染主题等功能；这不等于所有第三方网页都能稳定调用其内部接口。首选与插件作者合作增加脱敏导出命令，例如 `/phi goal export`，输出曲目成绩，不输出 sessionToken、API Secret、账号绑定凭据。

首版仅实现通用 JSON/CSV 导入，不要逆向抓取机器人数据库，不要依赖某个公共实例，不要把未公开接口当稳定 API。

## 数据适配器
```text
ManualInputAdapter
LocalJsonAdapter
LocalCsvAdapter
PhiPluginExportAdapter
PhigrosToolsExportAdapter
```
每个适配器只负责解析外部格式并映射到统一模型。核心规划器不应知道数据来源。

## 个人能力估计
不要只看历史最高分。建议分别计算：
- bestScore / bestAccuracy；
- recentMedian；
- recentP25（保守估计，需足够样本）；
- recentBest；
- historyCount；
- lastPlayed；
- FC/Phi；
- dataFreshness。

样本少时显示“数据不足”，不要输出伪精确成功概率。第一版可用近期中位数与保守分位数进行排序，不必宣称统计学意义上的真实胜率。

## IndexedDB
保存 profile、chartRecords、scoreHistory、savedPlans、preferences、importMetadata。提供导出备份、删除单个数据源、清空全部本地数据的操作。
