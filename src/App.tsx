import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { solveFcTarget, solveNormalTarget, solveNormalUnrestrictedTarget } from "./core/solver";
import { analyzeReachableScores, nearestReachableScores, type ReachabilityMode } from "./core/reachable";
import type { ChartDataset, ChartRecord } from "./data/types";
import { chapterArtworkFor } from "./data/chapterArtwork";

const number = new Intl.NumberFormat("en-US");
const difficultyOrder = ["ez", "hd", "in", "at"];
const difficultyName: Record<string, string> = { ez: "EZ", hd: "HD", in: "IN", at: "AT" };
const sortNames = { default: "默认", title: "曲名", constant: "定数" } as const;
type SortMode = keyof typeof sortNames;
type SortDirection = "asc" | "desc";
const sortModes: SortMode[] = ["default", "title", "constant"];
const resourceCdn = "https://cdn.jsdelivr.net/gh/7aGiven/Phigros_Resource";
const assetUrl = (songId: string, branch: "illustration" | "illustrationLowRes" | "illustrationBlur") => `${resourceCdn}@${branch}/${encodeURIComponent(songId)}.png`;
type ScoreRank = "F" | "C" | "B" | "A" | "S" | "V" | "blueV" | "phi";
const rankAssets: Record<ScoreRank, string> = { F: "/assets/ranks/F.png", C: "/assets/ranks/C.png", B: "/assets/ranks/B.png", A: "/assets/ranks/A.png", S: "/assets/ranks/S.png", V: "/assets/ranks/V.png", blueV: "/assets/ranks/V-blue.png", phi: "/assets/ranks/phi.png" };
const chapterOrder = [
  "单曲精选集", "Chapter Legacy 过去的章节", "Chapter 5 霓虹灯牌", "Chapter 6 方舟蜃景", "Chapter 7 时钟链接", "Chapter 8 凌日潮汐", "Chapter 9 穹顶孤舟",
  "Side Story 1 忘忧宫", "Side Story 2 弭刻日", "Side Story 3 盗乐行", "Side Story 4 无相乡",
  "Chapter Ex-CYTUS II 精选集", "Chapter Ex-Liminality 精选集", "Chapter Ex-maimai 精选集", "Chapter Ex-オンゲキ 精选集", "Chapter Ex-Immaculée Sekai 精选集", "Chapter Ex-EGTS 精选集", "Chapter Ex-节奏大师 精选集", "Chapter Ex-TAKUMI³ 精选集", "Chapter Ex-SHINOBI SLASH 精选集", "Chapter Ex-Paradigm: Reboot 精选集", "Chapter Ex-CHUNITHM 精选集", "Chapter Ex-Rotaeno 精选集", "极星卫", "Chapter Ex-OverRapid 精选集", "Chapter Ex-茶鸣拾贰律 精选集", "Chapter Ex-姜米條 精选集", "Chapter Ex-Lanota 精选集", "Chapter Ex-KALPA 精选集", "Chapter Ex-Muse Dash 精选集", "Chapter Ex-WAVEAT 精选集", "Chapter Ex-GOOD 精选集", "Chapter Ex-HyuN 精选集", "Chapter Ex-Rising Sun Traxx",
];

const normalizeSearch = (value: string) => value.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, "");
const formatScore = (value: bigint | number) => typeof value === "bigint" ? value.toString() : number.format(value);
const formatNote = (value: number | null) => value === null ? "—" : number.format(value);
const rankForScore = (score: number, fullCombo = false): ScoreRank => score >= 1_000_000 ? "phi" : fullCombo ? "blueV" : score >= 960_000 ? "V" : score >= 920_000 ? "S" : score >= 880_000 ? "A" : score >= 820_000 ? "B" : score >= 700_000 ? "C" : "F";
const rankLabel: Record<ScoreRank, string> = { F: "F", C: "C", B: "B", A: "A", S: "S", V: "V", blueV: "蓝V", phi: "Phi" };
const ChapterText = ({ value }: { value: string }) => <>{value.split("³").map((part, index, parts) => <Fragment key={`${part}-${index}`}>{part}{index < parts.length - 1 && <sup>3</sup>}</Fragment>)}</>;
const chapterOuterName = (chapter: string) => {
  if (chapter === "all") return "Phigros";
  if (chapter === "单曲精选集") return "Single";
  if (chapter === "Chapter Legacy 过去的章节") return "Legacy";
  if (chapter === "极星卫") return "かめりあ";
  const mainStory = chapter.match(/^Chapter (\d+) /);
  if (mainStory) return `Chapter ${mainStory[1]}`;
  const sideStory = chapter.match(/^(Side Story \d+) /);
  if (sideStory) return sideStory[1];
  if (chapter.startsWith("Chapter Ex-")) return chapter.replace(/^Chapter Ex-/, "").replace(/ 精选集$/, "");
  return chapter;
};

