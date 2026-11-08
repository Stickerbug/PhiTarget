import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import type { ChartRecord } from "../data/types";
import { buildB30Model, type B30Model, type RksEntry } from "../core/rks";
import { rankForScore, type ScoreRank } from "../core/ranks";
import {
  buildRksHistogram,
  fetchB30AccAverages,
  fetchB30TagAnalysis,
  getB30AnalysisRecords,
  type B30AverageMap,
  type B30Histogram,
  type B30TagAnalysis,
} from "../core/b30Analysis";
import type { PhigrosCloudData, PhigrosCloudRecord } from "../core/phigrosCloud";
import CloudAccountPanel from "./CloudAccountPanel";
import type { CloudAccountsController } from "../hooks/useCloudAccounts";
import { SourceImage, artworkSources } from "./ArtworkImage";

const number = new Intl.NumberFormat("en-US");
const imageTimeoutMs = 3200;
const imageConcurrency = 18;
const resourceCdn = "https://cdn.jsdelivr.net/gh/7aGiven/Phigros_Resource";
const rawResource = "https://raw.githubusercontent.com/7aGiven/Phigros_Resource";
const artUrl = (songId: string, branch: "illustrationLowRes" | "illustrationBlur" | "illustration" = "illustrationLowRes") => `${resourceCdn}@${branch}/${encodeURIComponent(songId)}.png`;
const rawArtUrl = (songId: string, branch: "illustrationLowRes" | "illustrationBlur" | "illustration" = "illustrationLowRes") => `${rawResource}/${branch}/${encodeURIComponent(songId)}.png`;
const avatarUrl = (avatar: string) => `${resourceCdn}@avatar/${encodeURIComponent(avatar)}.png`;
const rawAvatarUrl = (avatar: string) => `${rawResource}/avatar/${encodeURIComponent(avatar)}.png`;
const localAvatarUrl = (avatar: string) => `/assets/avatars/${encodeURIComponent(avatar)}.png`;
const placeholderArt = "/assets/phi-plugin/otherimg/phigros.png";
const placeholderAvatar = "/assets/phi-plugin/otherimg/Introduction.png";
const dataIcon = "/assets/phi-plugin/otherimg/data.png";

const rankAssets: Record<ScoreRank, string> = {
  F: "/assets/ranks/F.png",
  C: "/assets/ranks/C.png",
  B: "/assets/ranks/B.png",
  A: "/assets/ranks/A.png",
  S: "/assets/ranks/S.png",
  V: "/assets/ranks/V.png",
  blueV: "/assets/ranks/V-blue.png?v=3",
  phi: "/assets/ranks/phi.png",
};
const challengeAssets = [
  "/assets/phi-plugin/otherimg/0.png",
  "/assets/phi-plugin/otherimg/1.png",
  "/assets/phi-plugin/otherimg/2.png",
  "/assets/phi-plugin/otherimg/3.png",
  "/assets/phi-plugin/otherimg/4.png",
  "/assets/phi-plugin/otherimg/5.png",
];
const difficultyNames: Record<string, string> = { ez: "EZ", hd: "HD", in: "IN", at: "AT" };

type Props = {
  charts: ChartRecord[];
  records: PhigrosCloudRecord[];
  profile: PhigrosCloudData["profile"] | null;
  fetchedAt: string | null;
  cloud: CloudAccountsController;
  onLoaded: (data: PhigrosCloudData) => void;
  onAccountChange: () => void;
  /** Render as a compact block inside the player page instead of a standalone page. */
  embedded?: boolean;
};

type Stat = { title: string; tot: number; cleared: number; fc: number; phi: number };
type AssetState = { arts: string[]; ranks: string[]; avatar: string; background: string };

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
const loadImage = (source: string) => {
  if (!source) return Promise.resolve<HTMLImageElement | null>(null);
  const cached = imageCache.get(source);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    if (/^https?:\/\//.test(source)) image.crossOrigin = "anonymous";
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    const timer = window.setTimeout(() => {
      image.src = "";
      finish(null);
    }, imageTimeoutMs);
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = source;
  });
  imageCache.set(source, pending);
  return pending;
};

