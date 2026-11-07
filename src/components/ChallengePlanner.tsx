import { useMemo, useState } from "react";
import { findChallengeCombinations, type ChallengeCombinationMatch, type ChallengeCombinationPlan } from "../core/challenge";
import type { PhigrosCloudRecord } from "../core/phigrosCloud";
import type { ChartRecord } from "../data/types";

const number = new Intl.NumberFormat("en-US");
const difficultyOrder = ["ez", "hd", "in", "at"];
const difficultyName: Record<string, string> = { ez: "EZ", hd: "HD", in: "IN", at: "AT" };
const resourceCdn = "https://cdn.jsdelivr.net/gh/7aGiven/Phigros_Resource";

type Props = { charts: ChartRecord[]; playerRecords: PhigrosCloudRecord[]; playerRks: number | null };

const artUrl = (songId: string) => `${resourceCdn}@illustrationLowRes/${encodeURIComponent(songId)}.png`;

function PlanCard({ plan, target }: { plan: ChallengeCombinationPlan; target: number }) {
  const margin = plan.totalScore - target;
  return <article className="challenge-plan-card">
    <header><div><small>{plan.personal ? "TapTap 当前合计" : "模型合计"}</small><strong>{number.format(plan.totalScore)}</strong></div><div><small>目标课题分</small><strong>{number.format(target)}</strong></div><span className={`plan-margin ${margin < 0 ? "under" : ""}`}>{margin >= 0 ? "+" : ""}{number.format(margin)}</span></header>
    <p className="challenge-personal-summary">{plan.personal ? "使用已连接云档中的三张已游玩谱面" : "每曲按接近总分三等分的数量模型估算"} · 定数和 {plan.levelTotal} · 定数跨度 {plan.constantSpread.toFixed(1)}</p>
    <div className="challenge-plan-songs">{plan.charts.map((chart, index) => <div className="challenge-plan-song" key={chart.chartId}>
      <img src={artUrl(chart.songId)} alt="" loading="lazy" decoding="async" />
      <div><strong>{chart.title}</strong><small>{difficultyName[chart.difficulty] ?? chart.difficulty.toUpperCase()} {chart.constant?.toFixed(1) ?? "—"} · {chart.composer || "—"}</small><span>目标 {number.format(plan.targetScores[index])}　贡献 {number.format(plan.actualScores[index])}</span><em>{chart.chapter}</em></div>
    </div>)}</div>
  </article>;
}

export default function ChallengePlanner({ charts, playerRecords, playerRks }: Props) {
  const [target, setTarget] = useState(2_940_000);
  const [match, setMatch] = useState<ChallengeCombinationMatch>("atLeast");
  const [chapter, setChapter] = useState("all");
  const [difficulties, setDifficulties] = useState(["in", "at"]);
  const [minConstant, setMinConstant] = useState("");
  const [maxConstant, setMaxConstant] = useState("");
  const [usePersonal, setUsePersonal] = useState(true);
  const personalBest = useMemo(() => {
    const best = new Map<string, number>();
    for (const record of playerRecords) best.set(record.chartId, Math.max(best.get(record.chartId) ?? 0, record.score));
    return best;
  }, [playerRecords]);
  const chapters = useMemo(() => [...new Set(charts.map((chart) => chart.chapter))], [charts]);
  const plansState = useMemo(() => {
    try {
      const plans = findChallengeCombinations(charts, target, match, {
        difficulties,
        chapter,
        minConstant: minConstant === "" ? null : Number(minConstant),
        maxConstant: maxConstant === "" ? null : Number(maxConstant),
        personalBest,
        usePersonal,
        maxPlans: 12,
      });
      return { plans, error: "" };
    } catch (error) {
      return { plans: [], error: error instanceof Error ? error.message : "课题组合参数无效" };
    }
  }, [chapter, charts, difficulties, match, maxConstant, minConstant, personalBest, target, usePersonal]);
  const cloudConnected = playerRks !== null || playerRecords.length > 0;
  const personalMode = usePersonal && personalBest.size > 0;
  const toggleDifficulty = (difficulty: string) => setDifficulties((current) => current.includes(difficulty) ? current.filter((item) => item !== difficulty) : [...current, difficulty]);

  return <main className="feature-page challenge-page">
    <header className="feature-heading"><div><small>CHALLENGE SCORE COMBINATIONS</small><h1>课题三曲组合</h1><p>给定三曲课题总分，搜索三首不同歌曲的组合，并按目标差值排序。</p></div><span className="feature-mark">3</span></header>
    <section className="challenge-control-panel">
      <div className="challenge-control-grid challenge-combination-controls"><label>目标课题总分<input type="number" min="0" max="3000000" step="1" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label><label>匹配方式<select value={match} onChange={(event) => setMatch(event.target.value as ChallengeCombinationMatch)}><option value="atLeast">至少达到</option><option value="nearest">最接近</option><option value="exact">精确命中</option></select></label><label>章节/曲包<select value={chapter} onChange={(event) => setChapter(event.target.value)}><option value="all">全部</option>{chapters.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>最低定数<input type="number" min="0" max="18" step="0.1" value={minConstant} placeholder="不限" onChange={(event) => setMinConstant(event.target.value)} /></label><label>最高定数<input type="number" min="0" max="18" step="0.1" value={maxConstant} placeholder="不限" onChange={(event) => setMaxConstant(event.target.value)} /></label></div>
      <div className="challenge-difficulty-filter"><span>难度</span>{difficultyOrder.map((difficulty) => <button type="button" key={difficulty} className={`difficulty-pill difficulty-${difficulty} ${difficulties.includes(difficulty) ? "selected" : ""}`} onClick={() => toggleDifficulty(difficulty)}>{difficultyName[difficulty]}</button>)}</div>
      <label className="challenge-personal-toggle"><input type="checkbox" checked={usePersonal} onChange={(event) => setUsePersonal(event.target.checked)} /><span>优先使用我的 TapTap 成绩</span><small>{personalBest.size ? `已匹配 ${personalBest.size} 张谱面 · RKS ${playerRks === null ? "—" : playerRks.toFixed(2)}` : cloudConnected ? "已连接，但当前曲库没有匹配成绩" : "未连接时使用公式组合"}</small></label>
      <p className="challenge-rule-note">组合保证三首歌曲不同；个人模式只使用云档中已有成绩的谱面，公式模式把总分近似均分到三首歌。结果用于组合筛选与分数分配参考，不代表真实谱面一定能打出。</p>
    </section>
    <section className="challenge-result-heading"><div><strong>{plansState.plans.length}</strong><span>组候选</span></div><div><strong>{number.format(target)}</strong><span>目标课题分</span></div><div><strong>{personalMode ? "个人成绩" : "公式估算"}</strong><span>组合依据</span></div></section>
    {plansState.error ? <p className="challenge-empty">{plansState.error}</p> : plansState.plans.length ? <div className="challenge-plan-grid">{plansState.plans.map((plan, index) => <PlanCard key={`${index}-${plan.charts.map((chart) => chart.chartId).sort().join("|")}`} plan={plan} target={target} />)}</div> : <p className="challenge-empty">{personalMode ? "当前筛选下没有三首已游玩且能达到目标的组合；请取消个人成绩限制或放宽难度、定数和章节筛选。" : "当前筛选下没有满足目标的三曲组合；请调整目标分数、难度或定数范围。"}</p>}
    <p className="challenge-model-note">课题总分使用单曲课题分相加；Good 上限按 Tap + Hold 统计，Flick/Drag 不计 Good。公式模式只检查数量模型，个人模式只把 TapTap 成绩作为已有成绩参考。</p>
  </main>;
}
