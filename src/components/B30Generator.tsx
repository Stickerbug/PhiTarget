import { useEffect, useMemo, useRef, useState } from "react";
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

const number = new Intl.NumberFormat("en-US");
const canvasWidth = 1200;
const cardStartY = 180;
const cardWidth = 360;
const cardHeight = 100;
const rowHeight = 122;
const imageTimeoutMs = 2500;
const imageConcurrency = 16;
const resourceCdn = "https://cdn.jsdelivr.net/gh/7aGiven/Phigros_Resource";
const rawResource = "https://raw.githubusercontent.com/7aGiven/Phigros_Resource";
const artUrl = (songId: string, branch: "illustrationLowRes" | "illustrationBlur" | "illustration" = "illustrationLowRes") => `${resourceCdn}@${branch}/${encodeURIComponent(songId)}.png`;
const rawArtUrl = (songId: string, branch: "illustrationLowRes" | "illustrationBlur" | "illustration" = "illustrationLowRes") => `${rawResource}/${branch}/${encodeURIComponent(songId)}.png`;
const avatarUrl = (avatar: string) => `${resourceCdn}@avatar/${encodeURIComponent(avatar)}.png`;
const rawAvatarUrl = (avatar: string) => `${rawResource}/avatar/${encodeURIComponent(avatar)}.png`;

const rankAssets: Record<ScoreRank, string> = {
  F: "/assets/ranks/F.png",
  C: "/assets/ranks/C.png",
  B: "/assets/ranks/B.png",
  A: "/assets/ranks/A.png",
  S: "/assets/ranks/S.png",
  V: "/assets/ranks/V.png",
  blueV: "/assets/ranks/V-blue.png",
  phi: "/assets/ranks/phi.png",
};
const challengeAssets = ["/assets/phi-plugin/otherimg/0.png", "/assets/phi-plugin/otherimg/1.png", "/assets/phi-plugin/otherimg/2.png", "/assets/phi-plugin/otherimg/3.png", "/assets/phi-plugin/otherimg/4.png", "/assets/phi-plugin/otherimg/5.png"];
const difficultyNames: Record<string, string> = { ez: "EZ", hd: "HD", in: "IN", at: "AT" };
const difficultyColors: Record<string, { badge: string; panel: string; border: string }> = {
  ez: { badge: "#92d050", panel: "rgba(0,183,240,.30)", border: "#00b7f0" },
  hd: { badge: "#00b0f0", panel: "rgba(0,183,240,.30)", border: "#00b7f0" },
  in: { badge: "#ff0000", panel: "rgba(0,183,240,.30)", border: "#00b7f0" },
  at: { badge: "#6e6e6e", panel: "rgba(240,0,0,.30)", border: "#ff0000" },
};

type Props = {
  charts: ChartRecord[];
  records: PhigrosCloudRecord[];
  profile: PhigrosCloudData["profile"] | null;
  fetchedAt: string | null;
  cloud: CloudAccountsController;
  onLoaded: (data: PhigrosCloudData) => void;
  onAccountChange: () => void;
};

type Stat = { title: string; tot: number; cleared: number; fc: number; phi: number };

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
  const candidates = [...new Set(preferred.filter(Boolean))];
  const attempts = candidates.map((source) => loadImage(source).then((image) => image ?? Promise.reject(new Error("image unavailable"))));
  try {
    return await Promise.any(attempts);
  } catch {
    if (!fallback.length) return null;
    const fallbackAttempts = fallback.map((source) => loadImage(source).then((image) => image ?? Promise.reject(new Error("image unavailable"))));
    try { return await Promise.any(fallbackAttempts); } catch { return null; }
  }
};

const loadArtwork = (songId: string, difficulty?: string, blur = false) => {
  const suffix = difficulty ? `_${difficulty.toUpperCase()}` : "";
  const ids = [...new Set([songId, suffix ? `${songId}${suffix}` : ""])].filter(Boolean);
  const preferred = ids.flatMap((id) => blur ? [artUrl(id, "illustrationBlur"), rawArtUrl(id, "illustrationBlur")] : [artUrl(id), rawArtUrl(id)]);
  const fallback = ids.flatMap((id) => blur ? [artUrl(id, "illustrationLowRes"), rawArtUrl(id, "illustrationLowRes")] : [artUrl(id, "illustration"), rawArtUrl(id, "illustration")]);
  return loadAnyImage(preferred, fallback);
};

