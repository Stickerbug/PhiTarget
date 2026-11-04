import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { solveFcTarget, solveNormalTarget, solveNormalUnrestrictedTarget } from "./core/solver";
import type { ChartDataset, ChartRecord } from "./data/types";

const number = new Intl.NumberFormat("en-US");
const difficultyOrder = ["ez", "hd", "in", "at"];
const difficultyName: Record<string, string> = { ez: "EZ", hd: "HD", in: "IN", at: "AT" };
const sortNames: Record<string, string> = { title: "曲名", constantAsc: "定数 ↑", constantDesc: "定数 ↓", notes: "物量 ↓" };
const resourceCdn = "https://cdn.jsdelivr.net/gh/7aGiven/Phigros_Resource";
const assetUrl = (songId: string, branch: "illustration" | "illustrationLowRes" | "illustrationBlur") => `${resourceCdn}@${branch}/${encodeURIComponent(songId)}.png`;
type ScoreRank = "F" | "C" | "B" | "A" | "S" | "V" | "phi";
const rankAssets: Record<ScoreRank, string> = { F: "/assets/ranks/F.png", C: "/assets/ranks/C.png", B: "/assets/ranks/B.png", A: "/assets/ranks/A.png", S: "/assets/ranks/S.png", V: "/assets/ranks/V.png", phi: "/assets/ranks/phi.png" };

const formatScore = (value: bigint | number) => typeof value === "bigint" ? value.toString() : number.format(value);
const rankForScore = (score: number): ScoreRank => score >= 1_000_000 ? "phi" : score >= 950_000 ? "V" : score >= 900_000 ? "S" : score >= 820_000 ? "A" : score >= 700_000 ? "B" : score >= 600_000 ? "C" : "F";

function SongRow({ charts, selectedId, onSelect }: { charts: ChartRecord[]; selectedId: string; onSelect: (chart: ChartRecord) => void }) {
  const first = charts[0];
  const active = charts.some((chart) => chart.chartId === selectedId);
  const ordered = [...charts].sort((a, b) => difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty));
  return <button className={`song-row ${active ? "active" : ""}`} onClick={() => onSelect(charts.find((chart) => chart.chartId === selectedId) ?? first)}>
    <img src={assetUrl(first.songId, "illustrationLowRes")} alt="" loading="lazy" />
    <span className="song-row-copy"><strong>{first.title}</strong><small>{first.composer || "Unknown composer"}</small></span>
    <span className="song-row-levels">{ordered.map((chart) => <span key={chart.chartId} className={`song-level difficulty-${chart.difficulty} ${chart.chartId === selectedId ? "selected" : ""}`} onClick={(event) => { event.stopPropagation(); onSelect(chart); }}>{chart.constant?.toFixed(1) ?? "—"}</span>)}</span>
  </button>;
}

function ChapterCard({ label, art, active, onSelect }: { label: string; art: string; active: boolean; onSelect: () => void }) {
  return <button className={`chapter-card ${active ? "active" : ""}`} onClick={onSelect}><img src={art} alt="" loading="lazy" /><span>{label}</span></button>;
}

