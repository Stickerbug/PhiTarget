import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartRecord } from "../data/types";
import { buildB30Model, type B30Model, type RksEntry } from "../core/rks";
import { rankForScore, rankLabel, type ScoreRank } from "../core/ranks";
import { fetchPhigrosCloudSave, type PhigrosCloudData, type PhigrosCloudRecord } from "../core/phigrosCloud";

const number = new Intl.NumberFormat("en-US");
const resourceCdn = "https://cdn.jsdelivr.net/gh/7aGiven/Phigros_Resource";
const artUrl = (songId: string) => `${resourceCdn}@illustrationLowRes/${encodeURIComponent(songId)}.png`;
const rankAssets: Record<ScoreRank, string> = {
  F: "/assets/ranks/F.png",
  C: "/assets/ranks/C.png",
  B: "/assets/ranks/B.png",
  A: "/assets/ranks/A.png",
  S: "/assets/ranks/S.png",
  V: "/assets/ranks/V.png",
  blueV: "/assets/ranks/V-blue.png?v=2",
  phi: "/assets/ranks/phi.png",
};

type Props = {
  charts: ChartRecord[];
  records: PhigrosCloudRecord[];
  profile: PhigrosCloudData["profile"] | null;
  fetchedAt: string | null;
  onLoaded: (data: PhigrosCloudData) => void;
};

const canvasWidth = 1600;
const canvasHeight = 1180;
const cardWidth = 296;
const cardHeight = 142;
const cardGap = 12;

const fitText = (context: CanvasRenderingContext2D, value: string, maxWidth: number) => {
  if (context.measureText(value).width <= maxWidth) return value;
  let result = value;
  while (result.length > 2 && context.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result}…`;
};

const loadImage = (source: string) => new Promise<HTMLImageElement | null>((resolve) => {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = source;
});

const paintCard = (context: CanvasRenderingContext2D, entry: RksEntry, index: number, art: HTMLImageElement | null, rankArt: HTMLImageElement | null) => {
  const column = index % 5;
  const row = Math.floor(index / 5);
  const x = 36 + column * (cardWidth + cardGap);
  const y = 224 + row * (cardHeight + cardGap);
  const rank = rankForScore(entry.record.score, entry.record.fc);
  context.save();
  context.fillStyle = rank === "phi" ? "#27231a" : rank === "blueV" ? "#172a3a" : "#182027";
  context.fillRect(x, y, cardWidth, cardHeight);
  context.fillStyle = rank === "phi" ? "#d6aa4d" : rank === "blueV" ? "#3b9bd1" : "#52636e";
  context.fillRect(x, y, 5, cardHeight);
  context.save();
  context.beginPath();
  context.rect(x + 12, y + 12, 105, 72);
  context.clip();
  if (art) {
    const scale = Math.max(105 / art.width, 72 / art.height);
    const width = art.width * scale;
    const height = art.height * scale;
    context.drawImage(art, x + 12 + (105 - width) / 2, y + 12 + (72 - height) / 2, width, height);
  } else {
    context.fillStyle = "#0e1419";
    context.fillRect(x + 12, y + 12, 105, 72);
    context.fillStyle = "#65727a";
    context.font = "14px PhiHybrid, sans-serif";
    context.fillText("NO ART", x + 29, y + 53);
  }
  context.restore();
  context.fillStyle = "#f4f4f1";
  context.font = "600 18px PhiHybrid, sans-serif";
  context.fillText(fitText(context, entry.chart.title, 154), x + 132, y + 31);
  context.fillStyle = "#9eabb1";
  context.font = "13px PhiHybrid, sans-serif";
  context.fillText(`${entry.chart.difficulty.toUpperCase()} ${entry.chart.constant?.toFixed(1) ?? "—"}`, x + 132, y + 55);
  context.fillText(`${number.format(entry.record.score)} · ${entry.accuracy.toFixed(2)}%`, x + 132, y + 76);
  if (rankArt) context.drawImage(rankArt, x + 232, y + 91, 39, 40);
  context.fillStyle = rank === "phi" ? "#f0c965" : rank === "blueV" ? "#83c9f0" : "#d7dddf";
  context.font = "700 20px PhiHybrid, sans-serif";
  context.fillText(`#${index + 1}`, x + 13, y + 119);
  context.font = "600 18px PhiHybrid, sans-serif";
  context.fillText(`${entry.singleRks.toFixed(4)} RKS`, x + 70, y + 119);
  context.fillStyle = "#aab5b9";
  context.font = "11px PhiHybrid, sans-serif";
  context.fillText(rankLabel[rank], x + 13, y + 136);
  context.restore();
};