const chapterDetailName = (chapter: string) => {
  if (chapter === "all") return "全部";
  if (chapter === "单曲精选集") return "单曲精选集";
  if (chapter === "Chapter Legacy 过去的章节") return "过去的章节";
  if (chapter === "极星卫") return "极星卫";
  const mainStory = chapter.match(/^Chapter \d+ (.+)$/);
  if (mainStory) return mainStory[1];
  const sideStory = chapter.match(/^Side Story \d+ (.+)$/);
  if (sideStory) return sideStory[1];
  if (chapter.startsWith("Chapter Ex-")) {
    const name = chapter.replace(/^Chapter Ex-/, "");
    return name.endsWith("精选集") ? name : `${name} 精选集`;
  }
  return chapter;
};

function SongRow({ charts, selectedId, onSelect }: { charts: ChartRecord[]; selectedId: string; onSelect: (chart: ChartRecord) => void }) {
  const first = charts[0];
  const active = charts.some((chart) => chart.chartId === selectedId);
  const ordered = [...charts].sort((a, b) => difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty));
  return <button className={`song-row ${active ? "active" : ""}`} onClick={() => onSelect(charts.find((chart) => chart.chartId === selectedId) ?? first)}>
    <span className="song-row-art"><img src={assetUrl(first.songId, "illustrationLowRes")} alt="" loading="lazy" decoding="async" /></span>
    <span className="song-row-copy"><strong>{first.title}</strong><small>{first.composer || "Unknown composer"}</small></span>
    <span className="song-row-levels">{ordered.map((chart) => <span key={chart.chartId} style={{ gridColumn: difficultyOrder.indexOf(chart.difficulty) + 1 }} className={`song-level difficulty-${chart.difficulty} ${chart.chartId === selectedId ? "selected" : ""}`} onClick={(event) => { event.stopPropagation(); onSelect(chart); }}>{chart.constant?.toFixed(1) ?? "—"}</span>)}</span>
  </button>;
}

function ChapterCard({ label, art, active, onSelect }: { label: string; art: string; active: boolean; onSelect: () => void }) {
  return <button className={`chapter-card ${active ? "active" : ""}`} style={{ "--chapter-art": `url("${art}")` } as CSSProperties} aria-pressed={active} aria-label={`选择${label}`} onClick={onSelect}><span><i><ChapterText value={label} /></i></span></button>;
}

