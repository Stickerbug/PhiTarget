import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPhigrosCloudSave, type PhigrosCloudData, type PhigrosCloudRecord } from "../core/phigrosCloud";
import type { ChartRecord } from "../data/types";

const number = new Intl.NumberFormat("en-US");
type Props = { charts: ChartRecord[]; records: PhigrosCloudRecord[]; profile: PhigrosCloudData["profile"] | null; fetchedAt: string | null; onLoaded: (data: PhigrosCloudData) => void };
const chartLabel = (chart: ChartRecord) => `${chart.title} · ${chart.difficulty.toUpperCase()} ${chart.constant?.toFixed(1) ?? "—"}`;

const challengeLabel = (value: number | null) => {
  if (value === null) return "—";
  const badge = ["白", "绿", "蓝", "红", "金", "彩"][Math.floor(value / 100)] ?? "白";
  return `${badge}${value % 100}`;
};

export default function PlayerProfile({ charts, records, profile, fetchedAt, onLoaded }: Props) {
  const [token, setToken] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [chartQuery, setChartQuery] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const chartById = useMemo(() => new Map(charts.map((chart) => [chart.chartId, chart])), [charts]);
  const chartMatches = useMemo(() => {
    const query = chartQuery.trim().toLowerCase();
    return charts.filter((chart) => !query || `${chart.title} ${chart.songId} ${chart.difficulty} ${chart.constant}`.toLowerCase().includes(query)).slice(0, 50);
  }, [chartQuery, charts]);
  const visibleRecords = useMemo(() => {
    const query = chartQuery.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) => {
      const chart = chartById.get(record.chartId);
      return chart && `${chart.title} ${chart.songId} ${record.difficulty} ${chart.constant}`.toLowerCase().includes(query);
    });
  }, [chartById, chartQuery, records]);
  const bestScore = records.reduce((best, record) => Math.max(best, record.score), 0);
  const recentScores = records.slice(0, 10).map((record) => record.score).sort((a, b) => a - b);
  const recentMedian = recentScores.length ? recentScores[Math.floor((recentScores.length - 1) / 2)] : 0;

  const connect = async () => {
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setBusy(true);
    setMessage("");
    try {
      const data = await fetchPhigrosCloudSave(token, isGlobal, charts, nextController.signal);
      onLoaded(data);
      setMessage(`已读取 ${data.records.length} 条成绩；token 仅在本页内存中使用。`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "获取 TapTap 云存档失败");
    } finally {
      if (controller.current === nextController) {
        controller.current = null;
        setBusy(false);
      }
    }
  };

  return <main className="feature-page profile-page">
    <header className="feature-heading"><div><small>TAPTAP CLOUD PROFILE</small><h1>玩家数据</h1><p>使用 Phigros sessionToken 读取 TapTap 云存档；PhiTarget 不保存 token，也不接收你的成绩数据。</p></div><span className="feature-mark">Φ</span></header>
    <section className="profile-entry"><header><div><small>PHIGROS SESSIONTOKEN</small><h2>连接 TapTap 云存档</h2></div><span>仅内存</span></header><div className="profile-token-grid"><label>sessionToken<input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} placeholder="25 位字母数字字符串" /></label><label>服务器<select value={isGlobal ? "global" : "cn"} onChange={(event) => setIsGlobal(event.target.value === "global")}><option value="cn">国服</option><option value="global">国际服</option></select></label><button type="button" className="primary-action" disabled={busy || !token.trim()} onClick={() => void connect()}>{busy ? "读取中…" : "读取成绩"}</button></div><p className="profile-security-note">请求直接发送到 <a href="https://phib19.top" target="_blank" rel="noreferrer">PhiHub / phi-plugin API</a>。刷新页面后 token 会清除；不要在公共设备上输入 token。</p></section>
    {message && <p className="profile-message">{message}</p>}
    <section className="profile-summary"><div><strong>{records.length}</strong><small>已匹配谱面</small></div><div><strong>{number.format(bestScore)}</strong><small>最高分</small></div><div><strong>{number.format(recentMedian)}</strong><small>近期中位数</small></div></section>
    {profile && <section className="profile-cloud-card"><div><small>PLAYER ID</small><strong>{profile.playerId || "—"}</strong></div><div><small>RKS</small><strong>{profile.rks === null ? "—" : profile.rks.toFixed(4)}</strong></div><div><small>课题</small><strong>{challengeLabel(profile.challengeModeRank)}</strong></div><div><small>存档更新时间</small><strong>{profile.updatedAt ? new Date(profile.updatedAt).toLocaleString() : "—"}</strong></div></section>}
    <section className="profile-history"><header><div><small>LIVE RECORDS</small><h2>云存档成绩</h2></div><span>{fetchedAt ? `读取于 ${new Date(fetchedAt).toLocaleString()}` : "尚未连接"}</span></header><div className="profile-record-filter"><input value={chartQuery} onChange={(event) => setChartQuery(event.target.value)} placeholder="筛选曲名 / songId / 难度 / 定数" />{chartQuery && <span>{chartMatches.length} 张谱面匹配</span>}</div>{visibleRecords.length ? <div className="profile-record-list">{visibleRecords.slice(0, 80).map((record) => { const chart = chartById.get(record.chartId); if (!chart) return null; return <div className="profile-record" key={record.id}><img src={`https://cdn.jsdelivr.net/gh/7aGiven/Phigros_Resource@illustrationLowRes/${encodeURIComponent(chart.songId)}.png`} alt="" loading="lazy" decoding="async" /><div><strong>{chart.title}</strong><small>{chartLabel(chart)} · ACC {record.accuracy === null ? "—" : `${record.accuracy.toFixed(2)}%`}</small></div><span>{number.format(record.score)}{record.fc ? " · FC" : ""}</span></div>; })}</div> : <p className="profile-empty">连接后会在这里显示 TapTap 云存档里的已匹配成绩。</p>}</section>
  </main>;
}
