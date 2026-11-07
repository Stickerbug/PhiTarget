# 04 — TapTap 云存档与玩家数据边界

## 设计原则

玩家成绩来自其 Phigros `sessionToken` 绑定的 TapTap 云存档。PhiTarget 默认只在当前页面内存中使用 token 和映射后的成绩；用户主动保存账号时，当前浏览器 localStorage 只保存 token、服务器和账号名称，不保存成绩快照，不写入 URL、IndexedDB、日志、分析服务或自己的服务器。

这条链路依赖 PhiHub/phi-plugin 提供的公开跨域接口，接口或 CORS 策略变化时，页面应明确显示连接错误；不能把它伪装成 PhiTarget 自有的官方接口。

## 统一内部格式

```ts
type PhigrosCloudRecord = {
  id: string;
  chartId: string;
  songId: string;
  difficulty: "ez" | "hd" | "in" | "at";
  score: number;
  accuracy: number | null;
  fc: boolean;
  playedAt: string;
  source: "taptap";
};

type PhigrosCloudProfile = {
  playerId: string;
  rks: number | null;
  challengeModeRank: number | null;
  updatedAt: string | null;
  avatar: string | null;
};
```

云档通常只有每张谱面的最高分、ACC、FC/Phi 和更新时间，不保证包含每次结算的 P/G/B/M、Max Combo 或完整游玩历史。规划器只能把这些数据当作个人成绩参考。

## 读取流程

1. 用户在玩家数据页面输入 sessionToken，并选择国服或国际服。
2. 浏览器直接 POST 到 `https://phib19.top:8080/get/cloud/saves`，请求体只包含 token 和区域标记。
3. `src/core/phigrosCloud.ts` 解析 `saveInfo` 与 `gameRecord`，按当前曲库的 `songId + difficulty` 映射到已知谱面。
4. App 将记录放入 React state，课题三曲组合页可用它搜索三张已有成绩的组合，B30 页面可用它计算单曲 RKS 和 φ3 + B27。
5. 未保存账号时，用户刷新或关闭页面后，内存中的 token 和成绩一起清除；保存的账号只用于重新填充 token，成绩仍不会写入 localStorage。

## 安全边界

- token 输入框使用密码类型，不回填、不自动保存。
- 网络请求使用 HTTPS、`credentials: omit`，不携带 PhiTarget 的站点 cookie。
- 错误提示只显示接口返回的错误文本或通用状态，不显示 token 和云档原文。
- 不在客户端日志、埋点或异常上报中记录 token。
- 不提供 JSON/CSV 上传、手动成绩录入、成绩导出或本地历史库；这些入口会造成数据与真实 TapTap 云档脱节。

## 版本和缺失数据

曲库版本变化可能导致部分云档 `songId` 暂时无法匹配。页面应显示已匹配记录数量，并提示检查服务器区域或曲库版本；不能把未匹配记录默认为零分。没有记录时，课题页仍可使用无个人数据的通用规划。

如果未来 PhiHub 接口取消 CORS，先评估对方许可和认证方式，再考虑受控代理。代理不得成为开放转发器，也不得持久化 sessionToken。
