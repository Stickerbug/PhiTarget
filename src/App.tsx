import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { solveFcTarget } from "./core/solver";
import type { ChartDataset } from "./data/types";
import type { ChartRecord } from "./data/types";

const number = new Intl.NumberFormat("en-US");
const formatScore = (value: bigint | number) => typeof value === "bigint" ? value.toString() : number.format(value);
const difficultyOrder = ["ez", "hd", "in", "at"];
const difficultyName: Record<string, string> = { ez: "EZ", hd: "HD", in: "IN", at: "AT" };

function ChartCard({ chart, active, onSelect }: { chart: ChartRecord; active: boolean; onSelect: () => void }) {
  return <button className={`chart-card ${active ? "active" : ""}`} onClick={onSelect}>
    <span className={`difficulty difficulty-${chart.difficulty}`}>{difficultyName[chart.difficulty] ?? chart.difficulty.toUpperCase()}</span>
    <span className="chart-copy"><strong>{chart.title}</strong><small>{chart.chapter} · {chart.composer || "曲师资料待补"}</small></span>
    <span className="chart-meta"><b>{chart.constant?.toFixed(1) ?? "—"}</b><small>{chart.noteCount ? `${number.format(chart.noteCount)} notes` : "notes —"}</small></span>
  </button>;
}

