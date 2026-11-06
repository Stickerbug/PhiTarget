import { useMemo, useState } from "react";
import { challengeBadgeRules, solveChallengeTarget, type ChallengeBadgeId } from "../core/challenge";
import type { PhigrosCloudRecord } from "../core/phigrosCloud";
import type { ChartRecord } from "../data/types";

const number = new Intl.NumberFormat("en-US");
const difficultyOrder = ["ez", "hd", "in", "at"];
const difficultyName: Record<string, string> = { ez: "EZ", hd: "HD", in: "IN", at: "AT" };

type Strategy = "balanced" | "high" | "low" | "personal";
type Props = { charts: ChartRecord[]; playerRecords: PhigrosCloudRecord[]; playerRks: number | null };
type Plan = {
  charts: ChartRecord[];
  levelTotal: number;
  targetScores: number[];
  actualScores: number[];
  scoreSpread: number;
  personalScores: Array<number | null>;
  personalTotal: number | null;
  personalGap: number;
};

const floorConstant = (chart: ChartRecord) => chart.constant === null ? null : Math.floor(chart.constant);
const chartGoodCap = (chart: ChartRecord) => chart.noteCounts.tap !== null && chart.noteCounts.hold !== null ? chart.noteCounts.tap + chart.noteCounts.hold : chart.noteCount ?? 0;

function buildPlans(charts: ChartRecord[], minLevel: number, maxLevel: number, threshold: number, strategy: Strategy, chapter: string, difficulties: string[], personalBest: Map<string, number>, playerRks: number | null): Plan[] {
  const personalMode = personalBest.size > 0;
  const eligible = charts.filter((chart) => {
    const floor = floorConstant(chart);
    const hasPlayedRecord = personalBest.has(chart.chartId);
    return floor !== null && floor >= 0 && (chapter === "all" || chart.chapter === chapter) && difficulties.includes(chart.difficulty) && !chart.chapter.includes("Legacy") && (!personalMode || hasPlayedRecord);
  });
  const buckets = new Map<number, ChartRecord[]>();
  for (const chart of eligible) {
    const floor = floorConstant(chart)!;
    buckets.set(floor, [...(buckets.get(floor) ?? []), chart]);
  }
  for (const [floor, list] of buckets) {
    list.sort((a, b) => {
      const scoreGap = (personalBest.get(b.chartId) ?? 0) - (personalBest.get(a.chartId) ?? 0);
      const rksGap = playerRks === null ? 0 : Math.max(0, (b.constant ?? 0) - playerRks) - Math.max(0, (a.constant ?? 0) - playerRks);
      return scoreGap || rksGap || a.title.localeCompare(b.title);
    });
    buckets.set(floor, list);
  }
  const floors = [...buckets.keys()].sort((a, b) => a - b);
  const plans: Plan[] = [];
  const maxPerFloor = personalMode ? 24 : 10;
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
              const personalScores = ordered.map((chart) => personalBest.get(chart.chartId) ?? null);
              const filledScores = personalScores.filter((score): score is number => score !== null);
              const personalTotal = filledScores.length === personalScores.length ? filledScores.reduce((sum, score) => sum + score, 0) : null;
              const personalGap = personalScores.reduce<number>((sum, score, index) => sum + Math.max(0, targetScores[index] - (score ?? 0)), 0);
              plans.push({ charts: ordered, levelTotal, targetScores: [...targetScores], actualScores: scores, scoreSpread: spread, personalScores, personalTotal, personalGap });
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
    if (personalMode && (strategy === "balanced" || strategy === "personal")) {
      const feasible = (plan: Plan) => plan.personalTotal !== null && plan.personalTotal >= threshold ? 0 : 1;
      return feasible(a) - feasible(b) || a.personalGap - b.personalGap || a.scoreSpread - b.scoreSpread || b.levelTotal - a.levelTotal;
    }
    if (strategy === "high") return b.levelTotal - a.levelTotal || a.scoreSpread - b.scoreSpread;
    if (strategy === "low") return a.targetScores[0] - b.targetScores[0] || b.levelTotal - a.levelTotal;
    if (strategy === "personal") return a.personalGap - b.personalGap || a.scoreSpread - b.scoreSpread || b.levelTotal - a.levelTotal;
    return a.scoreSpread - b.scoreSpread || Math.abs(a.levelTotal - (minLevel + maxLevel) / 2) - Math.abs(b.levelTotal - (minLevel + maxLevel) / 2);
  }).slice(0, 12);
}

function PlanCard({ plan, threshold }: { plan: Plan; threshold: number }) {
  const margin = plan.actualScores.reduce((sum, score) => sum + score, 0) - threshold;
  const personalSummary = plan.personalTotal === null ? "TapTap 成绩不完整" : `TapTap 合计 ${number.format(plan.personalTotal)} · 缺口 ${number.format(plan.personalGap)}`;
  return <article className="challenge-plan-card">
    <header><div><small>课题总值</small><strong>{plan.levelTotal}</strong></div><div><small>目标合计</small><strong>{number.format(threshold)}</strong></div><span className="plan-margin">{margin >= 0 ? "+" : ""}{number.format(margin)}</span></header>
    <p className="challenge-personal-summary">{personalSummary}</p><div className="challenge-plan-songs">{plan.charts.map((chart, index) => <div className="challenge-plan-song" key={chart.chartId}><img src={`https://cdn.jsdelivr.net/gh/7aGiven/Phigros_Resource@illustrationLowRes/${encodeURIComponent(chart.songId)}.png`} alt="" loading="lazy" decoding="async" /><div><strong>{chart.title}</strong><small>{difficultyName[chart.difficulty]} {chart.constant?.toFixed(1)} · {chart.composer || "—"}</small><span>建议 {number.format(plan.targetScores[index])}　实算 {number.format(plan.actualScores[index])}</span><em>{plan.personalScores[index] === null ? "暂无 TapTap 成绩" : `TapTap 最佳 ${number.format(plan.personalScores[index]!)}`}</em></div></div>)}</div>
  </article>;
}