export default function App() {
  const [dataset, setDataset] = useState<ChartDataset | null>(null);
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedId, setSelectedId] = useState("");
  const [selectedDifficulty, setSelectedDifficulty] = useState("ez");
  const [target, setTarget] = useState(950000);
  const [match, setMatch] = useState<"exact" | "atLeast" | "nearest">("nearest");
  const [scoreMode, setScoreMode] = useState<"normal" | "fc" | "combo">("normal");
  const [maxCombo, setMaxCombo] = useState(1000);
  const [reachabilityMode, setReachabilityMode] = useState<ReachabilityMode>("normal");
  const [reachabilityCombo, setReachabilityCombo] = useState(1000);

  useEffect(() => { import("./data/dataset").then((module) => setDataset(module.dataset)); }, []);
  const charts = dataset?.charts ?? [];
  const songMeta = dataset?.songMeta ?? {};
  const deferredQuery = useDeferredValue(query.trim());
  const normalizedQuery = useMemo(() => normalizeSearch(deferredQuery), [deferredQuery]);
  const chapters = useMemo(() => {
    const known = new Set(charts.map((chart) => chart.chapter));
    return [...chapterOrder.filter((name) => known.has(name)), ...[...known].filter((name) => !chapterOrder.includes(name))];
  }, [charts]);
  const chapterCards = useMemo(() => chapters.map((name) => ({ name, chart: charts.find((chart) => chart.chapter === name) })).filter((item): item is { name: string; chart: ChartRecord } => Boolean(item.chart)), [chapters, charts]);
  const filtered = useMemo(() => charts.filter((chart) => {
    const searchable = normalizeSearch((songMeta[chart.songId]?.searchKeywords ?? [chart.title, chart.composer, chart.illustrator, chart.charter]).join(" "));
    return (!normalizedQuery || searchable.includes(normalizedQuery)) && (chapter === "all" || chart.chapter === chapter);
  }), [chapter, charts, normalizedQuery, songMeta]);
  const songRows = useMemo(() => {
    const groups = new Map<string, ChartRecord[]>();
    for (const chart of filtered) groups.set(chart.songId, [...(groups.get(chart.songId) ?? []), chart]);
    const rows = [...groups.values()];
    rows.sort((a, b) => {
      let result = 0;
      const aOrder = songMeta[a[0].songId]?.songOrder ?? Number.MAX_SAFE_INTEGER;
      const bOrder = songMeta[b[0].songId]?.songOrder ?? Number.MAX_SAFE_INTEGER;
      if (sortMode === "default") result = (aOrder - bOrder) || a[0].title.localeCompare(b[0].title);
      else if (sortMode === "title") result = a[0].title.localeCompare(b[0].title) || (aOrder - bOrder);
      else {
        const aConstant = a.find((chart) => chart.difficulty === selectedDifficulty)?.constant ?? 0;
        const bConstant = b.find((chart) => chart.difficulty === selectedDifficulty)?.constant ?? 0;
        result = (aConstant - bConstant) || a[0].title.localeCompare(b[0].title);
      }
      return sortDirection === "asc" ? result : -result;
    });
    return rows;
  }, [filtered, selectedDifficulty, songMeta, sortDirection, sortMode]);
  const selected = filtered.find((chart) => chart.chartId === selectedId) ?? songRows[0]?.[0] ?? charts[0];
  const selectedSongCharts = useMemo(() => selected ? charts.filter((chart) => chart.songId === selected.songId).sort((a, b) => difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty)) : [], [charts, selected]);
  const notes = selected?.noteCount ?? 1000;
  const goodCap = selected && selected.noteCounts.tap !== null && selected.noteCounts.hold !== null ? Math.min(notes, selected.noteCounts.tap + selected.noteCounts.hold) : notes;
  const goodCapKnown = Boolean(selected && selected.noteCounts.tap !== null && selected.noteCounts.hold !== null);
  const effectiveCombo = scoreMode === "fc" ? notes : Math.min(maxCombo, notes);
  const state = useMemo(() => {
    try {
      const solutions = scoreMode === "normal" ? solveNormalUnrestrictedTarget(notes, target, match, "nearest", goodCap) : scoreMode === "fc" ? solveFcTarget(notes, target, match, "nearest", goodCap) : solveNormalTarget(notes, effectiveCombo, target, match, "nearest", goodCap);
      return { solutions, error: "" };
    } catch (error) { return { solutions: [], error: error instanceof Error ? error.message : "Invalid input" }; }
  }, [effectiveCombo, goodCap, match, notes, scoreMode, target]);
  const solutionRank = (solution: (typeof state.solutions)[number]) => rankForScore(Number(solution.result.display), "badMiss" in solution ? solution.badMiss === 0 && solution.maxCombo === notes : solution.maxCombo === notes);
  const reachableState = useMemo(() => {
    if (!dataset || !selected) return { analysis: null, error: "" };
    try {
      return { analysis: analyzeReachableScores(notes, reachabilityMode, reachabilityMode === "fixedCombo" ? reachabilityCombo : null, goodCap), error: "" };
    } catch (error) {
      return { analysis: null, error: error instanceof Error ? error.message : "无法计算可达分数" };
    }
  }, [dataset, goodCap, notes, reachabilityCombo, reachabilityMode, selected]);
  const reachableNearby = useMemo(() => reachableState.analysis ? nearestReachableScores(reachableState.analysis.scores, target) : [], [reachableState.analysis, target]);
  const selectedArt = selected ? assetUrl(selected.songId, "illustration") : "";
  const selectedBlur = selected ? assetUrl(selected.songId, "illustrationBlur") : "";
  const chapterArt = chapterArtworkFor(chapter, selectedBlur);
  const chapterOuterLabel = chapterOuterName(chapter);
  const chapterLabel = chapterDetailName(chapter);
  const selectedChapterLabel = selected ? chapterDetailName(selected.chapter) : chapterLabel;
  const cycleSort = () => setSortMode((current) => sortModes[(sortModes.indexOf(current) + 1) % sortModes.length]);
  const toggleDirection = () => setSortDirection((current) => current === "asc" ? "desc" : "asc");

  if (!dataset) return <main className="loading-screen"><span className="loading-mark">Φ</span><p>正在读取曲库索引…</p></main>;

  return <main className="app-shell">
    <section className="game-screen" style={chapterArt ? { "--selected-art": `url(${chapterArt})` } as CSSProperties : undefined}>
      <div className="network-lines" />
      <header className="game-header"><div className="game-header-title"><small><ChapterText value={chapterOuterLabel} /></small><strong><ChapterText value={chapterLabel} /></strong></div><div className="player-chip"><span className="player-level">40</span></div></header>
      <div className="chapter-strip"><ChapterCard label="Phigros" art={chapterArtworkFor("all", chapterCards[0]?.chart ? assetUrl(chapterCards[0].chart.songId, "illustrationBlur") : selectedBlur)} active={chapter === "all"} onSelect={() => setChapter("all")} />{chapterCards.map(({ name, chart }) => <ChapterCard key={name} label={chapterOuterName(name)} art={chapterArtworkFor(name, assetUrl(chart.songId, "illustrationBlur"))} active={chapter === name} onSelect={() => setChapter(name)} />)}</div>
      <div className="game-content">
        <aside className="song-browser">
          <div className="sort-panel"><div><small>歌曲列表</small><strong><ChapterText value={chapterLabel} /></strong></div><div className="sort-control"><button className="sort-cycle" type="button" onClick={cycleSort}><span>排序</span><strong>{sortNames[sortMode]}</strong></button><button className="sort-direction" type="button" onClick={toggleDirection} aria-label={sortDirection === "asc" ? "升序" : "降序"}>{sortDirection === "asc" ? "↑" : "↓"}</button></div></div>
          <div className="browser-tools"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索曲名 / 定数 / 别名" /></div>
          <div className="song-list">{songRows.map((row) => <SongRow key={row[0].songId} charts={row} selectedId={selected?.chartId ?? ""} onSelect={(chart) => { setSelectedId(chart.chartId); setSelectedDifficulty(chart.difficulty); }} />)}</div>
        </aside>
        <section className="song-stage">
          {selected ? <>
            <div className="song-heading"><div><small>{selected.composer || "Unknown composer"} ／ {selected.illustrator || "Illustrator unknown"}</small><h1>{selected.title}</h1></div><span className={`stage-difficulty difficulty-${selected.difficulty}`}>{difficultyName[selected.difficulty]}</span></div>
            <div className="song-detail-layout">
              <div className="song-info-panel">
                <div className="song-info-title"><strong>{selected.title}</strong><span>SONG'S_INFO</span></div>
                <div className="chart-table">
                  <div className="chart-table-head"><span>Dif</span><span>Charter</span><span>Tap</span><span>Drag</span><span>Hold</span><span>Flick</span><span>Total</span></div>
                  {selectedSongCharts.map((chart) => <button type="button" key={chart.chartId} className={`chart-table-row chart-row-${chart.difficulty}`} onClick={() => { setSelectedId(chart.chartId); setSelectedDifficulty(chart.difficulty); }}><span className={`chart-difficulty-cell difficulty-${chart.difficulty}`}><b>{difficultyName[chart.difficulty]}</b><small>{chart.constant?.toFixed(1) ?? "—"}</small></span><span className="chart-charter">{chart.charter || "—"}</span><span>{formatNote(chart.noteCounts.tap)}</span><span>{formatNote(chart.noteCounts.drag)}</span><span>{formatNote(chart.noteCounts.hold)}</span><span>{formatNote(chart.noteCounts.flick)}</span><strong>{formatNote(chart.noteCount)}</strong></button>)}
                </div>
                <div className="song-meta-grid"><div><b>BPM</b><span>{selected.bpm || "—"}</span></div><div><b>Length</b><span>{selected.duration || "—"}</span></div><div><b>Composer</b><span>{selected.composer || "—"}</span></div><div><b>Illustrator</b><span>{selected.illustrator || "—"}</span></div><div><b>Chapter</b><span><ChapterText value={selectedChapterLabel} /></span></div></div>
              </div>
              <div className="art-frame"><img src={selectedArt} alt={`${selected.title} 曲绘`} loading="eager" decoding="async" fetchPriority="high" /></div>
            </div>
            <div className="difficulty-switch">{selectedSongCharts.map((chart) => <button key={chart.chartId} className={chart.chartId === selected.chartId ? `active difficulty-${chart.difficulty}` : ""} onClick={() => { setSelectedId(chart.chartId); setSelectedDifficulty(chart.difficulty); }}><b>{chart.constant?.toFixed(1) ?? "—"}</b><small>{difficultyName[chart.difficulty]}</small></button>)}</div>
            <div className="score-strip"><span className="target-score">{number.format(target)}<small>目标分数</small></span><span><b>{number.format(selected.noteCount ?? 0)}</b><small>NOTES</small></span><span><b>{selected.constant?.toFixed(1) ?? "—"}</b><small>定数</small></span><span className="rank-mark"><img src={rankAssets[rankForScore(target)]} alt={rankForScore(target) === "phi" ? "Phi" : rankForScore(target)} /></span></div>
          </> : <p className="empty-state">没有匹配的歌曲。</p>}
        </section>
      </div>
    </section>
    <section className="calculator-panel"><div className="calculator-heading"><h2>目标分数反推</h2><span>{number.format(songRows.length)} 首歌曲</span></div><div className="solver-controls"><label>计分约束<select value={scoreMode} onChange={(event) => setScoreMode(event.target.value as typeof scoreMode)}><option value="normal">普通模式 / 不限制 FC</option><option value="fc">FC / 无 Bad · Miss</option><option value="combo">指定 Max Combo / 合并 Bad + Miss</option></select></label><label>目标分数<input type="number" min="0" max="1000000" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label>{scoreMode === "combo" && <label>Max Combo<input type="number" min="0" max={notes} value={maxCombo} onChange={(event) => setMaxCombo(Number(event.target.value))} /></label>}<label>求解方式<select value={match} onChange={(event) => setMatch(event.target.value as typeof match)}><option value="nearest">最接近目标</option><option value="exact">精确命中</option><option value="atLeast">至少达到</option></select></label></div><p className="formula-line">N = {number.format(notes)} · {scoreMode === "normal" ? "普通模式 · 不限制 FC" : scoreMode === "fc" ? "FC 模式" : `固定 Max Combo = ${number.format(effectiveCombo)}`} · Bad + Miss 按同一分值误差组计算</p>{state.error ? <p className="error">{state.error}</p> : <div className="solutions">{state.solutions.map((solution) => { const rank = solutionRank(solution); return <div className="solution" key={`${solution.good}-${solution.maxCombo}-${solution.result.display}-${"badMiss" in solution ? solution.badMiss : 0}`}><div><strong>{formatScore(solution.result.display)}</strong><small>P {solution.perfect} · G {solution.good} · {"badMiss" in solution ? `B + M ${solution.badMiss}` : "B 0 · M 0"} · C {solution.maxCombo}</small></div><span className="solution-rank"><img src={rankAssets[rank]} alt={rankLabel[rank]} /><small>{rankLabel[rank]} · {"badMiss" in solution ? (solution.badMiss === 0 && solution.maxCombo === notes ? "FC" : "普通") : "FC"}</small></span><b className={solution.delta === 0 ? "exact" : "delta"}>{solution.delta > 0 ? "+" : ""}{formatScore(solution.delta)}</b></div>; })}</div>}</section>
    <section className="calculator-panel reachable-panel"><div className="calculator-heading"><h2>可达分数</h2><span>公式可达</span></div><div className="solver-controls reachable-controls"><label>计算模型<select value={reachabilityMode} onChange={(event) => setReachabilityMode(event.target.value as ReachabilityMode)}><option value="normal">普通模式 / 不限制 FC</option><option value="fc">FC</option><option value="fixedCombo">固定 Max Combo</option></select></label>{reachabilityMode === "fixedCombo" && <label>Max Combo<input type="number" min="0" max={notes} value={Math.min(reachabilityCombo, notes)} onChange={(event) => setReachabilityCombo(Number(event.target.value))} /></label>}<label>目标附近分数<input type="number" min="0" max="1000000" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label></div>{reachableState.error ? <p className="error">{reachableState.error}</p> : reachableState.analysis && <><div className="reachable-summary"><div><strong>{number.format(reachableState.analysis.total)}</strong><small>不同可达分数</small></div><div><strong>{number.format(reachableState.analysis.min)}</strong><small>最低</small></div><div><strong>{number.format(reachableState.analysis.max)}</strong><small>最高</small></div></div><div className="reachable-nearby"><small>目标 {number.format(target)} 附近</small><div>{reachableNearby.map((scoreValue) => <span key={scoreValue} className={scoreValue === target ? "exact" : ""}>{number.format(scoreValue)}</span>)}</div></div><div className="reachable-buckets"><small>分数分布（每 5,000 分）</small><div>{reachableState.analysis.buckets.map((bucket) => <span key={bucket.start}>{number.format(bucket.start)}–{number.format(bucket.end)} <b>{number.format(bucket.count)}</b></span>)}</div></div><p className="reachable-note">Good 上限为 {number.format(reachableState.analysis.goodCap)}（Tap + Hold）；Flick/Drag 没有 Good。结果还未验证错误位置、音符类型的其他判定限制或真实 Max Combo，不代表每个分数都能在该谱面实际打出。</p></>}</section>
  </main>;
}
