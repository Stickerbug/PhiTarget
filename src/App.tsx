import { useMemo, useState } from "react";
import { solveFcTarget } from "./core/solver";

const format = (value: bigint | number) => typeof value === "bigint" ? value.toString() : value.toLocaleString("en-US");

export default function App() {
  const [notes, setNotes] = useState(1000);
  const [target, setTarget] = useState(950000);
  const [match, setMatch] = useState<"exact" | "atLeast" | "nearest">("nearest");
  const state = useMemo(() => {
    try { return { solutions: solveFcTarget(notes, target, match), error: "" }; }
    catch (error) { return { solutions: [], error: error instanceof Error ? error.message : "Invalid input" }; }
  }, [notes, target, match]);

  return <main className="shell">
    <header className="hero"><div><span className="eyebrow">PHIGROS GOAL SCORE PLANNER</span><h1>PhiTarget</h1><p>目标分数反推、可达性分析与课题路线规划</p></div><span className="version">Phase 1 · formula candidate-1</span></header>
    <section className="notice"><strong>当前是可运行基线</strong><span>曲库尚未接入；公式取整仍需用真实结算截图校准，结果标记为“公式可达 / approximate”。</span></section>
    <section className="grid">
      <article className="card controls"><div className="card-head"><div><span className="eyebrow">TARGET SCORE</span><h2>普通模式 FC 反推</h2></div><span className="tag">可解释</span></div>
        <label>物量 N<input type="number" min="1" value={notes} onChange={(event) => setNotes(Number(event.target.value))} /></label>
        <label>目标分数<input type="number" min="0" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label>
        <label>求解方式<select value={match} onChange={(event) => setMatch(event.target.value as typeof match)}><option value="nearest">最接近目标</option><option value="exact">精确命中</option><option value="atLeast">至少达到</option></select></label>
        <p className="formula">FC：Score = 1,000,000 − 315,000 × Good / N</p>
      </article>
      <article className="card results"><div className="card-head"><div><span className="eyebrow">SOLVER OUTPUT</span><h2>判定组合</h2></div><span className="tag muted">公式可达</span></div>
        {state.error && <p className="error">{state.error}</p>}
        {!state.error && state.solutions.map((solution) => <div className="result-row" key={`${solution.good}-${solution.result.display}`}><div><strong>{format(solution.result.display)}</strong><small>P {solution.perfect} · G {solution.good} · B 0 · M 0 · C {solution.maxCombo}</small></div><span className={solution.delta === 0 ? "delta exact" : "delta"}>{solution.delta > 0 ? "+" : ""}{format(solution.delta)}</span></div>)}
      </article>
    </section>
    <footer><span>数据默认本地运行 · 不需要账号</span><span>曲库版本：unavailable</span></footer>
  </main>;
}