const loadAnyImage = async (preferred: string[], fallback: string[] = []) => {
  const candidates = [...new Set([...preferred, ...fallback].filter(Boolean))];
  const attempts = candidates.map((source) => loadImage(source).then((image) => image ? image : Promise.reject(new Error("image unavailable"))));
  try { return await Promise.any(attempts); } catch { return null; }
};

const loadArtwork = (songId: string, difficulty?: string, blur = false) => {
  const suffix = difficulty ? `_${difficulty.toUpperCase()}` : "";
  const ids = [...new Set([songId, suffix ? `${songId}${suffix}` : ""])].filter(Boolean);
  const branch = blur ? "illustrationBlur" : "illustrationLowRes";
  const preferred = ids.flatMap((id) => [artUrl(id, branch), rawArtUrl(id, branch)]);
  const fallback = ids.flatMap((id) => [artUrl(id, "illustration"), rawArtUrl(id, "illustration")]);
  return loadAnyImage(preferred, fallback);
};

const normalizeAvatar = (avatar: string | null) => {
  if (!avatar) return "Introduction";
  if (/^https?:\/\//.test(avatar)) return avatar;
  if (avatar === "Cipher : /2&//<|0") return "Cipher1";
  if (avatar === "Oblivion: PHIN") return "OblivionPHIN";
  return avatar;
};

const loadAvatar = (avatar: string | null) => {
  const normalized = normalizeAvatar(avatar);
  const preferred = /^https?:\/\//.test(normalized)
    ? [normalized]
    : [localAvatarUrl(normalized), avatarUrl(normalized), rawAvatarUrl(normalized)];
  return loadAnyImage(preferred, [localAvatarUrl("Introduction"), placeholderAvatar, avatarUrl("Introduction"), rawAvatarUrl("Introduction")]);
};

async function mapConcurrent<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>) {
  const result = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return result;
}

const buildStats = (charts: ChartRecord[], records: PhigrosCloudRecord[]): Stat[] => {
  const byDifficulty = new Map<string, PhigrosCloudRecord[]>();
  records.forEach((record) => byDifficulty.set(record.difficulty, [...(byDifficulty.get(record.difficulty) ?? []), record]));
  return ["ez", "hd", "in", "at"].map((difficulty) => {
    const rows = byDifficulty.get(difficulty) ?? [];
    return {
      title: difficultyNames[difficulty],
      tot: charts.filter((chart) => chart.difficulty === difficulty).length,
      cleared: rows.filter((record) => record.score >= 700000).length,
      fc: rows.filter((record) => record.fc || record.score >= 1000000).length,
      phi: rows.filter((record) => record.score >= 1000000).length,
    };
  });
};

const formatDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
};

const visibleEntriesFor = (model: B30Model) => model.bestCount === 27
  ? [...model.selectedEntries, ...model.overflowEntries.slice(0, 6)]
  : model.selectedEntries;
const averageKey = (entry: RksEntry) => `${/\.\d+$/.test(entry.record.songId) ? entry.record.songId : `${entry.record.songId}.0`}:${entry.chart.difficulty}`;

function Radar({ analysis }: { analysis: B30TagAnalysis | null }) {
  if (!analysis?.radar.categories.length) return <div className="tag-radar-placeholder" />;
  return <svg className="tag-radar" viewBox="0 0 200 184" aria-label="分类标签能力雷达图">
    {analysis.radar.grids.map((grid, index) => <polygon key={`grid-${index}`} className="tag-radar-grid" points={grid} />)}
    {analysis.radar.axes.map((axis, index) => <line key={`axis-${index}`} className="tag-radar-axis" x1="100" y1="92" x2={axis.x} y2={axis.y} />)}
    <polygon className="tag-radar-shape" points={analysis.radar.points} />
    {analysis.radar.categories.map((category) => <g key={category.name}>
      <circle className="tag-radar-point" cx={category.pointX} cy={category.pointY} r="2.3" />
      <text className="tag-radar-label" x={category.labelX} y={category.labelY} textAnchor={category.anchor as "start" | "middle" | "end"}>
        <tspan x={category.labelX}>{category.name}</tspan>
        <tspan className="tag-radar-score" x={category.labelX} dy="15">{category.displayRks ?? category.rks.toFixed(2)}</tspan>
      </text>
    </g>)}
  </svg>;
}

