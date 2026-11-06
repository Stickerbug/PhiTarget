import { useEffect, useMemo, useState } from "react";
import { challengeAverageRequired, challengeBadgeRules, solveChallengeTarget, type ChallengeBadgeId, type ChallengeMatch } from "../core/challenge";
import type { ChartRecord } from "../data/types";
import { listPlayerScores } from "../storage/playerStore";

const number = new Intl.NumberFormat("en-US");
const difficultyOrder = ["ez", "hd", "in", "at"];
const difficultyName: Record<string, string> = { ez: "EZ", hd: "HD", in: "IN", at: "AT" };
const normalize = (value: string) => value.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "");

type Strategy = "balanced" | "high" | "low" | "personal";
type Props = { charts: ChartRecord[] };
type Plan = {
  charts: ChartRecord[];
  levelTotal: number;
  targetScores: number[];
  actualScores: number[];
  scoreSpread: number;
  personalScores: Array<number | null>;
};

const floorConstant = (chart: ChartRecord) => chart.constant === null ? null : Math.floor(chart.constant);
const chartGoodCap = (chart: ChartRecord) => chart.noteCounts.tap !== null && chart.noteCounts.hold !== null ? chart.noteCounts.tap + chart.noteCounts.hold : chart.noteCount ?? 0;

