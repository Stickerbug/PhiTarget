import { challengeScore, type RoundingMode } from "./scoring";
import type { ChartRecord } from "../data/types";

export type ChallengeMatch = "exact" | "atLeast" | "nearest";

export type ChallengeSolution = {
  perfect: number;
  good: number;
  badMiss: number;
  score: number;
  delta: number;
};

/**
 * Community candidate thresholds used by the planner. Keep these separate
 * from normal score ranks: challenge mode sums three accuracy-only scores.
 * The target game version should still be calibrated with real result screens.
 */
export const challengeBadgeRules = [
  { id: "green", label: "绿", threshold: 2_460_000, color: "#76bd42" },
  { id: "blue", label: "蓝", threshold: 2_700_000, color: "#40a9e8" },
  { id: "red", label: "红", threshold: 2_850_000, color: "#e52a32" },
  { id: "gold", label: "金", threshold: 2_940_000, color: "#e2aa42" },
  { id: "rainbow", label: "彩", threshold: 3_000_000, color: "#d7d1ff" },
] as const;

export type ChallengeBadgeId = (typeof challengeBadgeRules)[number]["id"];

export type ChallengeCombinationMatch = "exact" | "atLeast" | "nearest";

export type ChallengeCombinationPlan = {
  charts: ChartRecord[];
  targetScores: number[];
  actualScores: number[];
  totalScore: number;
  delta: number;
  levelTotal: number;
  constantSpread: number;
  personal: boolean;
};

type CombinationEntry = {
  chart: ChartRecord;
  value: number;
  baseScore: number;
  highScore: number;
};

const candidate = (notes: number, target: number, good: number, badMiss: number, rounding: RoundingMode): ChallengeSolution => {
  const result = challengeScore({ notes, perfect: notes - good - badMiss, good, bad: badMiss, miss: 0 }, rounding);
  const score = Number(result.display);
  return { perfect: notes - good - badMiss, good, badMiss, score, delta: score - target };
};

/**
 * In challenge mode there is no combo contribution. Bad and Miss are grouped
 * here because they have the same score weight in the count-level model.
 */
export function solveChallengeTarget(notes: number, target: number, match: ChallengeMatch, rounding: RoundingMode = "nearest", goodCap = notes): ChallengeSolution[] {
  if (!Number.isInteger(notes) || notes <= 0) throw new Error("Notes must be a positive integer");
  if (!Number.isInteger(target) || target < 0 || target > 1_000_000) throw new Error("Challenge target must be between 0 and 1,000,000");
  if (!Number.isInteger(goodCap) || goodCap < 0 || goodCap > notes) throw new Error("Good cap must be between zero and notes");

  const candidates: ChallengeSolution[] = [];
  // Raw = 1,000,000 - (350,000 * Good + 1,000,000 * BadMiss) / N.
  // Solve the affine Good value for each error count instead of enumerating
  // every Good × BadMiss pair.
  for (let badMiss = 0; badMiss <= notes; badMiss += 1) {
    const numerator = (1_000_000 * notes) - (1_000_000 * badMiss) - (target * notes);
    const idealGood = Math.round(numerator / 350_000);
    for (const good of [idealGood - 1, idealGood, idealGood + 1]) {
      if (good < 0 || good > goodCap || good + badMiss > notes) continue;
      candidates.push(candidate(notes, target, good, badMiss, rounding));
    }
  }
  candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.badMiss - b.badMiss || a.good - b.good);
  if (match === "nearest") return candidates.slice(0, 5);
  if (match === "exact") return candidates.filter((item) => item.delta === 0).slice(0, 10);
  return candidates.filter((item) => item.delta >= 0).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.badMiss - b.badMiss).slice(0, 5);
}

const chartGoodCap = (chart: ChartRecord) => chart.noteCounts.tap !== null && chart.noteCounts.hold !== null
  ? chart.noteCounts.tap + chart.noteCounts.hold
  : chart.noteCount ?? 0;

const chartLevel = (chart: ChartRecord) => chart.constant === null ? -1 : Math.floor(chart.constant);

const lowerBound = (values: CombinationEntry[], target: number) => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle].value < target) low = middle + 1;
    else high = middle;
  }
  return low;
};

const compareCombinationDelta = (match: ChallengeCombinationMatch, a: number, b: number) => {
  if (match === "atLeast") {
    const aValid = a >= 0;
    const bValid = b >= 0;
    return Number(!aValid) - Number(!bValid) || Math.abs(a) - Math.abs(b);
  }
  return Math.abs(a) - Math.abs(b);
};

/**
 * Find three-song challenge combinations for a requested total score.
 * Personal mode uses the player's best cloud scores as fixed contributions;
 * formula mode assigns an equal target to each song and rounds it to a score
 * that the individual chart's count model can reach. The result is a ranked
 * shortlist, never an assertion that the player can reproduce the score.
 */