function TagRanking({ title, tags, weak = false }: { title: string; tags: { name: string; rks: number }[]; weak?: boolean }) {
  return <div className={`tag-ranking-group ${weak ? "weak-tags" : "strong-tags"}`}>
    <div className="tag-column-title"><span /><p>{title}</p></div>
    {tags.slice(0, 3).map((tag, index) => <div className="tag-result-row" key={`${tag.name}-${index}`}>
      <p className="tag-rank">{index + 1}</p><p className="tag-name">{tag.name}</p><p className="tag-rks">{tag.rks.toFixed(2)}</p>
    </div>)}
  </div>;
}

function Histogram({ histogram, bestCount }: { histogram: B30Histogram; bestCount: number }) {
  return <>
    <div className="histogram-chart"><div className="histogram-y-label">等效单曲 RKS</div><div className="histogram-plot">
      <div className="histogram-scale">{histogram.ticks.map((tick) => <div className="histogram-grid-line" style={{ bottom: `${tick.position}%` }} key={tick.label}><p>{tick.label}</p></div>)}<div className="average-marker" style={{ bottom: `${histogram.averagePosition}%` }}><p>AVG {histogram.average.toFixed(4)}</p></div></div>
      <div className="histogram-bars">{histogram.slots.map((slot) => <div className="histogram-slot" key={slot.label}><div className="histogram-bar-area"><div className={`histogram-bar ${slot.kind === "phi" ? "phi-bar" : "best-bar"}`} style={{ height: `${slot.height}%` }} /></div><p className="histogram-slot-label">{slot.label}</p></div>)}</div>
    </div></div>
    <div className="histogram-legend"><p><span className="legend-dot phi-dot" />P1-P3</p><p><span className="legend-dot best-dot" />B1-B{bestCount}</p><p>{histogram.count} 个有效槽位</p></div>
  </>;
}

function FlowSeparator({ label }: { label: string }) {
  const lines = (side: "l" | "r") => <div className={`flow_line_box_${side}`}>{Array.from({ length: 6 }, (_, index) => <div className="flow_line" key={index} />)}</div>;
  return <div className="over_flow">{lines("l")}<p><i>{label}</i></p>{lines("r")}</div>;
}

function RankAverage({ average, accuracy }: { average: number; accuracy: number }) {
  const finished = average <= accuracy;
  return <div className={`accAvg ${finished ? "accFinished" : "accLower"} clip-box`}><div className="accAvgLine clip-box" /><svg viewBox="0 0 1024 1024" aria-hidden="true"><path d={finished
    ? "M892.064 261.888a31.936 31.936 0 0 0-45.216 1.472L421.664 717.248l-220.448-185.216a32 32 0 1 0-41.152 48.992l243.648 204.704a31.872 31.872 0 0 0 20.576 7.488 31.808 31.808 0 0 0 23.36-10.112L893.536 307.136a32 32 0 0 0-1.472-45.248z"
    : "M564.8 465.184l4.192 3.904 274.72 274.752a32 32 0 0 1 0 45.248l-22.624 22.624a32 32 0 0 1-45.248 0l-263.456-263.392-263.424 263.392a32 32 0 0 1-42.24 2.656l-3.008-2.656-22.624-22.624a32 32 0 0 1 0-45.248l274.784-274.752a80 80 0 0 1 108.96-3.904z m0-256l4.192 3.904 274.72 274.752a32 32 0 0 1 0 45.248l-22.624 22.624a32 32 0 0 1-45.248 0l-263.456-263.392-263.424 263.392a32 32 0 0 1-42.24 2.656l-3.008-2.656-22.624-22.624a32 32 0 0 1 0-45.248l274.784-274.752a80 80 0 0 1 108.96-3.904z"} /></svg><p>Avg: {average.toFixed(4)}%</p></div>;
}

