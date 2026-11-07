import { useEffect, useMemo, useRef, useState } from "react";
import "../control.css";
import "../control-embedded.css";
import type { ChartRecord } from "../data/types";
import type { ControlPlanResult } from "../core/controlAnalysis";

type Props = {
  charts: ChartRecord[];
  initialChart?: ChartRecord;
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
const difficultyOrder = ["ez", "hd", "in", "at"];
const difficultyName: Record<string, string> = { ez: "EZ", hd: "HD", in: "IN", at: "AT" };

const chartLabel = (chart: ChartRecord) => `${chart.title} · ${difficultyName[chart.difficulty] ?? chart.difficulty.toUpperCase()} ${chart.constant?.toFixed(1) ?? "—"}`;

export default function ControlAnalysis({ charts, initialChart, embedded = false }: Props) {
  const [chartId, setChartId] = useState(initialChart?.chartId ?? charts[0]?.chartId ?? "");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState(700000);
  const [match, setMatch] = useState<"exact" | "nearest" | "atLeast">("exact");
  const [missCommitMs, setMissCommitMs] = useState(180);
  const [maxPlans, setMaxPlans] = useState(8);
  const [busy, setBusy] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState<ControlPlanResult[]>([]);
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const [timeline, setTimeline] = useState<WorkerResponse["timeline"]>();
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (initialChart?.chartId) setChartId(initialChart.chartId);
  }, [initialChart?.chartId]);

  useEffect(() => {
    setPlans([]);
    setTimeline(undefined);
    setHasAnalyzed(false);
    setExpandedPlans(new Set());
  }, [chartId]);

  const selected = charts.find((chart) => chart.chartId === chartId) ?? initialChart ?? charts[0];
  const options = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return charts
      .filter((chart) => !normalized || `${chart.title} ${chart.songId} ${chart.difficulty}`.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => a.title.localeCompare(b.title) || difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty));
  }, [charts, query]);

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
    if (!selected || !workerRef.current) return;
    const id = ++requestRef.current;
    setBusy(true);
    setHasAnalyzed(true);
    setError("");
    setPlans([]);
    setExpandedPlans(new Set());
    workerRef.current.postMessage({
      id,
      type: "control",
      chart: { songId: selected.songId, difficulty: selected.difficulty },
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
  const togglePlan = (key: string) => setExpandedPlans((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return <Root className={embedded ? "control-embedded" : "control-page"}>
    <header className="control-page-heading">
      <div><small>EVENT-LEVEL SCORE CONTROL</small><h1>控分分析</h1><p>按完整谱面事件模拟“故意漏掉一个音符、延迟断连、指定位置松手”的方案。</p></div>
      <span className="control-mark">Φ</span>
    </header>
    <section className="control-panel control-settings">
      <div className="control-field control-field-wide"><label>谱面</label><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索歌曲后选择谱面" /><select value={selected?.chartId ?? ""} onChange={(event) => setChartId(event.target.value)}>{options.map((chart) => <option key={chart.chartId} value={chart.chartId}>{chartLabel(chart)}</option>)}</select></div>
      <label className="control-field"><span>目标分数</span><input type="number" min="0" max="1000000" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label>
      <label className="control-field"><span>匹配方式</span><select value={match} onChange={(event) => setMatch(event.target.value as typeof match)}><option value="exact">精确命中</option><option value="nearest">最接近</option><option value="atLeast">至少达到</option></select></label>
      <label className="control-field"><span>Miss 提交延迟（ms）</span><input type="number" min="1" max="500" value={missCommitMs} onChange={(event) => setMissCommitMs(Number(event.target.value))} /></label>
      <label className="control-field"><span>显示方案数</span><input type="number" min="1" max="50" value={maxPlans} onChange={(event) => setMaxPlans(Number(event.target.value))} /></label>
      <button className="control-run" type="button" onClick={analyze} disabled={busy || !selected}>{busy ? "分析中…" : "开始分析"}</button>
    </section>
    <p className="control-disclaimer">当前阶段优先搜索 Tap/Hold 故意漏击，所有命中按 Perfect 处理以最小化 Good。Drag/Flick 路径、Hold 中断和判定线几何将在后续校准；Miss 提交延迟是可调参数，不代表已完成官方行为校准。</p>
    {error && <p className="error">{error}</p>}
    {timeline && <div className="control-timeline-meta"><span>{number.format(timeline.noteCount)} NOTES</span><span>BPM {timeline.bpm.toFixed(2).replace(/\.00$/, "")}</span><span>{(timeline.durationMs / 1000).toFixed(1)}s</span><span>{timeline.hasLineTransforms ? "含判定线变换" : "无判定线变换摘要"}</span></div>}
    {!busy && !error && plans.length === 0 && <div className="control-empty">{hasAnalyzed ? "当前判定参数下没有符合条件的方案；可以切换到“最接近”，或调整 Miss 提交延迟。" : "选择谱面和目标分数后开始。对于 70 Minutes Fighters IN，可以先尝试 700000 分和 180ms。"}</div>}
    <section className="control-results">{plans.map((plan, index) => {
      const key = `${plan.breakNote.index}-${plan.releaseNote.index}-${plan.displayScore}`;
      const expanded = expandedPlans.has(key);
      return <article className={`control-result ${expanded ? "expanded" : ""}`} key={`${key}-${index}`}>
        <button type="button" className="control-result-summary" aria-expanded={expanded} onClick={() => togglePlan(key)}>
          <div className="control-result-top"><div><small>方案 {index + 1} · {plan.confidence}</small><strong>{number.format(Number(plan.result.display))}</strong><span className={plan.delta === 0 ? "exact" : "delta"}>{plan.delta > 0 ? "+" : ""}{number.format(plan.delta)} · {plan.riskLabel}执行难度</span></div><div className="control-counts"><b>P {number.format(plan.perfect)}</b><b>G {plan.good}</b><b>B {plan.bad}</b><b>M {number.format(plan.miss)}</b><b>C {number.format(plan.maxCombo)}</b></div></div>
          <div className="control-result-route"><span>断连 {plan.breakNote.index} {plan.breakNote.type.toUpperCase()}</span><span>停止 {plan.releaseNote.index}号后</span><i>{expanded ? "收起" : "展开解析"}</i></div>
        </button>
        {expanded && <div className="control-result-details"><div className="control-result-path"><span>断连：{plan.breakNote.index} {plan.breakNote.type.toUpperCase()} · {plan.breakNote.timeMs.toFixed(1)}ms</span><span>松手：{plan.releaseNote.index}号后</span><span>断连前继续命中：{plan.delayedPerfectCount}</span></div><p>{plan.explanation}</p>{plan.firstEventAfterMissCommit && <small className="control-result-note">预计第一个处于 Miss 提交之后的事件：{plan.firstEventAfterMissCommit.index} {plan.firstEventAfterMissCommit.type.toUpperCase()}（{plan.firstEventAfterMissCommit.timeMs.toFixed(1)}ms）。</small>}</div>}
      </article>;
    })}</section>
  </Root>;
}
