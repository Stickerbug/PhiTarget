import { useEffect, useMemo, useState } from "react";
import { parsePlayerCsv, parsePlayerJson } from "../core/playerImport";
import type { ChartRecord } from "../data/types";
import { clearPlayerScores, deletePlayerScore, listPlayerScores, savePlayerScores, type PlayerScoreRecord } from "../storage/playerStore";

const number = new Intl.NumberFormat("en-US");
type Props = { charts: ChartRecord[] };
const chartLabel = (chart: ChartRecord) => `${chart.title} · ${chart.difficulty.toUpperCase()} ${chart.constant?.toFixed(1) ?? "—"}`;

export default function PlayerProfile({ charts }: Props) {
  const [records, setRecords] = useState<PlayerScoreRecord[]>([]);
  const [chartQuery, setChartQuery] = useState("");
  const [chartId, setChartId] = useState(charts[0]?.chartId ?? "");
  const [score, setScore] = useState(950000);
  const [fc, setFc] = useState(false);
  const [message, setMessage] = useState("");
  const chartMatches = useMemo(() => {
    const query = chartQuery.trim().toLowerCase();
    return charts.filter((chart) => !query || `${chart.title} ${chart.songId} ${chart.difficulty} ${chart.constant}`.toLowerCase().includes(query)).slice(0, 40);
  }, [chartQuery, charts]);
  const recordsWithChart = useMemo(() => records.map((record) => ({ record, chart: charts.find((chart) => chart.chartId === record.chartId) })).filter((item): item is { record: PlayerScoreRecord; chart: ChartRecord } => Boolean(item.chart)), [charts, records]);
  const bestScore = records.reduce((best, record) => Math.max(best, record.score), 0);
  const recentScores = records.slice(0, 10).map((record) => record.score).sort((a, b) => a - b);
  const recentMedian = recentScores.length ? recentScores[Math.floor((recentScores.length - 1) / 2)] : 0;

  useEffect(() => { listPlayerScores().then(setRecords).catch((error) => setMessage(error instanceof Error ? error.message : "无法读取本地成绩")); }, []);

  const addRecord = async () => {
    const selectedChart = charts.find((chart) => chart.chartId === chartId);
    if (!selectedChart || !Number.isFinite(score) || score < 0 || score > 1_000_000) { setMessage("请选择谱面并输入 0–1,000,000 的分数。"); return; }
    const next = { id: crypto.randomUUID(), chartId: selectedChart.chartId, score: Math.trunc(score), fc, playedAt: new Date().toISOString(), source: "manual" as const };
    await savePlayerScores([next]);
    setRecords((current) => [next, ...current]);
    setMessage("成绩已保存在本机。");
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    const imported = file.name.toLowerCase().endsWith(".csv") ? parsePlayerCsv(text, charts) : parsePlayerJson(text, charts);
    if (!imported.length) { setMessage("没有识别到可保存的成绩。请检查 chartId/songId、难度和分数列。"); return; }
    await savePlayerScores(imported);
    setRecords((current) => [...imported, ...current]);
    setMessage(`已导入 ${imported.length} 条成绩，数据仍只保存在本机。`);
  };

  const exportRecords = () => {
    const blob = new Blob([JSON.stringify({ source: "manual", updatedAt: new Date().toISOString(), records }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "phitarget-score-history.json";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const clearAll = async () => {
    await clearPlayerScores();
    setRecords([]);
    setMessage("本地成绩已清空。");
  };

  return <main className="feature-page profile-page">
    <header className="feature-heading"><div><small>LOCAL PLAYER PROFILE</small><h1>玩家数据</h1><p>手动记录或导入成绩，供后续课题路线排序使用。所有数据保存在当前浏览器。</p></div><span className="feature-mark">Φ</span></header>
    <section className="profile-summary"><div><strong>{records.length}</strong><small>记录数</small></div><div><strong>{number.format(bestScore)}</strong><small>最高分</small></div><div><strong>{number.format(recentMedian)}</strong><small>近期中位数</small></div></section>
    <section className="profile-entry"><header><div><small>ADD SCORE</small><h2>录入一条成绩</h2></div><span>手动</span></header><div className="profile-entry-grid"><label>搜索谱面<input value={chartQuery} onChange={(event) => setChartQuery(event.target.value)} placeholder="曲名 / songId / 难度 / 定数" /></label><label>选择谱面<select value={chartId} onChange={(event) => setChartId(event.target.value)}>{chartMatches.map((chart) => <option key={chart.chartId} value={chart.chartId}>{chartLabel(chart)}</option>)}</select></label><label>分数<input type="number" min="0" max="1000000" value={score} onChange={(event) => setScore(Number(event.target.value))} /></label><label className="profile-check"><input type="checkbox" checked={fc} onChange={(event) => setFc(event.target.checked)} /> FC / Phi</label><button type="button" className="primary-action" onClick={addRecord}>保存成绩</button></div></section>
    <section className="profile-tools"><label className="file-action">导入 JSON / CSV<input type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ""; }} /></label><button type="button" onClick={exportRecords}>导出本地备份</button><button type="button" onClick={() => void clearAll()}>清空全部</button></section>
    {message && <p className="profile-message">{message}</p>}
    <section className="profile-history"><header><h2>成绩记录</h2><span>按最近录入排序</span></header>{recordsWithChart.length ? <div className="profile-record-list">{recordsWithChart.slice(0, 30).map(({ record, chart }) => <div className="profile-record" key={record.id}><img src={`https://cdn.jsdelivr.net/gh/7aGiven/Phigros_Resource@illustrationLowRes/${encodeURIComponent(chart.songId)}.png`} alt="" loading="lazy" decoding="async" /><div><strong>{chart.title}</strong><small>{chart.difficulty.toUpperCase()} {chart.constant?.toFixed(1) ?? "—"} · {new Date(record.playedAt).toLocaleString()}</small></div><span>{number.format(record.score)}{record.fc ? " · FC" : ""}</span><button type="button" aria-label="删除成绩" onClick={() => { void deletePlayerScore(record.id).then(() => setRecords((current) => current.filter((item) => item.id !== record.id))); }}>×</button></div>)}</div> : <p className="profile-empty">还没有本地成绩。你可以手动添加，或导入一个只包含成绩的 JSON/CSV 文件。</p>}</section>
  </main>;
}