function B30Card({ entry, index, selectedCount, art, average }: { entry: RksEntry; index: number; selectedCount: number; art: string; average?: number }) {
  const rank = rankForScore(entry.record.score, entry.record.fc);
  const difficulty = entry.chart.difficulty.toLowerCase();
  const difficultyName = difficultyNames[difficulty] ?? difficulty.toUpperCase();
  const isOverflow = index >= selectedCount;
  const label = isOverflow ? `#${index - selectedCount + 28}` : index < 3 ? `P${index + 1}` : `#${index - 2}`;
  const title = entry.chart.title;
  const remoteSources = art && art !== placeholderArt ? [art, ...artworkSources(entry.chart.songId, "illustrationLowRes")] : artworkSources(entry.chart.songId, "illustrationLowRes");
  const longTitle = title.length >= 25;
  return <article className={`song ${index < 3 ? "phi_song" : "b_song"}`}>
    <div className="ill-box"><div className="num clip-box"><p>{label}</p></div><div className="ill clip-box"><SourceImage sources={remoteSources} alt={title} crossOrigin="anonymous" /></div><div className={`rank-${difficulty.toUpperCase()} clip-box`}><div className="org"><p>{difficultyName}&ensp;{entry.chart.constant?.toFixed(1) ?? "—"}</p></div><div className="rel"><p>{entry.singleRks.toFixed(2)}</p></div></div></div>
    <div className={`info-${difficulty.toUpperCase()}`}><div className={`songname${longTitle ? " long-title" : ""}`}><p title={title}>{title}</p></div><div className="songinfo"><div className="Rating"><img src={rankAssets[rank]} alt={rank} /></div><div className="chengji"><div className="score"><p>{number.format(entry.record.score)}</p></div><div className="line" /><div className="acc-box"><div className="acc"><p>{entry.accuracy.toFixed(2)}%</p></div>{average !== undefined && <div className="suggest suggest-kind-2"><div className="suggest-tip" /><p>● {average.toFixed(2)}%</p></div>}</div></div></div></div>
    {average !== undefined && <RankAverage average={average} accuracy={entry.accuracy} />}
  </article>;
}

function Analysis({ model, tagAnalysis, histogram }: { model: B30Model; tagAnalysis: B30TagAnalysis | null; histogram: B30Histogram }) {
  const insufficient = !tagAnalysis || tagAnalysis.insufficient;
  return <><FlowSeparator label="B30 数据分析" /><div className="b30-analysis-row">
    <section className="analysis-panel tag-analysis-panel clip-box"><div className="analysis-panel-head"><div><p className="analysis-kicker">CHART PROFILE</p><p className="analysis-title">谱面实力分析</p></div><p className="analysis-meta">{tagAnalysis ? `RKS≥${(tagAnalysis.threshold ?? 0).toFixed(1)} · 成绩 ${tagAnalysis.recordCount} · 选票 ${tagAnalysis.totalVotes}` : "暂无数据"}</p></div><div className={`tag-analysis-body ${insufficient ? "is-insufficient" : ""}`}><div className="tag-analysis-content"><div className="tag-radar-column"><div className="tag-radar-title"><span /><p>分类汇总</p></div><Radar analysis={tagAnalysis} /></div><div className="tag-ranking-column"><TagRanking title="擅长词条" tags={tagAnalysis?.strong ?? []} /><TagRanking title="薄弱词条" tags={tagAnalysis?.weak ?? []} weak /></div></div>{insufficient && <div className="tag-insufficient-message"><p>维度标签体系参考自 @空游小站（kyou.net.cn）</p><p>{tagAnalysis ? "有效选票或逐标签成绩样本不足" : "未获取到谱面标签分析结果"}</p></div>}</div>{!insufficient && <div className="tag-analysis-tip"><p>维度标签体系参考自 @空游小站（kyou.net.cn）</p><p>谱面投票可前往 phib19.top 或使用 /settag 指令提交</p></div>}</section>
    <section className="analysis-panel histogram-panel clip-box"><div className="analysis-panel-head"><div><p className="analysis-kicker">RKS DISTRIBUTION</p><p className="analysis-title">等效 RKS 直方图</p></div><div className="histogram-summary"><p>平均 RKS</p><p>{histogram.average.toFixed(4)}</p></div></div><Histogram histogram={histogram} bestCount={model.bestCount} /></section>
  </div></>;
}

