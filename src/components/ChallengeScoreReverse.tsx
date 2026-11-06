import { useMemo, useState } from "react";
import { solveChallengeTarget, type ChallengeMatch } from "../core/challenge";
import type { ChartRecord } from "../data/types";

const number = new Intl.NumberFormat("en-US");
const difficultyName: Record<string, string> = { ez: "EZ", hd: "HD", in: "IN", at: "AT" };
const chartGoodCap = (chart: ChartRecord) => chart.noteCounts.tap !== null && chart.noteCounts.hold !== null ? chart.noteCounts.tap + chart.noteCounts.hold : chart.noteCount ?? 0;

export default function ChallengeScoreReverse({ charts }: { charts: ChartRecord[] }) {
  const eligibleCharts = useMemo(() => charts.filter((chart) => chart.noteCount !== null && chart.constant !== null), [charts]);
  const [chartId, setChartId] = useState(eligibleCharts[0]?.chartId ?? "");
  const [target, setTarget] = useState(900000);
  const [match, setMatch] = useState<ChallengeMatch>("nearest");
  const chart = eligibleCharts.find((item) => item.chartId === chartId) ?? eligibleCharts[0];
  const state = useMemo(() => {
    if (!chart) return { solutions: [], error: "曲库中没有可计算的课题谱面。" };
    try {
      return {
        solutions: solveChallengeTarget(chart.noteCount ?? 1, target, match, "nearest", Math.min(chart.noteCount ?? 1, chartGoodCap(chart))).slice(0, 5),
        error: "",
      };
    } catch (error) {
      return { solutions: [], error: error instanceof Error ? error.message : "目标课题分无效" };
    }
  }, [chart, match, target]);

  return <main className="feature-page challenge-score-page">
    <header className="feature-heading"><div><small>SINGLE CHALLENGE SCORE</small><h1>课题分反推</h1><p>单独计算一张谱面达到目标课题分所需的 Perfect、Good 与 Bad + Miss 数量。</p></div><span className="feature-mark">Σ</span></header>
    <section className="challenge-single challenge-score-card"><header><div><small>ACCURACY-ONLY MODEL</small><h2>单曲目标分</h2></div><span>不计连击分</span></header><div className="challenge-single-controls"><label>谱面<select value={chart?.chartId ?? ""} onChange={(event) => setChartId(event.target.value)}>{eligibleCharts.map((item) => <option key={item.chartId} value={item.chartId}>{item.title} · {difficultyName[item.difficulty] ?? item.difficulty.toUpperCase()} {item.constant?.toFixed(1)}</option>)}</select></label><label>目标课题分<input type="number" min="0" max="1000000" step="1" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label><label>匹配方式<select value={match} onChange={(event) => setMatch(event.target.value as ChallengeMatch)}><option value="nearest">最接近目标</option><option value="exact">精确命中</option><option value="atLeast">至少达到</option></select></label></div><p className="challenge-score-note">Good 上限为 {chart ? number.format(chartGoodCap(chart)) : "—"}（Tap + Hold）；Flick/Drag 没有 Good。Bad 与 Miss 在数量模型中合并。</p>{state.error ? <p className="error">{state.error}</p> : state.solutions.length ? <div className="challenge-single-solutions">{state.solutions.map((solution) => <div key={`${solution.score}-${solution.good}-${solution.badMiss}`}><strong>{number.format(solution.score)}</strong><span>P {solution.perfect} · G {solution.good} · B + M {solution.badMiss}</span><b>{solution.delta === 0 ? "精确" : `${solution.delta > 0 ? "+" : ""}${number.format(solution.delta)}`}</b></div>)}</div> : <p className="challenge-empty challenge-single-empty">当前匹配方式没有可用的判定组合。</p>}</section>
    <p className="challenge-model-note">本计算不保证每个分数在真实谱面中都能打出；它只提供课题数量模型下的判定组合参考。</p>
  </main>;
}