export default function App() {
  const [dataset, setDataset] = useState<ChartDataset | null>(null);
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [minConstant, setMinConstant] = useState(0);
  const [maxConstant, setMaxConstant] = useState(18);
  const [selectedId, setSelectedId] = useState("");
  const [target, setTarget] = useState(950000);
  const [match, setMatch] = useState<"exact" | "atLeast" | "nearest">("nearest");
  useEffect(() => { import("./data/dataset").then((module) => setDataset(module.dataset)); }, []);
  const charts = dataset?.charts ?? [];
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const chapters = useMemo(() => [...new Set(charts.map((chart) => chart.chapter))].sort((a, b) => a.localeCompare(b)), []);
  const filtered = useMemo(() => {
    const result = charts.filter((chart) => {
      const searchable = `${chart.title} ${chart.composer} ${chart.illustrator} ${chart.charter}`.toLowerCase();
      return (!deferredQuery || searchable.includes(deferredQuery)) &&
        (chapter === "all" || chart.chapter === chapter) &&
        (difficulty === "all" || chart.difficulty === difficulty) &&
        (chart.constant ?? -1) >= minConstant && (chart.constant ?? 99) <= maxConstant;
    });
    return result.sort((a, b) => a.title.localeCompare(b.title) || difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty));
  }, [chapter, deferredQuery, difficulty, maxConstant, minConstant]);
  const selected = charts.find((chart) => chart.chartId === selectedId) ?? filtered[0] ?? charts[0];
  const notes = selected?.noteCount ?? 1000;
  const state = useMemo(() => {
    try { return { solutions: solveFcTarget(notes, target, match), error: "" }; }
    catch (error) { return { solutions: [], error: error instanceof Error ? error.message : "Invalid input" }; }
  }, [match, notes, target]);

  if (!dataset) return <main className="app-shell"><header className="topbar"><div className="brand"><span className="brand-mark">Φ</span><span><b>PhiTarget</b><small>GOAL SCORE / ROUTE PLANNER</small></span></div></header><section className="intro"><div><span className="kicker">PHIGROS / CHART LIBRARY</span><h1>载入曲库…</h1><p>正在读取本地版本化谱面索引。</p></div></section></main>;

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">Φ</span><span><b>PhiTarget</b><small>GOAL SCORE / ROUTE PLANNER</small></span></div><div className="top-status"><span className="status-light" />LOCAL DATA</div></header>
    <section className="intro"><div><span className="kicker">PHIGROS / CHART LIBRARY</span><h1>选谱，定目标，<em>算出路线。</em></h1><p>按章节、定数、曲师和谱师筛选谱面，再用当前可配置公式快速反推 FC 目标分数。</p></div><div className="release-stamp"><b>LIBRARY</b><strong>{dataset.charts.length}</strong><small>charts indexed</small></div></section>
    <section className="notice"><b>数据说明</b><span>谱面元数据来自公开社区数据源，包含物量和 Tap / Hold / Flick / Drag 计数；不包含完整谱面事件。计分取整仍待真实结算截图校准。</span></section>
    <section className="workspace">
      <aside className="library-panel panel"><div className="panel-title"><span className="kicker">01 / LIBRARY</span><h2>谱面目录</h2><span className="count">{number.format(filtered.length)} matches</span></div>
        <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索曲名 / 曲师 / 谱师" />
        <div className="filters"><label>章节<select value={chapter} onChange={(event) => setChapter(event.target.value)}><option value="all">全部章节</option>{chapters.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>难度<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="all">全部</option>{difficultyOrder.map((item) => <option key={item} value={item}>{difficultyName[item]}</option>)}</select></label></div>
        <div className="range-row"><label>定数下限<input type="number" min="0" max="18" step="0.1" value={minConstant} onChange={(event) => setMinConstant(Number(event.target.value))} /></label><label>定数上限<input type="number" min="0" max="18" step="0.1" value={maxConstant} onChange={(event) => setMaxConstant(Number(event.target.value))} /></label></div>
        <div className="chart-list">{filtered.slice(0, 96).map((chart) => <ChartCard key={chart.chartId} chart={chart} active={chart.chartId === selected?.chartId} onSelect={() => setSelectedId(chart.chartId)} />)}</div>{filtered.length > 96 && <p className="list-limit">结果较多，仅渲染前 96 项。缩小筛选范围以继续浏览。</p>}
      </aside>
      <section className="detail-column"><article className="chart-detail panel">{selected ? <><div className="detail-top"><div><span className={`difficulty difficulty-${selected.difficulty}`}>{difficultyName[selected.difficulty]}</span><span className="chapter-label">{selected.chapter}</span><h2>{selected.title}</h2><p>{selected.composer || "曲师资料待补"} <span>／</span> {selected.illustrator || "曲绘画师资料待补"}</p></div><div className="constant-box"><small>CONST.</small><strong>{selected.constant?.toFixed(1) ?? "—"}</strong></div></div><div className="stats-strip"><span><b>{selected.noteCount ? number.format(selected.noteCount) : "—"}</b><small>NOTE COUNT</small></span><span><b>{selected.noteCounts.tap ?? "—"}</b><small>TAP</small></span><span><b>{selected.noteCounts.hold ?? "—"}</b><small>HOLD</small></span><span><b>{selected.noteCounts.flick ?? "—"}</b><small>FLICK</small></span><span><b>{selected.noteCounts.drag ?? "—"}</b><small>DRAG</small></span><span><b>{selected.charter || "—"}</b><small>CHARTER</small></span></div></> : <p>没有找到谱面。</p>}</article>
        <article className="solver panel"><div className="panel-title"><span className="kicker">02 / TARGET</span><h2>普通模式 FC 反推</h2><span className="confidence">公式可达 · approximate</span></div><div className="solver-controls"><label>目标分数<input type="number" min="0" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label><label>求解方式<select value={match} onChange={(event) => setMatch(event.target.value as typeof match)}><option value="nearest">最接近目标</option><option value="exact">精确命中</option><option value="atLeast">至少达到</option></select></label></div><p className="formula-line">N = {number.format(notes)} · FC · Score = 1,000,000 − 315,000 × Good / N</p>{state.error ? <p className="error">{state.error}</p> : <div className="solutions">{state.solutions.map((solution) => <div className="solution" key={`${solution.good}-${solution.result.display}`}><div><strong>{formatScore(solution.result.display)}</strong><small>P {solution.perfect} · G {solution.good} · B 0 · M 0 · C {solution.maxCombo}</small></div><b className={solution.delta === 0 ? "exact" : "delta"}>{solution.delta > 0 ? "+" : ""}{formatScore(solution.delta)}</b></div>)}</div>}</article>
      </section>
    </section>
    <footer className="footer"><span>PhiTarget / local-first / no account</span><span>source version {dataset.chartVersion.slice(0, 12)} · {dataset.source.length} sources recorded</span></footer>
  </main>;
}