function Header({ profile, fetchedAt, charts, records, avatar }: { profile: Props["profile"]; fetchedAt: string | null; charts: ChartRecord[]; records: PhigrosCloudRecord[]; avatar: string }) {
  const stats = buildStats(charts, records);
  const challenge = profile?.challengeModeRank ?? null;
  const tier = challenge === null ? 0 : Math.max(0, Math.min(5, Math.floor(challenge / 100)));
  const versionLabel = profile?.gameVersion || "";
  const versionText = profile?.gameVersionCode != null && versionLabel && String(profile.gameVersionCode) !== versionLabel
    ? `${profile.gameVersionCode} later than ${versionLabel}`
    : versionLabel;
  return <div className="title"><div className="playerInfo"><div className="blackBlock clip-box" /><div className="avatar clip-box"><SourceImage sources={[avatar || localAvatarUrl("Introduction"), localAvatarUrl("Introduction"), placeholderAvatar]} alt="avatar" crossOrigin="anonymous" /></div><div className="playerId"><p>{profile?.playerName || profile?.playerId || "PLAYER"}</p></div><div className="rks clip-box"><p>{profile?.rks == null ? "—" : profile.rks.toFixed(4)}</p></div><div className="clgBox"><div className="Challenge"><img src={challengeAssets[tier]} alt="Challenge" /><p>{challenge === null ? "—" : challenge % 100}</p></div></div><div className="date"><p>{formatDate(profile?.updatedAt || fetchedAt)}</p></div><div className="dataBox clip-box"><img src={dataIcon} alt="data" /><p>{profile?.data || ""}</p></div>{versionText && <div className="spInfoBox"><div className="spInfo colorful-background clip-box"><p>{versionText}</p></div></div>}</div><div className="recordInfo clip-box"><div className="whiteLine clip-box" /><div className="sheet">{["\\", "C", "FC", "Phi"].map((label, row) => <div className="row" key={label}><div className="poz"><p>{label}</p></div>{stats.map((stat) => <div className="poz" key={stat.title}><p>{row === 0 ? stat.title : row === 1 ? stat.cleared : row === 2 ? stat.fc : stat.phi}</p></div>)}</div>)}</div></div></div>;
}

type B30Action = "cache" | "preview" | "download";