const loadAvatar = (avatar: string | null) => !avatar
  ? Promise.resolve<HTMLImageElement | null>(null)
  : /^https?:\/\//.test(avatar) ? loadAnyImage([avatar]) : loadAnyImage([avatarUrl(avatar), rawAvatarUrl(avatar)], [avatarUrl("Introduction"), rawAvatarUrl("Introduction")]);

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

const cardPosition = (index: number, selectedCount: number) => {
  const selectedRows = Math.ceil(selectedCount / 3);
  if (index < selectedCount) return { x: 35 + index % 3 * 390, y: cardStartY + Math.floor(index / 3) * rowHeight };
  const overflowIndex = index - selectedCount;
  return { x: 35 + overflowIndex % 3 * 390, y: cardStartY + selectedRows * rowHeight + 36 + Math.floor(overflowIndex / 3) * rowHeight };
};

const clipPath = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, slope = 0.3) => {
  const offset = height * slope;
  context.beginPath();
  context.moveTo(x + offset, y);
  context.lineTo(x + width, y);
  context.lineTo(x + width - offset, y + height);
  context.lineTo(x, y + height);
  context.closePath();
};

const fillClip = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fill: string, slope = 0.3) => {
  context.save();
  clipPath(context, x, y, width, height, slope);
  context.fillStyle = fill;
  context.fill();
  context.restore();
};

const drawImageCover = (context: CanvasRenderingContext2D, image: HTMLImageElement | null, x: number, y: number, width: number, height: number, slope = 0, filter = "none") => {
  context.save();
  if (slope) {
    clipPath(context, x, y, width, height, slope);
    context.clip();
  } else {
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
  }
  context.filter = filter;
  if (image) {
    const scale = Math.max(width / image.width, height / image.height);
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    context.drawImage(image, x + (width - imageWidth) / 2, y + (height - imageHeight) / 2, imageWidth, imageHeight);
  } else {
    context.fillStyle = "#182126";
    context.fillRect(x, y, width, height);
  }
  context.restore();
};

const setFont = (context: CanvasRenderingContext2D, size: number, weight = 400, italic = false) => {
  context.font = `${italic ? "italic " : ""}${weight} ${size}px PhiHybrid, "Noto Sans SC", sans-serif`;
};

const fitText = (context: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, minimum = 8, weight = 400) => {
  let current = size;
  while (current > minimum) {
    setFont(context, current, weight);
    if (context.measureText(text).width <= maxWidth) break;
    current -= 1;
  }
  return current;
};

const drawCentered = (context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number) => {
  context.fillText(text, x + (width - context.measureText(text).width) / 2, y);
};

const drawRankIcon = (context: CanvasRenderingContext2D, image: HTMLImageElement | null, x: number, y: number, width: number, height: number) => {
  if (!image) return;
  const scale = Math.min(width / image.width, height / image.height);
  context.drawImage(image, x + (width - image.width * scale) / 2, y + (height - image.height * scale) / 2, image.width * scale, image.height * scale);
};

const drawPill = (context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, color: string) => {
  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(x, y, width, 17, 8);
  context.fill();
  context.fillStyle = "#fff";
  setFont(context, 10, 700);
  drawCentered(context, text, x, y + 12, width);
  context.restore();
};

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

const visibleEntriesFor = (model: B30Model) => [...model.selectedEntries, ...model.overflowEntries.slice(0, 3)];

const drawFlowSeparator = (context: CanvasRenderingContext2D, y: number, label: string) => {
  const widths = [192, 96, 48, 24, 12, 6];
  const drawSide = (start: number, reverse = false) => {
    let cursor = reverse ? start - widths[0] : start;
    widths.forEach((width) => {
      fillClip(context, cursor, y, width, 14, "rgba(255,255,255,.94)", 0.22);
      cursor += (reverse ? -1 : 1) * (width + 7);
    });
  };
  drawSide(38);
  drawSide(canvasWidth - 38, true);
  context.fillStyle = "#fff";
  setFont(context, 24, 600, true);
  context.textAlign = "center";
  context.fillText(label, canvasWidth / 2, y + 17);
  context.textAlign = "left";
};