function buildPlans(charts: ChartRecord[], minLevel: number, maxLevel: number, threshold: number, strategy: Strategy, chapter: string, difficulties: string[], personalBest: Map<string, number>): Plan[] {
  const eligible = charts.filter((chart) => {
    const floor = floorConstant(chart);
    return floor !== null && floor >= 0 && (chapter === "all" || chart.chapter === chapter) && difficulties.includes(chart.difficulty) && !chart.chapter.includes("Legacy");
  });
  const buckets = new Map<number, ChartRecord[]>();
  for (const chart of eligible) {
    const floor = floorConstant(chart)!;
    buckets.set(floor, [...(buckets.get(floor) ?? []), chart]);
  }
  const floors = [...buckets.keys()].sort((a, b) => a - b);
  const plans: Plan[] = [];
  const maxPerFloor = 7;
  const targetScores = strategy === "low" ? [Math.max(0, threshold - 2_000_000), 1_000_000, 1_000_000] : [Math.ceil(threshold / 3), Math.ceil(threshold / 3), Math.max(0, threshold - Math.ceil(threshold / 3) * 2)];
  for (let i = 0; i < floors.length; i += 1) {
    for (let j = i; j < floors.length; j += 1) {
      for (let k = j; k < floors.length; k += 1) {
        const levelTotal = floors[i] + floors[j] + floors[k];
        if (levelTotal < minLevel || levelTotal > maxLevel) continue;
        const lists = [buckets.get(floors[i]) ?? [], buckets.get(floors[j]) ?? [], buckets.get(floors[k]) ?? []].map((list) => list.slice(0, maxPerFloor));
        for (const first of lists[0]) {
          for (const second of lists[1]) {
            if (second.songId === first.songId) continue;
            for (const third of lists[2]) {
              if (third.songId === first.songId || third.songId === second.songId) continue;
              const selected = [first, second, third];
              const ordered = strategy === "low" ? [...selected].sort((a, b) => (floorConstant(a)! - floorConstant(b)!)) : selected;
              const scores = ordered.map((chart, index) => solveChallengeTarget(chart.noteCount ?? 1, targetScores[index], "atLeast", "nearest", Math.min(chart.noteCount ?? 1, chartGoodCap(chart)))[0]?.score ?? 0);
              const spread = Math.max(...ordered.map((chart) => floorConstant(chart)!)) - Math.min(...ordered.map((chart) => floorConstant(chart)!));
              plans.push({ charts: ordered, levelTotal, targetScores: [...targetScores], actualScores: scores, scoreSpread: spread, personalScores: ordered.map((chart) => personalBest.get(chart.chartId) ?? null) });
              if (plans.length >= 320) break;
            }
            if (plans.length >= 320) break;
          }
          if (plans.length >= 320) break;
        }
        if (plans.length >= 320) break;
      }
      if (plans.length >= 320) break;
    }
    if (plans.length >= 320) break;
  }
  const seen = new Set<string>();
  return plans.filter((plan) => {
    const key = plan.charts.map((chart) => chart.chartId).sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => {
    if (strategy === "high") return b.levelTotal - a.levelTotal || a.scoreSpread - b.scoreSpread;
    if (strategy === "low") return a.targetScores[0] - b.targetScores[0] || b.levelTotal - a.levelTotal;
    if (strategy === "personal") {
      const gap = (plan: Plan) => plan.targetScores.reduce((sum, target, index) => sum + Math.max(0, target - (plan.personalScores[index] ?? 0)), 0);
      return gap(a) - gap(b) || a.scoreSpread - b.scoreSpread || b.levelTotal - a.levelTotal;
    }
    return a.scoreSpread - b.scoreSpread || Math.abs(a.levelTotal - (minLevel + maxLevel) / 2) - Math.abs(b.levelTotal - (minLevel + maxLevel) / 2);
  }).slice(0, 12);
}

function PlanCard({ plan, threshold }: { plan: Plan; threshold: number }) {
  const margin = plan.actualScores.reduce((sum, score) => sum + score, 0) - threshold;
  return <article className="challenge-plan-card">
    <header><div><small>课题总值</small><strong>{plan.levelTotal}</strong></div><div><small>目标合计</small><strong>{number.format(threshold)}</strong></div><span className="plan-margin">{margin >= 0 ? "+" : ""}{number.format(margin)}</span></header>
    <div className="challenge-plan-songs">{plan.charts.map((chart, index) => <div className="challenge-plan-song" key={chart.chartId}><img src={`https://cdn.jsdelivr.net/gh/7aGiven/Phigros_Resource@illustrationLowRes/${encodeURIComponent(chart.songId)}.png`} alt="" loading="lazy" decoding="async" /><div><strong>{chart.title}</strong><small>{difficultyName[chart.difficulty]} {chart.constant?.toFixed(1)} · {chart.composer || "—"}</small><span>建议 {number.format(plan.targetScores[index])}　实算 {number.format(plan.actualScores[index])}</span><em>{plan.personalScores[index] === null ? "暂无本地成绩" : `本地最佳 ${number.format(plan.personalScores[index]!)}`}</em></div></div>)}</div>
  </article>;
}

export default function ChallengePlanner({ charts }: Props) {
  const [minLevel, setMinLevel] = useState(45);
  const [maxLevel, setMaxLevel] = useState(45);
  const [badge, setBadge] = useState<ChallengeBadgeId>("blue");
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [chapter, setChapter] = useState("all");
  const [difficulties, setDifficulties] = useState(["in", "at"]);
  const [rescueScores, setRescueScores] = useState(["", "", ""]);
  const [singleChartId, setSingleChartId] = useState(charts[0]?.chartId ?? "");
  const [singleTarget, setSingleTarget] = useState(900000);
  const [singleMatch, setSingleMatch] = useState<ChallengeMatch>("nearest");
  const [personalBest, setPersonalBest] = useState<Map<string, number>>(new Map());
  const [personalCount, setPersonalCount] = useState(0);
  const selectedBadge = challengeBadgeRules.find((rule) => rule.id === badge) ?? challengeBadgeRules[1];
  const chapters = useMemo(() => [...new Set(charts.map((chart) => chart.chapter))].filter((value) => !value.includes("Legacy")).sort((a, b) => a.localeCompare(b)), [charts]);
  useEffect(() => {
    listPlayerScores().then((records) => {
      const best = new Map<string, number>();
      for (const record of records) best.set(record.chartId, Math.max(best.get(record.chartId) ?? 0, record.score));
      setPersonalBest(best);
      setPersonalCount(records.length);
    }).catch(() => { setPersonalBest(new Map()); setPersonalCount(0); });
  }, []);
  const plans = useMemo(() => buildPlans(charts, Math.min(minLevel, maxLevel), Math.max(minLevel, maxLevel), selectedBadge.threshold, strategy, chapter, difficulties, personalBest), [chapter, charts, difficulties, maxLevel, minLevel, personalBest, selectedBadge.threshold, strategy]);
  const singleChart = charts.find((chart) => chart.chartId === singleChartId) ?? charts[0];
  const singleState = useMemo(() => {
    if (!singleChart) return { solutions: [], error: "" };
    try {
      return {
        solutions: solveChallengeTarget(singleChart.noteCount ?? 1, singleTarget, singleMatch, "nearest", Math.min(singleChart.noteCount ?? 1, chartGoodCap(singleChart))).slice(0, 3),
        error: "",
      };
    } catch (error) {
      return { solutions: [], error: error instanceof Error ? error.message : "目标课题分无效" };
    }
  }, [singleChart, singleMatch, singleTarget]);
  const rescue = useMemo(() => challengeAverageRequired(selectedBadge.threshold, rescueScores.filter((value) => value.trim() !== "").map(Number).filter((score) => Number.isFinite(score))), [rescueScores, selectedBadge.threshold]);
  const toggleDifficulty = (difficulty: string) => setDifficulties((current) => current.includes(difficulty) ? current.filter((item) => item !== difficulty) : [...current, difficulty]);

  return <main className="feature-page challenge-page">
    <header className="feature-heading"><div><small>CHALLENGE MODE PLANNER</small><h1>课题模式</h1><p>先确定课题总值，再按曲包、难度和策略挑选三张来自不同歌曲的谱面。</p></div><span className="feature-mark">3</span></header>
    <section className="challenge-control-panel">
      <div className="challenge-control-grid"><label>目标课题总值<input type="number" min="0" max="54" value={minLevel} onChange={(event) => setMinLevel(Number(event.target.value))} /></label><label>至<input type="number" min="0" max="54" value={maxLevel} onChange={(event) => setMaxLevel(Number(event.target.value))} /></label><label>铭牌<select value={badge} onChange={(event) => setBadge(event.target.value as ChallengeBadgeId)}>{challengeBadgeRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.label} · {number.format(rule.threshold)}</option>)}</select></label><label>排序策略<select value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)}><option value="balanced">最均衡</option><option value="high">课题总值最高</option><option value="low">允许一首低分</option><option value="personal">个人成绩匹配</option></select></label><label>曲包/章节<select value={chapter} onChange={(event) => setChapter(event.target.value)}><option value="all">全部</option>{chapters.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
      <div className="challenge-difficulty-filter"><span>难度</span>{difficultyOrder.map((difficulty) => <button type="button" key={difficulty} className={`difficulty-pill difficulty-${difficulty} ${difficulties.includes(difficulty) ? "selected" : ""}`} onClick={() => toggleDifficulty(difficulty)}>{difficultyName[difficulty]}</button>)}</div>
      <p className="challenge-rule-note">当前使用课题模式数量模型：三首不同歌曲，课题总值按谱面定数向下取整相加；铭牌门槛为社区常用候选值，发布前仍应使用目标版本截图校准。{strategy === "personal" ? personalCount ? ` 已读取 ${personalCount} 条本地成绩，方案按目标分数缺口排序。` : " 尚未发现本地成绩，当前按均衡方案排序。" : ""}</p>
    </section>
    <section className="challenge-single"><header><div><small>SINGLE CHALLENGE SCORE</small><h2>单曲课题分反推</h2></div><span>不计连击分</span></header><div className="challenge-single-controls"><label>谱面<select value={singleChart?.chartId ?? ""} onChange={(event) => setSingleChartId(event.target.value)}>{charts.filter((chart) => chart.noteCount !== null && chart.constant !== null).map((chart) => <option key={chart.chartId} value={chart.chartId}>{chart.title} · {chart.difficulty.toUpperCase()} {chart.constant?.toFixed(1)}</option>)}</select></label><label>目标课题分<input type="number" min="0" max="1000000" step="1" value={singleTarget} onChange={(event) => setSingleTarget(Number(event.target.value))} /></label><label>匹配方式<select value={singleMatch} onChange={(event) => setSingleMatch(event.target.value as ChallengeMatch)}><option value="nearest">最接近目标</option><option value="exact">精确命中</option><option value="atLeast">至少达到</option></select></label></div>{singleState.error ? <p className="error">{singleState.error}</p> : singleState.solutions.length ? <div className="challenge-single-solutions">{singleState.solutions.map((solution) => <div key={`${solution.score}-${solution.good}-${solution.badMiss}`}><strong>{number.format(solution.score)}</strong><span>P {solution.perfect} · G {solution.good} · B + M {solution.badMiss}</span><b>{solution.delta === 0 ? "精确" : `${solution.delta > 0 ? "+" : ""}${number.format(solution.delta)}`}</b></div>)}</div> : <p className="challenge-empty challenge-single-empty">当前匹配方式没有可用的判定组合。</p>}</section>
    <section className="challenge-result-heading"><div><strong>{plans.length}</strong><span>组候选</span></div><div><strong style={{ color: selectedBadge.color }}>{selectedBadge.label}</strong><span>目标 {number.format(selectedBadge.threshold)}</span></div><div><strong>{minLevel === maxLevel ? minLevel : `${Math.min(minLevel, maxLevel)}–${Math.max(minLevel, maxLevel)}`}</strong><span>课题总值</span></div></section>
    {plans.length ? <div className="challenge-plan-grid">{plans.map((plan, index) => <PlanCard key={`${index}-${plan.charts.map((chart) => chart.chartId).join("|")}`} plan={plan} threshold={selectedBadge.threshold} />)}</div> : <p className="challenge-empty">当前筛选没有找到满足条件的三曲组合，请放宽课题总值范围或难度筛选。</p>}
    <section className="challenge-rescue"><header><div><small>RESCUE CALCULATOR</small><h2>课题救场</h2></div><span>已完成的成绩只保存在本页</span></header><div className="rescue-inputs">{rescueScores.map((score, index) => <label key={index}>第 {index + 1} 首<input inputMode="numeric" type="number" min="0" max="1000000" placeholder="未填写" value={score} onChange={(event) => setRescueScores((current) => current.map((value, item) => item === index ? event.target.value : value))} /></label>)}</div><div className={`rescue-summary ${rescue.feasible ? "" : "impossible"}`}><div><strong>{number.format(Math.max(0, rescue.needed))}</strong><small>剩余所需总分</small></div><div><strong>{rescue.remaining ? number.format(rescue.average) : "—"}</strong><small>剩余平均目标</small></div><div><strong>{number.format(rescue.maxRemaining)}</strong><small>剩余理论上限</small></div><p>{rescue.needed <= 0 ? "已达到选定铭牌门槛。" : rescue.feasible ? `还剩 ${rescue.remaining} 首，平均至少 ${number.format(rescue.average)} 分。` : "即使剩余谱面全部 Phi，也无法达到当前门槛。"}</p></div></section>
  </main>;
}
