import { useEffect, useRef, useState } from "react";
import "../control.css";
import "../control-embedded.css";
import type { ChartRecord } from "../data/types";
import type { ControlPlanResult } from "../core/controlAnalysis";

type Props = {
  chart?: ChartRecord;
  target: number;
  onTargetChange: (value: number) => void;
  embedded?: boolean;
};

type WorkerResponse = {
  id: number;
  type: "control";
  plans: ControlPlanResult[];
  timeline?: { noteCount: number; bpm: number; durationMs: number; hasLineTransforms: boolean };
  error: string;
};

const number = new Intl.NumberFormat("en-US");
const difficultyName: Record<string, string> = { ez: "EZ", hd: "HD", in: "IN", at: "AT" };

export default function ControlAnalysis({ chart, target, onTargetChange, embedded = false }: Props) {
  const [match, setMatch] = useState<"exact" | "nearest" | "atLeast">("exact");
  const [missCommitMs, setMissCommitMs] = useState(180);
  const [maxPlans, setMaxPlans] = useState(8);
  const [busy, setBusy] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState<ControlPlanResult[]>([]);
  const [timeline, setTimeline] = useState<WorkerResponse["timeline"]>();
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    setPlans([]);
    setTimeline(undefined);
    setHasAnalyzed(false);
  }, [chart?.chartId]);

  useEffect(() => {
    try {
      const worker = new Worker(new URL("../workers/calculation.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type !== "control" || event.data.id !== requestRef.current) return;
        setPlans(event.data.plans ?? []);
        setTimeline(event.data.timeline);
        setError(event.data.error || "");
        setBusy(false);
      };
      worker.onerror = () => {
        setError("控分分析线程启动失败，请刷新页面重试。");
        setBusy(false);
      };
      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch {
      setError("当前浏览器不支持后台控分分析。");
      return undefined;
    }
  }, []);

  const analyze = () => {
    if (!chart || !workerRef.current) return;
    const id = ++requestRef.current;
    setBusy(true);
    setHasAnalyzed(true);
    setError("");
    setPlans([]);
    workerRef.current.postMessage({
      id,
      type: "control",
      chart: { songId: chart.songId, difficulty: chart.difficulty },
      options: {
        target,
        match,
        maxPlans,
        model: { missCommitMs },
        candidateTypes: ["tap", "hold", "drag", "flick"],
      },
    });
  };

  const Root = embedded ? "section" : "main";

  return <Root className={embedded ? "calculator-panel control-embedded" : "control-page"}>
    {embedded ? <div className="calculator-heading">
      <div><h2>目标分数反推</h2><span>{chart ? `${chart.title} · ${difficultyName[chart.difficulty] ?? chart.difficulty.toUpperCase()} ${chart.constant?.toFixed(1) ?? "—"}` : "请先在上方歌曲列表选择谱面"}</span></div>
      <small>完整谱面事件</small>
    </div> : <header className="calculator-heading control-page-heading">
      <div><small>EVENT-LEVEL SCORE CONTROL</small><h1>精确搜索</h1><p>{chart ? `${chart.title} · ${difficultyName[chart.difficulty] ?? chart.difficulty.toUpperCase()} ${chart.constant?.toFixed(1) ?? "—"}` : "请先在上方歌曲列表选择谱面"}</p></div>
      <span className="control-mark">Φ</span>
    </header>}
    <section className="solver-controls precise-settings">
      <label className="control-field"><span>目标分数</span><input type="number" min="0" max="1000000" value={target} onChange={(event) => onTargetChange(Number(event.target.value))} /></label>
      <label className="control-field"><span>匹配方式</span><select value={match} onChange={(event) => setMatch(event.target.value as typeof match)}><option value="exact">精确命中</option><option value="nearest">最接近</option><option value="atLeast">至少达到</option></select></label>
      <label className="control-field"><span>Miss 提交延迟（ms）</span><input type="number" min="1" max="500" value={missCommitMs} onChange={(event) => setMissCommitMs(Number(event.target.value))} /></label>
      <label className="control-field"><span>显示方案数</span><input type="number" min="1" max="50" value={maxPlans} onChange={(event) => setMaxPlans(Number(event.target.value))} /></label>
      <button className="control-run" type="button" onClick={analyze} disabled={busy || !chart}>{busy ? "分析中…" : "开始分析"}</button>
    </section>
    <p className="control-disclaimer">四类音符都会作为候选断连点，结果按执行难度排序；所有命中暂按 Perfect 处理以最小化 Good。Drag/Flick 路径、Hold 中断和判定线几何仍需后续校准。</p>
    {error && <p className="error">{error}</p>}
    {timeline && <div className="control-timeline-meta"><span>{number.format(timeline.noteCount)} NOTES</span><span>BPM {timeline.bpm.toFixed(2).replace(/\.00$/, "")}</span><span>{(timeline.durationMs / 1000).toFixed(1)}s</span><span>{timeline.hasLineTransforms ? "含判定线变换" : "无判定线变换摘要"}</span></div>}
    {!busy && !error && plans.length === 0 && <div className="control-empty">{hasAnalyzed ? "当前判定参数下没有符合条件的方案；可以切换到“最接近”，或调整 Miss 提交延迟。" : "选择谱面和目标分数后开始。对于 70 Minutes Fighters IN，可以先尝试 700000 分和 180ms。"}</div>}
    <section className="control-results">{plans.map((plan, index) => <article className="control-result" key={`${plan.breakNote.index}-${plan.releaseNote.index}-${index}`}>
      <div className="control-result-top"><div><small>方案 {index + 1} · {plan.confidence}</small><strong>{number.format(Number(plan.result.display))}</strong><span className={plan.delta === 0 ? "exact" : "delta"}>{plan.delta > 0 ? "+" : ""}{number.format(plan.delta)} · {plan.riskLabel}执行难度</span></div><div className="control-counts"><b>P {number.format(plan.perfect)}</b><b>G {plan.good}</b><b>B + M {number.format(plan.bad + plan.miss)}</b><b>C {number.format(plan.maxCombo)}</b></div></div>
      <div className="control-result-route"><span>断连 {plan.breakNote.index} {plan.breakNote.type.toUpperCase()}</span><span>停止 {plan.releaseNote.index}号后</span></div>
    </article>)}</section>
  </Root>;
}