export default function B30Generator({ charts, records, profile, fetchedAt, cloud, onLoaded, onAccountChange, embedded = false }: Props) {
  const artRef = useRef<HTMLDivElement | null>(null);
  const renderVersion = useRef(0);
  const pendingAction = useRef<B30Action | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [bestCountText, setBestCountText] = useState("27");
  const bestCount = Math.max(1, Math.min(500, Math.trunc(Number(bestCountText) || 27)));
  const selectedModel = useMemo(() => buildB30Model(charts, records, bestCount), [bestCount, charts, records]);
  const visibleEntries = useMemo(() => visibleEntriesFor(selectedModel), [selectedModel]);
  const histogram = useMemo(() => buildRksHistogram(getB30AnalysisRecords(selectedModel)), [selectedModel]);
  const [renderRequested, setRenderRequested] = useState(false);
  const [renderRequestId, setRenderRequestId] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [progress, setProgress] = useState(0);
  const [renderStartedAt, setRenderStartedAt] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [zoom, setZoom] = useState(0.72);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [tagAnalysis, setTagAnalysis] = useState<B30TagAnalysis | null>(null);
  const [averages, setAverages] = useState<B30AverageMap>(() => new Map());
  const [assets, setAssets] = useState<AssetState>({ arts: [], ranks: [], avatar: placeholderAvatar, background: placeholderArt });

  const clearPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewOpen(false);
  };

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  useEffect(() => {
    clearPreview();
    pendingAction.current = null;
    setRenderRequested(false);
    setStatus("idle");
    setProgress(0);
  }, [bestCount, records]);

  useEffect(() => {
    if (!renderRequested || !records.length) {
      setTagAnalysis(null);
      setAverages(new Map());
      return;
    }
    const controller = new AbortController();
    setTagAnalysis(null);
    setAverages(new Map());
    void Promise.all([fetchB30TagAnalysis(records, controller.signal), fetchB30AccAverages(records, controller.signal)]).then(([tags, average]) => {
      if (!controller.signal.aborted) {
        setTagAnalysis(tags);
        setAverages(average);
      }
    });
    return () => controller.abort();
  }, [records, renderRequested]);

  useEffect(() => {
    if (!renderRequested || !visibleEntries.length) {
      setStatus("idle");
      setAssets({ arts: [], ranks: [], avatar: placeholderAvatar, background: placeholderArt });
      return;
    }
    let cancelled = false;
    const version = ++renderVersion.current;
    const total = visibleEntries.length * 2 + 2;
    let done = 0;
    let lastReport = -1;
    const report = () => {
      done += 1;
      const value = Math.min(88, Math.round(done / total * 88));
      if (!cancelled && (value !== lastReport || done === total)) {
        lastReport = value;
        setProgress(value);
      }
    };
    setStatus("loading");
    setProgress(0);
    void Promise.all([
      mapConcurrent(visibleEntries, imageConcurrency, async (entry) => { const image = await loadArtwork(entry.chart.songId, entry.chart.difficulty); report(); return image?.src ?? placeholderArt; }),
      mapConcurrent(visibleEntries, imageConcurrency, async (entry) => { const source = rankAssets[rankForScore(entry.record.score, entry.record.fc)]; const image = await loadImage(source); report(); return image?.src ?? source; }),
      loadArtwork(visibleEntries[0].chart.songId, visibleEntries[0].chart.difficulty, true).then((image) => { report(); return image?.src ?? placeholderArt; }),
      loadAvatar(profile?.avatar ?? null).then((image) => { report(); return image?.src ?? placeholderAvatar; }),
    ]).then(async ([arts, ranks, background, avatar]) => {
      if (cancelled || renderVersion.current !== version) return;
      if (document.fonts?.load) {
        await Promise.allSettled([
          document.fonts.load('16px "PhiHybrid"'),
          document.fonts.load('16px "PhiHybridCondensed"'),
          document.fonts.load('16px "SairaExtraCondensed"'),
          document.fonts.load('16px "PHI"'),
          document.fonts.load('16px "Aldrich"'),
        ]);
      }
      if (!cancelled && renderVersion.current === version) {
        const vividBackground = background !== placeholderArt
          ? background
          : arts.find((source) => source !== placeholderArt) ?? placeholderArt;
        setAssets({ arts, ranks, background: vividBackground, avatar });
        setProgress(92);
        setStatus("ready");
      }
    });
    return () => { cancelled = true; };
  }, [profile?.avatar, renderRequested, visibleEntries]);

  // PhiPlugin's pvis pass shrinks each title against its real card width. Do
  // the same after the game font and artwork have settled so exports keep
  // long names readable without ellipses.
  useLayoutEffect(() => {
    if (status !== "ready" || !artRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      artRef.current?.querySelectorAll<HTMLElement>(".songname p").forEach((element) => {
        const parent = element.parentElement;
        if (!parent) return;
        let size = element.parentElement?.classList.contains("long-title") ? 14 : 15;
        element.style.whiteSpace = "nowrap";
        element.style.display = "block";
        element.style.overflow = "visible";
        element.style.textOverflow = "clip";
        element.style.fontSize = `${size}px`;
        while (size > 8 && element.scrollWidth > parent.clientWidth + 1) {
          size -= 0.25;
          element.style.fontSize = `${size}px`;
        }
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [assets, status, visibleEntries]);

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `phitarget-b${bestCount}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const renderToBlob = async (): Promise<Blob | null> => {
    if (!artRef.current || status !== "ready" || exporting) return null;
    setExporting(true);
    setProgress((value) => Math.max(value, 94));
    const exportProgressTimer = window.setInterval(() => {
      setProgress((value) => value >= 99 ? value : value + 1);
    }, 650);
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const blob = await toBlob(artRef.current, {
        width: 1200,
        pixelRatio: 1,
        cacheBust: false,
        backgroundColor: "transparent",
        imagePlaceholder: placeholderArt,
        // Fonts are already loaded in the page. Skipping the library's
        // repeated font-file embedding removes a large network/serialization
        // cost for B30/B500 renders while preserving the browser's face.
        skipFonts: true,
        skipAutoScale: true,
        preferredFontFormat: "truetype",
      });
      setProgress(100);
      if (!blob) return null;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewBlob(blob);
      return blob;
    } catch (error) {
      console.error("B30 image export failed", error);
      return null;
    } finally {
      window.clearInterval(exportProgressTimer);
      setExporting(false);
    }
  };

  useEffect(() => {
    if (status !== "ready" || !pendingAction.current) return;
    const action = pendingAction.current;
    pendingAction.current = null;
    const frame = window.requestAnimationFrame(() => {
      void renderToBlob().then((blob) => {
        if (!blob) return;
        if (action === "preview") setPreviewOpen(true);
        if (action === "download") downloadBlob(blob);
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renderRequestId, status]);

  const requestGeneration = (action: B30Action) => {
    if (!records.length || exporting) return;
    if (action === "preview" && previewUrl) {
      setPreviewOpen(true);
      return;
    }
    if (action === "download" && previewBlob) {
      downloadBlob(previewBlob);
      return;
    }
    pendingAction.current = action;
    setRenderStartedAt(Date.now());
    setRenderRequested(true);
    setRenderRequestId((value) => value + 1);
  };

  const estimateSeconds = renderStartedAt && progress > 0 && progress < 100
    ? Math.max(0, Math.ceil((Date.now() - renderStartedAt) / progress * (100 - progress) / 1000))
    : null;
  const progressLabel = status === "loading"
    ? `正在准备图片… ${progress}%${estimateSeconds === null ? "" : ` · 预计还需 ${estimateSeconds}s`}`
    : exporting
      ? `正在导出… ${progress}%`
      : previewUrl
        ? `已生成 B${bestCount} 图片`
        : "尚未生成图片";
  const backgroundSources = [assets.background || placeholderArt, ...(visibleEntries[9] ? artworkSources(visibleEntries[9].chart.songId, "illustrationBlur") : [])];
  const source = renderRequested ? <div className="b30-render-source"><div ref={artRef} className="b30-art" aria-label={`PhiTarget B${bestCount} 成绩图片`}><div className="background"><SourceImage sources={backgroundSources} alt="" crossOrigin="anonymous" /></div><div className="b30-content"><Header profile={profile} fetchedAt={fetchedAt} charts={charts} records={records} avatar={assets.avatar} /><div className="b19">{visibleEntries.slice(0, selectedModel.selectedEntries.length).map((entry, index) => <B30Card key={`${entry.record.id}-${index}`} entry={entry} index={index} selectedCount={selectedModel.selectedEntries.length} art={assets.arts[index] ?? placeholderArt} average={averages.get(averageKey(entry))} />)}{visibleEntries.length > selectedModel.selectedEntries.length && <FlowSeparator label="OVER FLOW" />}{visibleEntries.slice(selectedModel.selectedEntries.length).map((entry, offset) => <B30Card key={`${entry.record.id}-overflow-${offset}`} entry={entry} index={selectedModel.selectedEntries.length + offset} selectedCount={selectedModel.selectedEntries.length} art={assets.arts[selectedModel.selectedEntries.length + offset] ?? placeholderArt} average={averages.get(averageKey(entry))} />)}</div><Analysis model={selectedModel} tagAnalysis={tagAnalysis} histogram={histogram} /><div className="createdbox"><div className="phi-plugin"><p>Phi-Plugin</p></div><div className="ver"><p>v1.0.3</p></div></div><div className="copyright"><p>*Phi-Plugin不是Phigros官方项目，与南京鸽游网络有限公司及Phigros官方不存在授权、合作或运营关系。</p></div></div></div></div> : null;
  const body = <section className={`b30-generator ${embedded ? "b30-generator-embedded" : ""}`}>
    {!embedded && <><header className="feature-heading"><div><small>B30 / BEST SCORE IMAGE</small><h1>在线生成 B30 图片</h1><p>玩家数据和图片生成共用当前账号；图片只在点击生成时渲染，默认不会展开大图。</p></div><span className="feature-mark">B</span></header><section className="b30-connect"><div><strong>{records.length ? "更新 B30 数据" : "输入 sessionToken 生成 B30"}</strong><small>可在当前浏览器保存多个账号，并在玩家数据页快速切换。</small></div><CloudAccountPanel charts={charts} cloud={cloud} onLoaded={onLoaded} onAccountChange={onAccountChange} compact /></section></>}
    <section className="b30-summary"><div><strong>{selectedModel.selectedEntries.length}</strong><small>已纳入成绩</small></div><div><strong>{selectedModel.b30Rks === null ? "—" : selectedModel.b30Rks.toFixed(4)}</strong><small>φ3 + B{bestCount} RKS</small></div><div><strong>{profile?.rks == null ? "—" : profile.rks.toFixed(4)}</strong><small>云档 RKS</small></div><div><strong>{selectedModel.overflowEntries.length}</strong><small>可继续纳入</small></div></section>
    <section className="b30-toolbar b30-generator-toolbar"><div><strong>{records.length ? (selectedModel.complete ? `B${bestCount} 数据完整` : `当前只有 ${selectedModel.selectedEntries.length}/${bestCount + 3} 张可计算成绩`) : "连接账号后生成 B30"}</strong><small>{selectedModel.missingAccuracy ? `${selectedModel.missingAccuracy} 张成绩缺少 ACC，未计入 RKS。` : `φ3 + B${bestCount} · 最多支持 B500`}{renderRequested ? ` · ${progressLabel}` : ""}</small></div><div className="b30-toolbar-actions"><label className="b30-count-control">B 数量<input type="number" min="1" max="500" value={bestCountText} onChange={(event) => setBestCountText(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))} onBlur={() => setBestCountText(String(bestCount))} /></label><button type="button" className="primary-action" disabled={!records.length || exporting || status === "loading"} onClick={() => requestGeneration("cache")}>{status === "loading" ? `渲染中 ${progress}%` : previewUrl ? "重新生成 B 图片" : `生成 B${bestCount}`}</button>{previewUrl && <button type="button" className="secondary-action" onClick={() => requestGeneration("preview")}>预览</button>}<button type="button" className="secondary-action" disabled={!records.length || exporting || status === "loading"} onClick={() => requestGeneration("download")}>{exporting ? "导出中…" : "下载 PNG"}</button></div></section>
    {records.length === 0 && <section className="b30-empty"><strong>还没有可用的云档成绩</strong><p>先在上方或玩家数据页同步 TapTap 云档。同步后的最新成绩会保存在当前浏览器，并显示上次更新时间。</p></section>}
    {renderRequested && <p className="b30-progress-line"><span className="b30-progress-track"><i style={{ width: `${progress}%` }} /></span><strong>{progress}%</strong><span>{progressLabel}</span></p>}
    {source}
    <p className="b30-note">图片默认只保留在浏览器内存中，点击下载即可保存；B 数量越大，曲绘准备和本地 DOM 渲染所需时间越长。B500 会按完整成绩列表生成，不会在页面初始加载时预渲染。</p>
    {previewOpen && previewUrl && <div className="b30-preview-backdrop" role="dialog" aria-modal="true" aria-label={`B${bestCount} 图片预览`} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false); }}><div className="b30-preview-dialog"><header><strong>PhiTarget · B{bestCount}</strong><div><button type="button" onClick={() => setZoom((value) => Math.max(0.25, Number((value - 0.1).toFixed(2))))}>−</button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(2, Number((value + 0.1).toFixed(2))))}>＋</button><button type="button" onClick={() => setZoom(0.72)}>重置</button><button type="button" onClick={() => previewBlob && downloadBlob(previewBlob)}>下载</button><button type="button" onClick={() => setPreviewOpen(false)}>关闭</button></div></header><div className="b30-preview-viewport"><img src={previewUrl} alt={`B${bestCount} 成绩图片`} style={{ width: `${zoom * 100}%` }} /></div></div></div>}
  </section>;
  return embedded ? body : <main className="feature-page b30-page">{body}</main>;
}
