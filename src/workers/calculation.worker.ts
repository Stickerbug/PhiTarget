import { findChallengeCombinations, type ChallengeCombinationMatch } from "../core/challenge";
import { analyzeReachableScores, type ReachabilityMode } from "../core/reachable";
import { findControlPlans, type ControlSearchOptions } from "../core/controlAnalysis";
import { loadChartTimeline } from "../core/chartTimeline";
import type { ChartRecord } from "../data/types";

type InitRequest = { type: "init"; charts: ChartRecord[] };

type CombinationRequest = {
  id: number;
  type: "combinations";
  target: number;
  match: ChallengeCombinationMatch;
  options: {
    difficulties?: string[];
    chapter?: string;
    minConstant?: number | null;
    maxConstant?: number | null;
    personalBest: Array<[string, number]>;
    usePersonal: boolean;
    maxPlans: number;
  };
};

type ReachableRequest = {
  id: number;
  type: "reachable";
  notes: number;
  mode: ReachabilityMode;
  maxCombo: number | null;
  goodCap: number;
};

type ControlRequest = {
  id: number;
  type: "control";
  chart: Pick<ChartRecord, "songId" | "difficulty">;
  options: ControlSearchOptions;
};

type WorkerRequest = InitRequest | CombinationRequest | ReachableRequest | ControlRequest;

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

const scope = self as unknown as WorkerScope;
let charts: ChartRecord[] = [];

scope.onmessage = async (event) => {
  const request = event.data;
  if (request.type === "init") {
    charts = request.charts;
    return;
  }
  try {
    if (request.type === "combinations") {
      const plans = findChallengeCombinations(charts, request.target, request.match, {
        ...request.options,
        personalBest: new Map(request.options.personalBest),
      });
      scope.postMessage({ id: request.id, type: request.type, plans, error: "" });
    } else if (request.type === "control") {
      const timeline = await loadChartTimeline(request.chart);
      const plans = findControlPlans(timeline, request.options);
      scope.postMessage({ id: request.id, type: request.type, plans, timeline: { noteCount: timeline.events.length, bpm: timeline.bpm, durationMs: timeline.durationMs, hasLineTransforms: timeline.hasLineTransforms }, error: "" });
    } else {
      const analysis = analyzeReachableScores(request.notes, request.mode, request.maxCombo, request.goodCap);
      scope.postMessage({ id: request.id, type: request.type, analysis, error: "" });
    }
  } catch (error) {
    scope.postMessage({ id: request.id, type: request.type, ...(request.type === "combinations" ? { plans: [] } : { analysis: null }), error: error instanceof Error ? error.message : "后台计算失败" });
  }
};

export {};