export function findChallengeCombinations(
  charts: ChartRecord[],
  target: number,
  match: ChallengeCombinationMatch = "nearest",
  options: {
    difficulties?: string[];
    chapter?: string;
    minConstant?: number | null;
    maxConstant?: number | null;
    personalBest?: Map<string, number>;
    usePersonal?: boolean;
    maxPlans?: number;
  } = {},
): ChallengeCombinationPlan[] {
  if (!Number.isInteger(target) || target < 0 || target > 3_000_000) {
    throw new Error("课题总分应为 0 到 3,000,000 之间的整数");
  }
  const difficulties = options.difficulties === undefined ? null : new Set(options.difficulties);
  const personalBest = options.personalBest ?? new Map<string, number>();
  const personal = Boolean(options.usePersonal && personalBest.size > 0);
  const shareBase = Math.floor(target / 3);
  const shares = [shareBase, shareBase, target - shareBase * 2];
  const scoreCache = new Map<string, number>();
  const scoreFor = (chart: ChartRecord, requested: number) => {
    const key = `${chart.chartId}:${requested}`;
    const cached = scoreCache.get(key);
    if (cached !== undefined) return cached;
    const solution = solveChallengeTarget(chart.noteCount ?? 1, requested, "nearest", "nearest", Math.min(chart.noteCount ?? 1, chartGoodCap(chart)))[0];
    const score = solution?.score ?? 0;
    scoreCache.set(key, score);
    return score;
  };
  const eligible = charts.filter((chart) => {
    if (chart.noteCount === null || chart.constant === null) return false;
    if (difficulties && !difficulties.has(chart.difficulty)) return false;
    if (options.chapter && options.chapter !== "all" && chart.chapter !== options.chapter) return false;
    if (options.minConstant !== null && options.minConstant !== undefined && chart.constant < options.minConstant) return false;
    if (options.maxConstant !== null && options.maxConstant !== undefined && chart.constant > options.maxConstant) return false;
    if (personal && !personalBest.has(chart.chartId)) return false;
    return true;
  });
  const entries: CombinationEntry[] = eligible.map((chart) => {
    const personalScore = personalBest.get(chart.chartId);
    if (personal && personalScore !== undefined) return { chart, value: personalScore, baseScore: personalScore, highScore: personalScore };
    const baseScore = scoreFor(chart, shares[0]);
    const highScore = scoreFor(chart, shares[2]);
    return { chart, value: baseScore, baseScore, highScore };
  });
  const maxCandidates = Math.min(entries.length, personal ? 420 : 260);
  entries.sort((a, b) => personal
    ? b.value - a.value || chartLevel(b.chart) - chartLevel(a.chart)
    : chartLevel(b.chart) - chartLevel(a.chart) || b.value - a.value);
  const selectedEntries = entries.slice(0, maxCandidates).sort((a, b) => a.value - b.value || a.chart.chartId.localeCompare(b.chart.chartId));
  const plans = new Map<string, ChallengeCombinationPlan>();

  const consider = (selected: CombinationEntry[]) => {
    const chartsInPlan = selected.map((entry) => entry.chart);
    if (new Set(chartsInPlan.map((chart) => chart.songId)).size !== 3) return;
    let targetScores: number[];
    let actualScores: number[];
    if (personal) {
      targetScores = selected.map((entry) => entry.value);
      actualScores = [...targetScores];
    } else {
      const possibilities = [0, 1, 2].map((highIndex) => {
        const desired = selected.map((entry, index) => index === highIndex ? shares[2] : shares[0]);
        const actual = selected.map((entry, index) => index === highIndex ? entry.highScore : entry.baseScore);
        return { desired, actual, delta: actual.reduce((sum, score) => sum + score, 0) - target };
      });
      const best = possibilities.sort((a, b) => compareCombinationDelta(match, a.delta, b.delta))[0];
      targetScores = best.desired;
      actualScores = best.actual;
    }
    const totalScore = actualScores.reduce((sum, score) => sum + score, 0);
    const delta = totalScore - target;
    const levels = chartsInPlan.map(chartLevel);
    const key = chartsInPlan.map((chart) => chart.chartId).sort().join("|");
    const plan: ChallengeCombinationPlan = {
      charts: chartsInPlan,
      targetScores,
      actualScores,
      totalScore,
      delta,
      levelTotal: levels.reduce((sum, level) => sum + level, 0),
      constantSpread: Math.max(...chartsInPlan.map((chart) => chart.constant ?? 0)) - Math.min(...chartsInPlan.map((chart) => chart.constant ?? 0)),
      personal,
    };
    const existing = plans.get(key);
    if (!existing || compareCombinationDelta(match, plan.delta, existing.delta) < 0 || (Math.abs(plan.delta) === Math.abs(existing.delta) && plan.constantSpread < existing.constantSpread)) plans.set(key, plan);
  };

  for (let i = 0; i < selectedEntries.length; i += 1) {
    for (let j = i + 1; j < selectedEntries.length; j += 1) {
      const first = selectedEntries[i];
      const second = selectedEntries[j];
      const wanted = target - first.value - second.value;
      let index = lowerBound(selectedEntries, wanted);
      if (index <= j) index = j + 1;
      const candidateIndices = new Set<number>();
      for (let offset = -3; offset <= 3; offset += 1) candidateIndices.add(index + offset);
      candidateIndices.add(j + 1);
      candidateIndices.add(selectedEntries.length - 1);
      for (const k of candidateIndices) {
        if (k <= j || k >= selectedEntries.length) continue;
        consider([first, second, selectedEntries[k]]);
      }
    }
  }
  const maxPlans = Math.max(1, Math.min(options.maxPlans ?? 12, 50));
  const candidates = [...plans.values()].filter((plan) => match === "exact" ? plan.delta === 0 : match === "atLeast" ? plan.delta >= 0 : true);
  return candidates.sort((a, b) => compareCombinationDelta(match, a.delta, b.delta) || b.levelTotal - a.levelTotal || a.constantSpread - b.constantSpread).slice(0, maxPlans);
}
