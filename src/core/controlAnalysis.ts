import { score, type RoundingMode, type ScoreResult } from "./scoring";
import type { TargetMatch } from "./solver";
import type { ChartEvent, ChartNoteType, ChartTimeline } from "./chartTimeline";

export type ControlJudgementModel = {
  perfectWindowMs: number;
  goodWindowMs: number;
  badWindowMs: number;
  missCommitMs: number;
  holdReleaseToleranceMs: number;
  holdEarlyReleaseMs: number;
};

export const DEFAULT_CONTROL_MODEL: ControlJudgementModel = {
  perfectWindowMs: 80,
  goodWindowMs: 160,
  badWindowMs: 180,
  // This is deliberately configurable. The exact official miss commit time
  // must be calibrated against result recordings; it is not inferred from JSON.
  missCommitMs: 180,
  holdReleaseToleranceMs: 50,
  holdEarlyReleaseMs: 80,
};

export type ControlPlan = {
  breakIndex: number;
  releaseAfter: number;
  model?: Partial<ControlJudgementModel>;
};

export type ControlPlanResult = {
  plan: ControlPlan;
  breakNote: ChartEvent;
  releaseNote: ChartEvent;
  firstEventAfterMissCommit: ChartEvent | null;
  delayedPerfectCount: number;
  perfect: number;
  good: number;
  bad: number;
  miss: number;
  maxCombo: number;
  result: ScoreResult;
  displayScore: number;
  delta: number;
  riskScore: number;
  riskLabel: "低" | "中" | "高";
  confidence: "timing-configured";
  explanation: string;
};

export type ControlSearchOptions = {
  target: number;
  match?: TargetMatch;
  maxPlans?: number;
  rounding?: RoundingMode;
  model?: Partial<ControlJudgementModel>;
  candidateTypes?: ChartNoteType[];
};

const mergeModel = (model?: Partial<ControlJudgementModel>): ControlJudgementModel => ({ ...DEFAULT_CONTROL_MODEL, ...model });

const lowerBoundTime = (events: ChartEvent[], timeMs: number): number => {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (events[middle].timeMs < timeMs) low = middle + 1;
    else high = middle;
  }
  return low;
};

const typeRisk = (type: ChartNoteType): number => {
  if (type === "tap") return 1;
  if (type === "hold") return 3;
  if (type === "drag") return 5;
  if (type === "flick") return 6;
  return 7;
};

const riskLabel = (scoreValue: number): "低" | "中" | "高" => scoreValue <= 3 ? "低" : scoreValue <= 6 ? "中" : "高";

type ControlSimulation = Omit<ControlPlanResult, "result" | "delta"> & {
  displayScore: number;
};

const fastDisplayScore = (perfect: number, good: number, maxCombo: number, notes: number, rounding: RoundingMode): number => {
  const numerator = 900_000 * perfect + 585_000 * good + 100_000 * maxCombo;
  if (rounding === "floor") return Math.floor(numerator / notes);
  if (rounding === "ceil") return Math.ceil(numerator / notes);
  return Math.floor((2 * numerator + notes) / (2 * notes));
};

/**
 * Simulate the first useful control strategy: miss one note intentionally,
 * keep hitting until the delayed Miss commits, then release after a selected
 * event. All successful notes are treated as Perfect so Good is minimized.
 */
function simulateControlSummary(timeline: ChartTimeline, plan: ControlPlan, rounding: RoundingMode = "nearest"): ControlSimulation {
  const events = timeline.events;
  const model = mergeModel(plan.model);
  if (!Number.isInteger(plan.breakIndex) || plan.breakIndex < 1 || plan.breakIndex > events.length) throw new Error("断连音符序号无效");
  if (!Number.isInteger(plan.releaseAfter) || plan.releaseAfter < plan.breakIndex || plan.releaseAfter > events.length) throw new Error("停止击打位置无效");
  const breakNote = events[plan.breakIndex - 1];
  const releaseNote = events[plan.releaseAfter - 1];
  const missCommitTime = breakNote.timeMs + model.missCommitMs;
  const firstAfterOffset = lowerBoundTime(events, missCommitTime);
  const firstEventAfterMissCommit = events[firstAfterOffset] ?? null;
  const lastBeforeOffset = firstAfterOffset - 1;
  const lastBeforeIndex = lastBeforeOffset + 1;
  const delayedPerfectCount = Math.max(0, Math.min(plan.releaseAfter, lastBeforeIndex) - plan.breakIndex);
  const perfect = plan.releaseAfter - 1;
  const miss = events.length - perfect;
  const bad = 0;
  const good = 0;

  let maxCombo: number;
  if (plan.releaseAfter < firstAfterOffset + 1) {
    // The player releases before the skipped note's Miss is committed, so the
    // first chain remains active until release.
    maxCombo = Math.max(0, plan.releaseAfter - 1);
  } else {
    const beforeBreakCombo = Math.max(0, lastBeforeIndex - 1);
    const afterBreakCombo = Math.max(0, plan.releaseAfter - (firstAfterOffset + 1) + 1);
    maxCombo = Math.max(beforeBreakCombo, afterBreakCombo);
  }

  const displayScore = fastDisplayScore(perfect, good, maxCombo, events.length, rounding);
  const riskScore = typeRisk(breakNote.type) + (delayedPerfectCount > 0 ? 1 : 0) + (plan.releaseAfter < events.length ? 1 : 0);
  const breakText = `${breakNote.index}号 ${breakNote.type.toUpperCase()}`;
  const releaseText = `${releaseNote.index}号物量后松手`;
  const explanation = `${breakText}不输入，预计在 ${Math.round(missCommitTime)}ms 后提交 Miss；断连前继续命中 ${delayedPerfectCount} 个音符，${releaseText}。`;

  return {
    plan,
    breakNote,
    releaseNote,
    firstEventAfterMissCommit,
    delayedPerfectCount,
    perfect,
    good,
    bad,
    miss,
    maxCombo,
    displayScore,
    riskScore,
    riskLabel: riskLabel(riskScore),
    confidence: "timing-configured",
    explanation,
  };
}