async function paintB30(canvas: HTMLCanvasElement, model: B30Model, profile: Props["profile"], fetchedAt: string | null, cancelled: () => boolean) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const arts = await Promise.all(model.selectedEntries.map((entry) => loadImage(artUrl(entry.chart.songId))));
  const rankArts = await Promise.all(model.selectedEntries.map((entry) => loadImage(rankAssets[rankForScore(entry.record.score, entry.record.fc)])));
  if (cancelled()) return;
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  const background = context.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  background.addColorStop(0, "#080d13");
  background.addColorStop(.52, "#12232d");
  background.addColorStop(1, "#11151a");
  context.fillStyle = background;
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = "rgba(68, 175, 211, .10)";
  context.beginPath();
  context.arc(1330, 80, 350, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f2f4f1";
  context.font = "700 37px PhiHybrid, sans-serif";
  context.fillText("PhiTarget", 38, 58);
  context.fillStyle = "#8fa0a8";
  context.font = "15px PhiHybrid, sans-serif";
  context.fillText("B30 / PERSONAL SCORE PROFILE", 40, 86);
  context.fillStyle = "#e7eceb";
  context.font = "600 25px PhiHybrid, sans-serif";
  context.fillText(profile?.playerName || profile?.playerId || "PLAYER", 40, 139);
  context.fillStyle = "#8fa0a8";
  context.font = "14px PhiHybrid, sans-serif";
  context.fillText(`${model.selectedEntries.length}/30 records · ${fetchedAt ? new Date(fetchedAt).toLocaleString() : "current session"}`, 40, 167);
  context.fillStyle = "#d9e0df";
  context.font = "700 32px PhiHybrid, sans-serif";
  context.fillText(model.b30Rks === null ? "B30 —" : `B30 ${model.b30Rks.toFixed(4)}`, 1190, 61);
  context.fillStyle = "#9fb0b7";
  context.font = "14px PhiHybrid, sans-serif";
  context.fillText(profile?.rks === null || profile?.rks === undefined ? "云档 RKS —" : `云档 RKS ${profile.rks.toFixed(4)}`, 1190, 87);
  context.fillText("Φ3 + B27", 1190, 111);
  context.fillText(model.complete ? "数据完整" : "数据未满 30 张", 1190, 135);
  context.strokeStyle = "rgba(255,255,255,.2)";
  context.beginPath();
  context.moveTo(36, 190);
  context.lineTo(1564, 190);
  context.stroke();
  model.selectedEntries.forEach((entry, index) => paintCard(context, entry, index, arts[index], rankArts[index]));
  context.fillStyle = "#718087";
  context.font = "11px PhiHybrid, sans-serif";
  context.fillText("单曲 RKS 按公开社区公式计算；B30 结果以当前曲库与云档字段为准。", 38, 1161);
}

export default function B30Generator({ charts, records, profile, fetchedAt, onLoaded }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderVersion = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const model = useMemo(() => buildB30Model(charts, records), [charts, records]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [token, setToken] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (!model.selectedEntries.length || !canvasRef.current) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    const version = ++renderVersion.current;
    setStatus("loading");
    void paintB30(canvasRef.current, model, profile, fetchedAt, () => cancelled || renderVersion.current !== version).then(() => {
      if (!cancelled) setStatus("ready");
    });
    return () => { cancelled = true; };
  }, [fetchedAt, model, profile]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || status !== "ready") return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "phitarget-b30.png";
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const connect = async () => {
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setConnecting(true);
    setMessage("");
    try {
      const data = await fetchPhigrosCloudSave(token, isGlobal, charts, nextController.signal);
      onLoaded(data);
      setMessage(`已读取 ${data.records.length} 条成绩；token 仅在本页内存中使用。`);
      setToken("");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "获取 TapTap 云存档失败");
    } finally {
      if (controller.current === nextController) {
        controller.current = null;
        setConnecting(false);
      }
    }
  };

  return <main className="feature-page b30-page">
    <header className="feature-heading"><div><small>B30 / BEST 30 IMAGE</small><h1>在线生成 B30 图片</h1><p>使用当前页面内存中的 TapTap 云档，直接在浏览器绘制成绩图并下载 PNG。</p></div><span className="feature-mark">30</span></header>
    <section className="b30-connect"><div><strong>{records.length ? "更新 B30 数据" : "输入 sessionToken 生成 B30"}</strong><small>请求直接发送到 PhiHub API；token 不会写入 PhiTarget 存储。</small></div><div className="b30-connect-grid"><label>sessionToken<input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} placeholder="25 位字母数字字符串" /></label><label>服务器<select value={isGlobal ? "global" : "cn"} onChange={(event) => setIsGlobal(event.target.value === "global")}><option value="cn">国服</option><option value="global">国际服</option></select></label><button type="button" className="primary-action" disabled={connecting || !token.trim()} onClick={() => void connect()}>{connecting ? "读取中…" : "读取云档"}</button></div>{message && <p>{message}</p>}</section>
    {!records.length ? <section className="b30-empty"><strong>还没有可用的云档成绩</strong><p>输入 sessionToken 后，PhiTarget 会在当前浏览器内计算单曲 RKS、φ3 + B27，并生成可下载的 B30 图片。</p></section> : <>
      <section className="b30-summary"><div><strong>{model.selectedEntries.length}</strong><small>已纳入成绩</small></div><div><strong>{model.b30Rks === null ? "—" : model.b30Rks.toFixed(4)}</strong><small>B30 RKS</small></div><div><strong>{profile?.rks === null || profile?.rks === undefined ? "—" : profile.rks.toFixed(4)}</strong><small>云档 RKS</small></div><div><strong>{model.overflowEntries.length}</strong><small>Overflow</small></div></section>
      <section className="b30-toolbar"><div><strong>{model.complete ? "B30 数据完整" : `当前只有 ${model.selectedEntries.length}/30 张可计算成绩`}</strong><small>{model.missingAccuracy ? `${model.missingAccuracy} 张成绩缺少 ACC，未计入 RKS。` : "φ3 + B27 · 当前曲库版本"}</small></div><button type="button" className="primary-action" disabled={status !== "ready"} onClick={download}>{status === "loading" ? "图片生成中…" : "下载 PNG"}</button></section>
      <section className="b30-canvas-wrap"><canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} aria-label="PhiTarget B30 成绩图片" /></section>
      <p className="b30-note">RKS 使用公开社区常用公式：ACC ≥ 100% 取定数，ACC &lt; 70% 为 0，其余为定数 × ((ACC − 55) / 45)²。B30 图片是 PhiTarget 自有布局，未复制 PhiPlugin 模板。</p>
    </>}
  </main>;
}