const parsePoints = (value: string) => value.trim().split(/\s+/).map((point) => point.split(",").map(Number)).filter((point) => point.length === 2 && point.every(Number.isFinite)) as [number, number][];

const drawRadar = (context: CanvasRenderingContext2D, panelX: number, panelY: number, analysis: B30TagAnalysis | null) => {
  const originX = panelX + 157;
  const originY = panelY + 154;
  const scale = 0.68;
  const drawPolygon = (points: [number, number][], stroke: string, fill?: string) => {
    if (!points.length) return;
    context.beginPath();
    points.forEach(([x, y], index) => index ? context.lineTo(originX + (x - 100) * scale, originY + (y - 92) * scale) : context.moveTo(originX + (x - 100) * scale, originY + (y - 92) * scale));
    context.closePath();
    if (fill) { context.fillStyle = fill; context.fill(); }
    context.strokeStyle = stroke;
    context.lineWidth = 1;
    context.stroke();
  };
  (analysis?.radar.grids ?? []).forEach((grid) => drawPolygon(parsePoints(grid), "rgba(255,255,255,.16)"));
  (analysis?.radar.axes ?? []).forEach((axis) => {
    context.strokeStyle = "rgba(255,255,255,.22)";
    context.beginPath();
    context.moveTo(originX, originY);
    context.lineTo(originX + (axis.x - 100) * scale, originY + (axis.y - 92) * scale);
    context.stroke();
  });
  drawPolygon(parsePoints(analysis?.radar.points ?? ""), "#00b7f0", "rgba(0,183,240,.30)");
  (analysis?.radar.categories ?? []).forEach((category) => {
    const px = originX + ((category.pointX ?? 100) - 100) * scale;
    const py = originY + ((category.pointY ?? 92) - 92) * scale;
    context.fillStyle = "#fff";
    context.beginPath();
    context.arc(px, py, 2.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "rgba(255,255,255,.85)";
    setFont(context, 12);
    const labelX = originX + ((category.labelX ?? 100) - 100) * scale;
    const labelY = originY + ((category.labelY ?? 92) - 92) * scale;
    context.textAlign = category.anchor === "end" ? "right" : category.anchor === "middle" ? "center" : "left";
    context.fillText(category.name, labelX, labelY);
    context.fillStyle = "#00b7f0";
    setFont(context, 10);
    context.fillText(category.displayRks ?? category.rks.toFixed(2), labelX, labelY + 14);
  });
  context.textAlign = "left";
};

const paintAnalysis = (context: CanvasRenderingContext2D, y: number, model: B30Model, tagAnalysis: B30TagAnalysis | null, histogram: B30Histogram) => {
  drawFlowSeparator(context, y, "B30 数据分析");
  const panelY = y + 34;
  const panelHeight = 310;
  const left = 60;
  const gap = 22;
  const panelWidth = 548;
  const right = left + panelWidth + gap;
  [left, right].forEach((x) => fillClip(context, x, panelY, panelWidth, panelHeight, "rgba(0,0,0,.64)", 0.3));
  context.fillStyle = "#00b7f0";
  setFont(context, 13);
  context.fillText("CHART PROFILE", left + 28, panelY + 30);
  context.fillStyle = "#fff";
  setFont(context, 27);
  context.fillText("谱面实力分析", left + 28, panelY + 61);
  context.strokeStyle = "rgba(255,255,255,.25)";
  context.beginPath();
  context.moveTo(left + 28, panelY + 78);
  context.lineTo(left + panelWidth - 30, panelY + 78);
  context.stroke();
  context.fillStyle = "rgba(255,255,255,.7)";
  setFont(context, 12);
  context.fillText(tagAnalysis ? `RKS≥${(tagAnalysis.threshold ?? 0).toFixed(1)} · 成绩 ${tagAnalysis.recordCount} · 选票 ${tagAnalysis.totalVotes}` : "维度标签体系参考自 kyou.net.cn", left + 30, panelY + 103);
  if (tagAnalysis && !tagAnalysis.insufficient && tagAnalysis.radar.categories.length) {
    drawRadar(context, left, panelY, tagAnalysis);
    const drawTags = (title: string, tags: { name: string; rks: number }[], x: number, tagColor: string, startY: number) => {
      context.fillStyle = tagColor;
      setFont(context, 13, 600);
      context.fillText(title, x, startY);
      tags.slice(0, 3).forEach((tag, index) => {
        context.fillStyle = "rgba(255,255,255,.85)";
        setFont(context, 11);
        context.fillText(`${index + 1}`, x, startY + 20 + index * 20);
        context.fillStyle = "#fff";
        context.fillText(tag.name, x + 20, startY + 20 + index * 20);
        context.fillStyle = "rgba(255,255,255,.72)";
        context.textAlign = "right";
        context.fillText(tag.rks.toFixed(2), x + 150, startY + 20 + index * 20);
        context.textAlign = "left";
      });
    };
    drawTags("擅长词条", tagAnalysis.strong, left + 330, "#fff", panelY + 126);
    drawTags("薄弱词条", tagAnalysis.weak, left + 330, "#00b7f0", panelY + 213);
  } else {
    context.fillStyle = "rgba(0,0,0,.42)";
    context.fillRect(left + 22, panelY + 118, panelWidth - 44, 142);
    context.fillStyle = "#fff";
    setFont(context, 15, 500);
    context.textAlign = "center";
    context.fillText("暂无足够的社区标签样本", left + panelWidth / 2, panelY + 175);
    context.fillStyle = "rgba(255,255,255,.62)";
    setFont(context, 11);
    context.fillText("标签来源：Kyou / phib19.top · 可在有联网时自动获取", left + panelWidth / 2, panelY + 200);
    context.textAlign = "left";
  }
  context.fillStyle = "rgba(255,255,255,.66)";
  setFont(context, 10);
  context.fillText(`${model.selectedEntries.length} 个有效槽位 · φ3 + B27`, left + 30, panelY + 285);

  context.fillStyle = "#00b7f0";
  setFont(context, 13);
  context.fillText("RKS DISTRIBUTION", right + 28, panelY + 30);
  context.fillStyle = "#fff";
  setFont(context, 27);
  context.fillText("等效 RKS 直方图", right + 28, panelY + 61);
  context.fillStyle = "rgba(255,255,255,.78)";
  setFont(context, 12);
  context.textAlign = "right";
  context.fillText(`平均 RKS ${histogram.average.toFixed(4)}`, right + panelWidth - 30, panelY + 31);
  context.textAlign = "left";
  context.strokeStyle = "rgba(255,255,255,.25)";
  context.beginPath();
  context.moveTo(right + 28, panelY + 78);
  context.lineTo(right + panelWidth - 28, panelY + 78);
  context.stroke();
  const plotX = right + 55;
  const plotY = panelY + 112;
  const plotW = panelWidth - 82;
  const plotH = 145;
  histogram.ticks.forEach((tick) => {
    const gridY = plotY + plotH - tick.position / 100 * plotH;
    context.strokeStyle = "rgba(255,255,255,.13)";
    context.beginPath();
    context.moveTo(plotX, gridY);
    context.lineTo(plotX + plotW, gridY);
    context.stroke();
    context.fillStyle = "rgba(255,255,255,.54)";
    setFont(context, 9);
    context.fillText(tick.label, plotX + 2, gridY - 3);
  });
  const barGap = 2;
  const barWidth = histogram.slots.length ? Math.max(3, (plotW - barGap * (histogram.slots.length - 1)) / histogram.slots.length) : 7;
  histogram.slots.forEach((slot, index) => {
    const height = Math.max(2, slot.height / 100 * plotH);
    context.fillStyle = slot.kind === "phi" ? "#fff" : "#00b7f0";
    context.fillRect(plotX + index * (barWidth + barGap), plotY + plotH - height, barWidth, height);
  });
  const avgY = plotY + plotH - histogram.averagePosition / 100 * plotH;
  context.strokeStyle = "rgba(255,255,255,.85)";
  context.beginPath();
  context.moveTo(plotX, avgY);
  context.lineTo(plotX + plotW, avgY);
  context.stroke();
  context.fillStyle = "rgba(255,255,255,.62)";
  setFont(context, 10);
  context.fillText("P1-P3", right + 34, panelY + 287);
  context.fillStyle = "#00b7f0";
  context.fillText("B1-B27", right + 102, panelY + 287);
  context.fillStyle = "rgba(255,255,255,.62)";
  context.fillText(`${histogram.count} 个有效槽位`, right + 195, panelY + 287);
};

const paintCard = (context: CanvasRenderingContext2D, entry: RksEntry, index: number, selectedCount: number, art: HTMLImageElement | null, rankArt: HTMLImageElement | null, average: number | undefined) => {
  const { x, y } = cardPosition(index, selectedCount);
  const isOverflow = index >= selectedCount;
  const rank = rankForScore(entry.record.score, entry.record.fc);
  // PhiPlugin numbers the overflow cards by their position in the B-list,
  // so the first card after φ3+B27 is #28 (not #31).
  const label = isOverflow ? `#${index - selectedCount + 28}` : index < 3 ? `P${index + 1}` : `#${index - 2}`;
  const colors = difficultyColors[entry.chart.difficulty] ?? difficultyColors.at;

  context.save();
  context.shadowColor = "rgba(0,0,0,.42)";
  context.shadowBlur = 9;
  drawImageCover(context, art, x, y + 2, 180, 95, 0.3, "saturate(.92)");
  context.restore();
  fillClip(context, x - 3, y, 39, 16, "rgba(255,255,255,.96)", 0.3);
  context.fillStyle = "#15191b";
  setFont(context, 11, 500);
  drawCentered(context, label, x - 3, y + 12, 39);

  // In the original b19 template the absolute difficulty block keeps its
  // static position at the left edge of the illustration and uses a negative
  // margin.  It therefore hangs outside the lower-left corner of the art.
  const rankX = x - 23;
  const rankY = y + 67;
  fillClip(context, rankX, rankY, 60, 32, colors.badge, 0.3);
  context.fillStyle = "#fff";
  setFont(context, 12, 500);
  drawCentered(context, `${difficultyNames[entry.chart.difficulty] ?? entry.chart.difficulty.toUpperCase()} ${entry.chart.constant?.toFixed(1) ?? "—"}`, rankX, rankY + 13, 60);
  setFont(context, 12, 500);
  drawCentered(context, entry.singleRks.toFixed(2), rankX, rankY + 27, 60);

  const panelX = x + 143;
  const panelY = y + 5;
  context.save();
  context.shadowColor = "rgba(0,0,0,.52)";
  context.shadowBlur = 9;
  fillClip(context, panelX, panelY, 202, 90, colors.panel, 0.3);
  context.restore();
  context.strokeStyle = colors.border;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(panelX + 200, panelY + 2);
  context.lineTo(panelX + 200, panelY + 88);
  context.stroke();

  context.fillStyle = "#fff";
  context.textAlign = "center";
  const titleSize = fitText(context, entry.chart.title, 160, 15, 8, 400);
  setFont(context, titleSize, 400);
  context.fillText(entry.chart.title, panelX + 102, panelY + 18);
  context.textAlign = "left";
  drawRankIcon(context, rankArt, panelX + 8, panelY + 28, 42, 45);
  context.fillStyle = "#fff";
  setFont(context, 25, 400);
  context.textAlign = "center";
  context.fillText(number.format(entry.record.score), panelX + 126, panelY + 53);
  context.strokeStyle = "rgba(255,255,255,.88)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(panelX + 62, panelY + 60);
  context.lineTo(panelX + 184, panelY + 60);
  context.stroke();
  context.fillStyle = "#fff";
  setFont(context, 13, 400);
  context.fillText(`${entry.accuracy.toFixed(2)}%`, panelX + 62, panelY + 78);
  if (average !== undefined) {
    drawPill(context, `Avg: ${average.toFixed(4)}%`, x + 30, y - 17, 132, average <= entry.accuracy ? "rgba(0,135,75,.86)" : "rgba(152,37,50,.86)");
    drawPill(context, `● ${average.toFixed(2)}%`, panelX + 132, panelY + 65, 61, "rgba(0,0,0,.46)");
  }
  context.textAlign = "left";
  context.restore();
};

async function paintB30(canvas: HTMLCanvasElement, model: B30Model, profile: Props["profile"], fetchedAt: string | null, charts: ChartRecord[], records: PhigrosCloudRecord[], tagAnalysis: B30TagAnalysis | null, averages: B30AverageMap, cancelled: () => boolean, onProgress?: (done: number, total: number) => void) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const visibleEntries = visibleEntriesFor(model);
  const totalAssets = visibleEntries.length * 2 + 1 + (profile?.avatar ? 1 : 0);
  let completedAssets = 0;
  const report = () => onProgress?.(++completedAssets, totalAssets);
  const artsPromise = mapConcurrent(visibleEntries, imageConcurrency, async (entry) => { const image = await loadArtwork(entry.chart.songId, entry.chart.difficulty); report(); return image; });
  const rankPromise = mapConcurrent(visibleEntries, imageConcurrency, async (entry) => { const image = await loadImage(rankAssets[rankForScore(entry.record.score, entry.record.fc)]); report(); return image; });
  const backgroundPromise = visibleEntries[0] ? loadArtwork(visibleEntries[0].chart.songId, visibleEntries[0].chart.difficulty, true).then((image) => { report(); return image; }) : Promise.resolve<HTMLImageElement | null>(null);
  const avatarPromise = profile?.avatar ? loadAvatar(profile.avatar).then((image) => { report(); return image; }) : Promise.resolve<HTMLImageElement | null>(null);
  const [arts, rankArts, background, avatar] = await Promise.all([artsPromise, rankPromise, backgroundPromise, avatarPromise]);
  if (cancelled()) return;

  const maxIndex = Math.max(visibleEntries.length - 1, model.selectedEntries.length - 1, 0);
  const lastCard = cardPosition(maxIndex, model.selectedEntries.length);
  const analysisY = lastCard.y + cardHeight + 28;
  const panelHeight = 310;
  const canvasHeight = analysisY + 34 + panelHeight + 125;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = "#202529";
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  // PhiPlugin uses a separate random blurred illustration as the page
  // background.  Prefer a middle card when the first result is a very dark
  // cover, then fall back to the first successfully loaded illustration.
  const backgroundImage = arts[Math.min(arts.length - 1, 9)] ?? background ?? arts.find((image): image is HTMLImageElement => Boolean(image)) ?? await loadImage("/assets/phi-plugin/otherimg/phigros.png");
  if (backgroundImage) {
    context.save();
    context.globalAlpha = 0.56;
    context.filter = "blur(16px) brightness(.62) saturate(.82)";
    const scale = Math.max(canvasWidth / backgroundImage.width, canvasHeight / backgroundImage.height);
    const width = backgroundImage.width * scale;
    const height = backgroundImage.height * scale;
    context.drawImage(backgroundImage, (canvasWidth - width) / 2, (canvasHeight - height) / 2, width, height);
    context.restore();
  }
  context.fillStyle = "rgba(12,15,18,.46)";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  // Header copied from PhiPlugin's b19 template: avatar, challenge strip,
  // RKS badge and centered player id.
  fillClip(context, 84, 42, 622, 73, "rgba(0,0,0,.57)", 0.3);
  if (avatar) drawImageCover(context, avatar, 84, 43, 132, 80, 0.3);
  context.fillStyle = "#fff";
  const playerName = profile?.playerName || profile?.playerId || "PLAYER";
  fitText(context, playerName, 270, 28, 14, 400);
  context.textAlign = "center";
  context.fillText(playerName, 495, 80);
  context.textAlign = "left";
  fillClip(context, 216, 92, 108, 25, "rgba(255,255,255,.96)", 0.3);
  context.fillStyle = "#11171a";
  setFont(context, 18, 500);
  drawCentered(context, profile?.rks == null ? "—" : profile.rks.toFixed(4), 216, 110, 108);
  const challengeX = 246;
  const challengeY = 57;
  const challengeRank = profile?.challengeModeRank ?? null;
  const tier = challengeRank === null ? null : Math.max(0, Math.min(5, Math.floor(challengeRank / 100)));
  if (tier !== null) {
    const challengeImage = await loadImage(challengeAssets[tier]);
    drawImageCover(context, challengeImage, challengeX, challengeY, 64, 18, 0);
  }
  context.fillStyle = "#11171a";
  setFont(context, 17, 500);
  context.textAlign = "center";
  context.fillText(challengeRank === null ? "—" : String(challengeRank % 100), challengeX + 32, challengeY + 15);
  context.textAlign = "left";
  context.fillStyle = "rgba(255,255,255,.78)";
  setFont(context, 12);
  context.textAlign = "right";
  context.fillText(formatDate(profile?.updatedAt || fetchedAt), 690, 37);
  context.textAlign = "left";
  fillClip(context, 77, 120, 194, 21, "rgba(0,0,0,.58)", 0.3);
  const dataIcon = await loadImage("/assets/phi-plugin/otherimg/data.png");
  drawRankIcon(context, dataIcon, 81, 122, 18, 17);
  context.fillStyle = "rgba(255,255,255,.88)";
  setFont(context, 10);
  context.fillText(profile?.data || "", 103, 134);
  if (profile?.gameVersion) {
    fillClip(context, 516, 120, 142, 21, "rgba(255,161,100,.86)", 0.3);
    context.fillStyle = "#1a1512";
    setFont(context, 10, 600);
    context.fillText(profile.gameVersion, 536, 134);
  }
  const stats = buildStats(charts, records);
  fillClip(context, 756, 30, 300, 112, "rgba(0,0,0,.57)", 0.3);
  context.fillStyle = "#fff";
  setFont(context, 13);
  context.fillText("\\", 790, 51);
  stats.forEach((stat, index) => {
    const x = 860 + index * 51;
    context.fillStyle = "rgba(255,255,255,.87)";
    setFont(context, 12);
    drawCentered(context, stat.title, x - 18, 51, 36);
    setFont(context, 11);
    drawCentered(context, String(stat.cleared), x - 18, 74, 36);
    drawCentered(context, String(stat.fc), x - 18, 94, 36);
    drawCentered(context, String(stat.phi), x - 18, 114, 36);
  });
  context.fillStyle = "rgba(255,255,255,.82)";
  setFont(context, 11);
  context.fillText("C", 790, 74);
  context.fillText("FC", 785, 94);
  context.fillText("Phi", 783, 114);
  context.fillStyle = "rgba(255,255,255,.72)";
  setFont(context, 11);
  context.fillText("*B30 使用当前曲库定数计算；成绩顺序与 PhiPlugin 的 φ3 + B27 规则一致。", 70, 163);
  context.strokeStyle = "rgba(255,255,255,.3)";
  context.beginPath();
  context.moveTo(34, 194);
  context.lineTo(canvasWidth - 34, 194);
  context.stroke();

  visibleEntries.forEach((entry, index) => {
    const key = `${entry.chart.songId}.0:${entry.chart.difficulty}`;
    paintCard(context, entry, index, model.selectedEntries.length, arts[index], rankArts[index], averages.get(key));
  });
  if (visibleEntries.length > model.selectedEntries.length) drawFlowSeparator(context, cardStartY + Math.ceil(model.selectedEntries.length / 3) * rowHeight + 9, "OVER FLOW");
  const analysisRecords = getB30AnalysisRecords(model);
  paintAnalysis(context, analysisY, model, tagAnalysis, buildRksHistogram(analysisRecords));
  context.fillStyle = "#fff";
  context.textAlign = "center";
  setFont(context, 29, 400);
  context.shadowColor = "#00baff";
  context.shadowBlur = 14;
  context.fillText("PhiTarget", canvasWidth / 2, canvasHeight - 57);
  context.shadowBlur = 0;
  setFont(context, 11);
  context.fillText("B30 · browser generated", canvasWidth / 2, canvasHeight - 35);
  setFont(context, 9);
  context.fillText("*PhiTarget is an unofficial Phigros companion tool.", canvasWidth / 2, canvasHeight - 16);
  context.textAlign = "left";
}