export default function App() {
  const [dataset, setDataset] = useState<ChartDataset | null>(null);
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [sortMode, setSortMode] = useState<keyof typeof sortNames>("title");
  const [minConstant, setMinConstant] = useState(0);
  const [maxConstant, setMaxConstant] = useState(18);
  const [selectedId, setSelectedId] = useState("");
  const [target, setTarget] = useState(950000);
  const [match, setMatch] = useState<"exact" | "atLeast" | "nearest">("nearest");
  const [scoreMode, setScoreMode] = useState<"normal" | "fc" | "combo">("normal");
  const [maxCombo, setMaxCombo] = useState(1000);

  useEffect(() => { import("./data/dataset").then((module) => setDataset(module.dataset)); }, []);
  const charts = dataset?.charts ?? [];
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const chapters = useMemo(() => [...new Set(charts.map((chart) => chart.chapter))], [charts]);
  const chapterCards = useMemo(() => chapters.map((name) => ({ name, chart: charts.find((chart) => chart.chapter === name) })).filter((item): item is { name: string; chart: ChartRecord } => Boolean(item.chart)), [chapters, charts]);
  const filtered = useMemo(() => {
    const result = charts.filter((chart) => {
      const searchable = `${chart.title} ${chart.composer} ${chart.illustrator} ${chart.charter}`.toLowerCase();
      return (!deferredQuery || searchable.includes(deferredQuery)) && (chapter === "all" || chart.chapter === chapter) && (difficulty === "all" || chart.difficulty === difficulty) && (chart.constant ?? -1) >= minConstant && (chart.constant ?? 99) <= maxConstant;
    });
    return result.sort((a, b) => {
      if (sortMode === "constantAsc") return (a.constant ?? -1) - (b.constant ?? -1) || a.title.localeCompare(b.title);
      if (sortMode === "constantDesc") return (b.constant ?? -1) - (a.constant ?? -1) || a.title.localeCompare(b.title);
      if (sortMode === "notes") return (b.noteCount ?? -1) - (a.noteCount ?? -1) || a.title.localeCompare(b.title);
      return a.title.localeCompare(b.title) || difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty);
    });
  }, [chapter, deferredQuery, difficulty, maxConstant, minConstant, sortMode, charts]);
  const selected = charts.find((chart) => chart.chartId === selectedId) ?? filtered[0] ?? charts[0];
  const selectedSongCharts = useMemo(() => selected ? charts.filter((chart) => chart.songId === selected.songId).sort((a, b) => difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty)) : [], [charts, selected]);
  const songRows = useMemo(() => {
    const groups = new Map<string, ChartRecord[]>();
    for (const chart of filtered) groups.set(chart.songId, [...(groups.get(chart.songId) ?? []), chart]);
    return [...groups.values()].slice(0, 96);
  }, [filtered]);
  const notes = selected?.noteCount ?? 1000;
  const effectiveCombo = scoreMode === "fc" ? notes : Math.min(maxCombo, notes);
  const state = useMemo(() => {
    try {
      const solutions = scoreMode === "normal" ? solveNormalUnrestrictedTarget(notes, target, match) : scoreMode === "fc" ? solveFcTarget(notes, target, match) : solveNormalTarget(notes, effectiveCombo, target, match);
      return { solutions, error: "" };
    }
    catch (error) { return { solutions: [], error: error instanceof Error ? error.message : "Invalid input" }; }
  }, [effectiveCombo, match, notes, scoreMode, target]);
  const selectedArt = selected ? assetUrl(selected.songId, "illustration") : "";
  const selectedBlur = selected ? assetUrl(selected.songId, "illustrationBlur") : "";
  const chapterLabel = chapter === "all" ? "全部歌曲" : chapter;

  if (!dataset) return <main className="loading-screen"><span className="loading-mark">Φ</span><p>正在读取曲库索引…</p></main>;

  return <main className="app-shell">
    <section className="game-screen" style={selectedBlur ? { "--selected-art": `url(${selectedBlur})` } as CSSProperties : undefined}>
      <div className="network-lines" />
      <header className="game-header"><div className="game-header-title"><small>PHITARGET / {chapterLabel}</small><strong>曲目选择</strong></div><div className="player-chip"><span className="player-level">40</span><span><b>LOCAL</b><small>LIBRARY {dataset.charts.length}</small></span></div></header>
      <div className="chapter-strip"><ChapterCard label="全部" art={chapterCards[0]?.chart ? assetUrl(chapterCards[0].chart.songId, "illustrationLowRes") : selectedArt} active={chapter === "all"} onSelect={() => setChapter("all")} />{chapterCards.map(({ name, chart }) => <ChapterCard key={name} label={name.replace(/^Chapter\s*/i, "")} art={assetUrl(chart.songId, "illustrationLowRes")} active={chapter === name} onSelect={() => setChapter(name)} />)}</div>
      <div className="game-content">
        <aside className="song-browser">
          <div className="sort-panel"><div><small>歌曲列表</small><strong>{chapterLabel}</strong></div><label><span>排序</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as keyof typeof sortNames)}>{Object.entries(sortNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <div className="browser-tools"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索曲名 / 曲师" /><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="all">全部</option>{difficultyOrder.map((item) => <option key={item} value={item}>{difficultyName[item]}</option>)}</select></div>
          <div className="range-row"><label>定数 <input type="number" min="0" max="18" step="0.1" value={minConstant} onChange={(event) => setMinConstant(Number(event.target.value))} /></label><label>至 <input type="number" min="0" max="18" step="0.1" value={maxConstant} onChange={(event) => setMaxConstant(Number(event.target.value))} /></label></div>
          <div className="song-list">{songRows.map((row) => <SongRow key={row[0].songId} charts={row} selectedId={selected?.chartId ?? ""} onSelect={(chart) => setSelectedId(chart.chartId)} />)}</div>
          {filtered.length > 96 && <p className="list-limit">显示前 96 首，继续缩小章节、搜索或定数范围。</p>}
        </aside>
        <section className="song-stage">
          {selected ? <><div className="song-heading"><div><small>{selected.composer || "Unknown composer"} ／ {selected.illustrator || "Illustrator unknown"}</small><h1>{selected.title}</h1></div><span className={`stage-difficulty difficulty-${selected.difficulty}`}>{difficultyName[selected.difficulty]}</span></div><div className="art-frame"><img src={selectedArt} alt={`${selected.title} 曲绘`} /></div><div className="difficulty-switch">{selectedSongCharts.map((chart) => <button key={chart.chartId} className={chart.chartId === selected.chartId ? `active difficulty-${chart.difficulty}` : ""} onClick={() => setSelectedId(chart.chartId)}><b>{chart.constant?.toFixed(1) ?? "—"}</b><small>{difficultyName[chart.difficulty]}</small></button>)}</div><div className="score-strip"><span className="target-score">{number.format(target)}<small>目标分数</small></span><span><b>{number.format(selected.noteCount ?? 0)}</b><small>NOTES</small></span><span><b>{selected.constant?.toFixed(1) ?? "—"}</b><small>定数</small></span><span className="rank-mark"><img src={rankAssets[rankForScore(target)]} alt={rankForScore(target) === "phi" ? "Phi" : rankForScore(target)} /></span></div></> : <p className="empty-state">没有匹配的歌曲。</p>}
        </section>
      </div>
    </section>
    <section className="calculator-panel"><div className="calculator-heading"><div><small>PHITARGET / SCORE ROUTE</small><h2>目标分数反推</h2></div><span>{number.format(filtered.length)} charts matched</span></div><div className="solver-controls"><label>计分约束<select value={scoreMode} onChange={(event) => setScoreMode(event.target.value as typeof scoreMode)}><option value="normal">普通模式 / 不限制 FC</option><option value="fc">FC / 无 Bad · Miss</option><option value="combo">指定 Max Combo / 合并 Bad + Miss</option></select></label><label>目标分数<input type="number" min="0" max="1000000" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label>{scoreMode === "combo" && <label>Max Combo<input type="number" min="0" max={notes} value={maxCombo} onChange={(event) => setMaxCombo(Number(event.target.value))} /></label>}<label>求解方式<select value={match} onChange={(event) => setMatch(event.target.value as typeof match)}><option value="nearest">最接近目标</option><option value="exact">精确命中</option><option value="atLeast">至少达到</option></select></label></div><p className="formula-line">N = {number.format(notes)} · {scoreMode === "normal" ? "普通模式 · 不限制 FC · Bad + Miss 合并显示，Max Combo 取理论样本" : scoreMode === "fc" ? "FC · Score = 1,000,000 − 315,000 × Good / N" : `C = ${number.format(effectiveCombo)} · Bad + Miss 作为同一误差组计算`}</p>{state.error ? <p className="error">{state.error}</p> : <div className="solutions">{state.solutions.map((solution) => <div className="solution" key={`${solution.good}-${solution.maxCombo}-${solution.result.display}-${"badMiss" in solution ? solution.badMiss : 0}`}><div><strong>{formatScore(solution.result.display)}</strong><small>P {solution.perfect} · G {solution.good} · {"badMiss" in solution ? `B + M ${solution.badMiss}` : "B 0 · M 0"} · C {solution.maxCombo}</small></div><b className={solution.delta === 0 ? "exact" : "delta"}>{solution.delta > 0 ? "+" : ""}{formatScore(solution.delta)}</b></div>)}</div>}</section>
    <footer className="footer"><span>PhiTarget / local-first / no account</span><span>source version {dataset.chartVersion.slice(0, 12)} · resource artwork via Phigros_Resource</span></footer>
  </main>;
}