export default function ChallengePlanner({ charts, playerRecords, playerRks }: Props) {
  const [minLevel, setMinLevel] = useState(45);
  const [maxLevel, setMaxLevel] = useState(45);
  const [badge, setBadge] = useState<ChallengeBadgeId>("blue");
  const [strategy, setStrategy] = useState<Strategy>("personal");
  const [chapter, setChapter] = useState("all");
  const [difficulties, setDifficulties] = useState(["in", "at"]);
  const personalBest = useMemo(() => {
    const best = new Map<string, number>();
    for (const record of playerRecords) best.set(record.chartId, Math.max(best.get(record.chartId) ?? 0, record.score));
    return best;
  }, [playerRecords]);
  const selectedBadge = challengeBadgeRules.find((rule) => rule.id === badge) ?? challengeBadgeRules[1];
  const chapters = useMemo(() => [...new Set(charts.map((chart) => chart.chapter))].filter((value) => !value.includes("Legacy")).sort((a, b) => a.localeCompare(b)), [charts]);
  const plans = useMemo(() => buildPlans(charts, Math.min(minLevel, maxLevel), Math.max(minLevel, maxLevel), selectedBadge.threshold, strategy, chapter, difficulties, personalBest, playerRks), [chapter, charts, difficulties, maxLevel, minLevel, personalBest, playerRks, selectedBadge.threshold, strategy]);
  const cloudConnected = playerRks !== null || playerRecords.length > 0;
  const toggleDifficulty = (difficulty: string) => setDifficulties((current) => current.includes(difficulty) ? current.filter((item) => item !== difficulty) : [...current, difficulty]);

  return <main className="feature-page challenge-page">
    <header className="feature-heading"><div><small>CHALLENGE ROUTE PLANNER</small><h1>课题规划</h1><p>按目标课题等级、可游玩成绩和曲包筛选三张来自不同歌曲的谱面。</p></div><span className="feature-mark">3</span></header>
    <section className="challenge-control-panel">
      <div className="challenge-control-grid"><label>目标课题总值<input type="number" min="0" max="54" value={minLevel} onChange={(event) => setMinLevel(Number(event.target.value))} /></label><label>至<input type="number" min="0" max="54" value={maxLevel} onChange={(event) => setMaxLevel(Number(event.target.value))} /></label><label>铭牌<select value={badge} onChange={(event) => setBadge(event.target.value as ChallengeBadgeId)}>{challengeBadgeRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.label} · {number.format(rule.threshold)}</option>)}</select></label><label>排序策略<select value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)}><option value="balanced">最均衡</option><option value="high">课题总值最高</option><option value="low">允许一首低分</option><option value="personal">个人成绩匹配</option></select></label><label>曲包/章节<select value={chapter} onChange={(event) => setChapter(event.target.value)}><option value="all">全部</option>{chapters.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
      <div className="challenge-difficulty-filter"><span>难度</span>{difficultyOrder.map((difficulty) => <button type="button" key={difficulty} className={`difficulty-pill difficulty-${difficulty} ${difficulties.includes(difficulty) ? "selected" : ""}`} onClick={() => toggleDifficulty(difficulty)}>{difficultyName[difficulty]}</button>)}</div>
      <p className="challenge-rule-note">当前使用课题模式数量模型：三首不同歌曲，课题总值按谱面定数向下取整相加；{playerRecords.length ? `已按 TapTap 云档过滤未游玩谱面，共 ${playerRecords.length} 条成绩，RKS ${playerRks === null ? "—" : playerRks.toFixed(2)}。` : cloudConnected ? "已连接 TapTap 云档，但当前曲库没有匹配的已游玩成绩。" : "尚未连接 TapTap 云档，当前显示通用候选。"}</p>
    </section>
    <section className="challenge-result-heading"><div><strong>{plans.length}</strong><span>组候选</span></div><div><strong style={{ color: selectedBadge.color }}>{selectedBadge.label}</strong><span>目标 {number.format(selectedBadge.threshold)}</span></div><div><strong>{minLevel === maxLevel ? minLevel : `${Math.min(minLevel, maxLevel)}–${Math.max(minLevel, maxLevel)}`}</strong><span>课题总值</span></div></section>
    {plans.length ? <div className="challenge-plan-grid">{plans.map((plan, index) => <PlanCard key={`${index}-${plan.charts.map((chart) => chart.chartId).join("|")}`} plan={plan} threshold={selectedBadge.threshold} />)}</div> : <p className="challenge-empty">{cloudConnected ? "当前等级范围没有找到三张已游玩且可组合的谱面；请扩大等级范围，或先在游戏中解锁并游玩更多谱面。" : "当前筛选没有找到满足条件的三曲组合，请放宽课题总值范围或连接 TapTap 云档。"}</p>}
  </main>;
}