export default function B30Generator({ charts, records, profile, fetchedAt, cloud, onLoaded, onAccountChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderVersion = useRef(0);
  const model = useMemo(() => buildB30Model(charts, records), [charts, records]);
  const visibleEntries = useMemo(() => visibleEntriesFor(model), [model]);
  const maxIndex = Math.max(visibleEntries.length - 1, model.selectedEntries.length - 1, 0);
  const lastCard = cardPosition(maxIndex, model.selectedEntries.length);
  const canvasHeight = lastCard.y + cardHeight + 28 + 34 + 310 + 125;
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [progress, setProgress] = useState(0);
  const [tagAnalysis, setTagAnalysis] = useState<B30TagAnalysis | null>(null);
  const [averages, setAverages] = useState<B30AverageMap>(() => new Map());

  useEffect(() => {
    const controller = new AbortController();
    setTagAnalysis(null);
    setAverages(new Map());
    void Promise.all([fetchB30TagAnalysis(records, controller.signal), fetchB30AccAverages(records, controller.signal)]).then(([tags, average]) => {
      if (!controller.signal.aborted) { setTagAnalysis(tags); setAverages(average); }
    });
    return () => controller.abort();
  }, [records]);

  useEffect(() => {
    if (!model.selectedEntries.length || !canvasRef.current) { setStatus("idle"); return; }
    let cancelled = false;
    const version = ++renderVersion.current;
    setStatus("loading");
    setProgress(0);
    void paintB30(canvasRef.current, model, profile, fetchedAt, charts, records, tagAnalysis, averages, () => cancelled || renderVersion.current !== version, (done, total) => {
      if (!cancelled) setProgress(total ? Math.round(done / total * 100) : 0);
    }).then(() => { if (!cancelled) setStatus("ready"); });
    return () => { cancelled = true; };
  }, [charts, fetchedAt, model, profile, records, tagAnalysis, averages]);

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

  return <main className="feature-page b30-page">
    <header className="feature-heading"><div><small>B30 / BEST 30 IMAGE</small><h1>在线生成 B30 图片</h1><p>直接按 PhiPlugin 的 1200px B30 模板、官方判定图标和 φ3 + B27 顺序生成 PNG。</p></div><span className="feature-mark">30</span></header>
    <section className="b30-connect"><div><strong>{records.length ? "更新 B30 数据" : "输入 sessionToken 生成 B30"}</strong><small>玩家数据页与本页使用同一个当前账号；可选保存多个账号并切换。</small></div><CloudAccountPanel charts={charts} cloud={cloud} onLoaded={onLoaded} onAccountChange={onAccountChange} compact /></section>
    {!records.length ? <section className="b30-empty"><strong>还没有可用的云档成绩</strong><p>输入 sessionToken 后，PhiTarget 会在当前浏览器内计算单曲 RKS、φ3 + B27，并生成可下载的 B30 图片。</p></section> : <>
      <section className="b30-summary"><div><strong>{model.selectedEntries.length}</strong><small>已纳入成绩</small></div><div><strong>{model.b30Rks === null ? "—" : model.b30Rks.toFixed(4)}</strong><small>B30 RKS</small></div><div><strong>{profile?.rks === null || profile?.rks === undefined ? "—" : profile.rks.toFixed(4)}</strong><small>云档 RKS</small></div><div><strong>{model.overflowEntries.length}</strong><small>Overflow</small></div></section>
      <section className="b30-toolbar"><div><strong>{model.complete ? "B30 数据完整" : `当前只有 ${model.selectedEntries.length}/30 张可计算成绩`}</strong><small>{model.missingAccuracy ? `${model.missingAccuracy} 张成绩缺少 ACC，未计入 RKS。` : "φ3 + B27 · 官方模板复刻"}{status === "loading" ? ` · 曲绘加载 ${progress}%` : ""}</small></div><button type="button" className="primary-action" disabled={status !== "ready"} onClick={download}>{status === "loading" ? `图片生成中… ${progress}%` : "下载 PNG"}</button></section>
      <section className="b30-canvas-wrap"><canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} aria-label="PhiTarget B30 成绩图片" /></section>
      <p className="b30-note">卡片布局、官方等级图片、OVER FLOW 和 Kyou 标签分析按 PhiPlugin 原始 B30 模板实现；社区接口不可用时仅隐藏标签结果，不影响成绩图生成。</p>
    </>}
  </main>;
}