export function simulateControlPlan(timeline: ChartTimeline, plan: ControlPlan, rounding: RoundingMode = "nearest"): ControlPlanResult {
  const summary = simulateControlSummary(timeline, plan, rounding);
  return {
    ...summary,
    result: score({ notes: timeline.events.length, perfect: summary.perfect, good: summary.good, bad: summary.bad, miss: summary.miss, maxCombo: summary.maxCombo }, rounding),
    delta: 0,
  };
}

const scoreDelta = (result: Pick<ControlSimulation, "displayScore">, target: number): number => result.displayScore - target;

const compareResults = (a: Pick<ControlSimulation, "displayScore" | "riskScore" | "good" | "miss" | "breakNote" | "releaseNote">, b: Pick<ControlSimulation, "displayScore" | "riskScore" | "good" | "miss" | "breakNote" | "releaseNote">, target: number): number => {
  const aDistance = Math.abs(scoreDelta(a, target));
  const bDistance = Math.abs(scoreDelta(b, target));
  return aDistance - bDistance || a.riskScore - b.riskScore || a.good - b.good || a.miss - b.miss || a.breakNote.index - b.breakNote.index || a.releaseNote.index - b.releaseNote.index;
};

const compareAtLeast = (a: Pick<ControlSimulation, "displayScore" | "riskScore" | "good" | "miss">, b: Pick<ControlSimulation, "displayScore" | "riskScore" | "good" | "miss">, target: number): number => {
  const aDelta = scoreDelta(a, target);
  const bDelta = scoreDelta(b, target);
  const aDistance = aDelta >= 0 ? aDelta : Number.POSITIVE_INFINITY;
  const bDistance = bDelta >= 0 ? bDelta : Number.POSITIVE_INFINITY;
  return aDistance - bDistance || a.riskScore - b.riskScore || a.good - b.good || a.miss - b.miss;
};

/**
 * Search break/release pairs in O(number of candidate notes × chart length).
 * For a normal 1–3k note chart this is fast in a Worker and avoids frame-level
 * input enumeration. Only Tap/Hold are considered by default because an
 * intentional Drag/Flick miss is much harder for a human to execute.
 */
export function findControlPlans(timeline: ChartTimeline, options: ControlSearchOptions): ControlPlanResult[] {
  if (!Number.isInteger(options.target) || options.target < 0 || options.target > 1_000_000) throw new Error("目标分数必须是 0–1,000,000 的整数");
  const maxPlans = Math.max(1, Math.min(50, Math.floor(options.maxPlans ?? 8)));
  const match = options.match ?? "nearest";
  const candidateTypes = new Set(options.candidateTypes ?? ["tap", "hold"]);
  const candidates: ControlPlanResult[] = [];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const breakNote of timeline.events) {
    if (!candidateTypes.has(breakNote.type)) continue;
    for (let releaseAfter = breakNote.index; releaseAfter <= timeline.events.length; releaseAfter += 1) {
      const summary = simulateControlSummary(timeline, { breakIndex: breakNote.index, releaseAfter, model: options.model }, options.rounding ?? "nearest");
      const delta = scoreDelta(summary, options.target);
      const matches = match === "exact" ? delta === 0 : match === "atLeast" ? delta >= 0 : true;
      if (match === "nearest") {
        const distance = Math.abs(delta);
        if (distance < bestDistance) {
          bestDistance = distance;
          candidates.length = 0;
        }
        if (distance > bestDistance) continue;
      } else if (!matches) {
        continue;
      }
      const result = score({ notes: timeline.events.length, perfect: summary.perfect, good: summary.good, bad: summary.bad, miss: summary.miss, maxCombo: summary.maxCombo }, options.rounding ?? "nearest");
      const withDelta: ControlPlanResult = { ...summary, result, delta };
      candidates.push(withDelta);
      const comparator = match === "atLeast" ? (a: ControlPlanResult, b: ControlPlanResult) => compareAtLeast(a, b, options.target) : (a: ControlPlanResult, b: ControlPlanResult) => compareResults(a, b, options.target);
      candidates.sort(comparator);
      if (candidates.length > maxPlans * 8) candidates.length = maxPlans * 8;
    }
  }

  const comparator = match === "atLeast" ? (a: ControlPlanResult, b: ControlPlanResult) => compareAtLeast(a, b, options.target) : (a: ControlPlanResult, b: ControlPlanResult) => compareResults(a, b, options.target);
  return candidates.sort(comparator).slice(0, maxPlans);
}
