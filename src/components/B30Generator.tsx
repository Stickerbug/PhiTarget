import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartRecord } from "../data/types";
import { buildB30Model, type B30Model, type RksEntry } from "../core/rks";
import { rankForScore, type ScoreRank } from "../core/ranks";
import type { PhigrosCloudData, PhigrosCloudRecord } from "../core/phigrosCloud";
import CloudAccountPanel from "./CloudAccountPanel";
import type { CloudAccountsController } from "../hooks/useCloudAccounts";

const number = new Intl.NumberFormat("en-US");
const resourceCdn = "https://cdn.jsdelivr.net/gh/7aGiven/Phigros_Resource";
const artUrl = (songId: string, blur = false) => `${resourceCdn}@${blur ? "illustrationBlur" : "illustrationLowRes"}/${encodeURIComponent(songId)}.png`;
const rawResource = "https://raw.githubusercontent.com/7aGiven/Phigros_Resource";
const rawArtUrl = (songId: string, branch: "illustrationLowRes" | "illustration" | "illustrationBlur") => `${rawResource}/${branch}/${encodeURIComponent(songId)}.png`;
const avatarUrl = (avatar: string) => `${resourceCdn}@avatar/${encodeURIComponent(avatar)}.png`;
const rawAvatarUrl = (avatar: string) => `${rawResource}/avatar/${encodeURIComponent(avatar)}.png`;
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
const difficultyNames: Record<string, string> = { ez: "EZ", hd: "HD", in: "IN", at: "AT" };
const difficultyColors: Record<string, { badge: string; panel: string; glow: string }> = {
  ez: { badge: "#92d050", panel: "rgba(0,183,240,.38)", glow: "#a7d65b" },
  hd: { badge: "#00b0f0", panel: "rgba(0,183,240,.38)", glow: "#61d8ff" },
  in: { badge: "#ff0000", panel: "rgba(0,183,240,.38)", glow: "#ff6969" },
  at: { badge: "#6e6e6e", panel: "rgba(240,0,0,.3)", glow: "#fff700" },
};
const canvasWidth = 1200;
const headerHeight = 218;
const cardWidth = 360;
const cardHeight = 100;
const rowHeight = 122;
const sideMargin = 28;
const columnGap = 30;
const analysisHeight = 380;
const footerHeight = 125;

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
  const cached = imageCache.get(source);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    if (/^https?:\/\//.test(source)) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
  imageCache.set(source, pending);
  return pending;
};

const loadFirstImage = async (sources: string[]) => {
  for (const source of sources) {
    const image = await loadImage(source);
    if (image) return image;
  }
  return null;
};

const loadArtwork = (songId: string, blur = false) => {
  if (blur) return loadFirstImage([artUrl(songId, true), rawArtUrl(songId, "illustrationBlur"), artUrl(songId), rawArtUrl(songId, "illustration")]);
  return loadFirstImage([artUrl(songId), rawArtUrl(songId, "illustrationLowRes"), `${resourceCdn}@illustration/${encodeURIComponent(songId)}.png`, rawArtUrl(songId, "illustration")]);
};

const loadAvatar = (avatar: string | null) => {
  if (!avatar) return Promise.resolve<HTMLImageElement | null>(null);
  if (/^https?:\/\//.test(avatar)) return loadFirstImage([avatar]);
  return loadFirstImage([avatarUrl(avatar), rawAvatarUrl(avatar)]);
};

const clipBox = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, slope = 0.3) => {
  const offset = height * slope;
  context.beginPath();
  context.moveTo(x + offset, y);
  context.lineTo(x + width, y);
  context.lineTo(x + width - offset, y + height);
  context.lineTo(x, y + height);
  context.closePath();
};

const fillClipBox = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fill: string, slope = 0.3) => {
  context.save();
  clipBox(context, x, y, width, height, slope);
  context.fillStyle = fill;
  context.fill();
  context.restore();
};

const drawCover = (context: CanvasRenderingContext2D, image: HTMLImageElement | null, x: number, y: number, width: number, height: number, slope = 0, filter = "none") => {
  context.save();
  if (slope) {
    clipBox(context, x, y, width, height, slope);
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
    context.fillStyle = "#152027";
    context.fillRect(x, y, width, height);
  }
  context.restore();
};

const fitText = (context: CanvasRenderingContext2D, text: string, maxWidth: number, initial: number, minimum = 8) => {
  let size = initial;
  while (size > minimum) {
    if (context.measureText(text).width <= maxWidth) return size;
    size -= 1;
    context.font = context.font.replace(/\d+(?:\.\d+)?px/, `${size}px`);
  }
  return size;
};

const drawCentered = (context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number) => {
  context.fillText(text, x + (width - context.measureText(text).width) / 2, y);
};

const drawRankIcon = (context: CanvasRenderingContext2D, image: HTMLImageElement | null, x: number, y: number, size: number) => {
  if (!image) return;
  const scale = Math.min(size / image.width, size / image.height);
  context.drawImage(image, x + (size - image.width * scale) / 2, y + (size - image.height * scale) / 2, image.width * scale, image.height * scale);
};

const drawRankFallback = (context: CanvasRenderingContext2D, rank: ScoreRank, x: number, y: number) => {
  const label = rank === "phi" ? "Φ" : rank === "blueV" ? "V" : rank;
  context.save();
  context.fillStyle = rank === "phi" ? "#fff24a" : rank === "blueV" ? "#37c5ff" : "#fff";
  context.font = `700 ${rank === "phi" ? 38 : 32}px PhiHybrid, sans-serif`;
  context.shadowColor = context.fillStyle;
  context.shadowBlur = 8;
  context.fillText(label, x, y);
  context.restore();
};

const buildStats = (charts: ChartRecord[], records: PhigrosCloudRecord[]): Stat[] => {
  const byDifficulty = new Map<string, PhigrosCloudRecord[]>();
  records.forEach((record) => {
    const list = byDifficulty.get(record.difficulty) ?? [];
    list.push(record);
    byDifficulty.set(record.difficulty, list);
  });
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
  if (!value) return "当前会话";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
};

const visibleEntriesFor = (model: B30Model) => [...model.selectedEntries, ...model.overflowEntries.slice(0, 6)];

const drawFlowSeparator = (context: CanvasRenderingContext2D, y: number, label: string) => {
  const widths = [178, 92, 46, 24, 13];
  const gap = 6;
  let left = 46;
  widths.forEach((width) => {
    fillClipBox(context, left, y, width, 12, "rgba(255,255,255,.94)", 0.25);
    left += width + gap;
  });
  let right = canvasWidth - 46;
  [...widths].reverse().forEach((width) => {
    right -= width;
    fillClipBox(context, right, y, width, 12, "rgba(255,255,255,.94)", 0.25);
    right -= gap;
  });
  context.fillStyle = "#fff";
  context.font = "italic 600 20px PhiHybrid, sans-serif";
  context.textAlign = "center";
  context.fillText(label, canvasWidth / 2, y + 12);
  context.textAlign = "left";
};

const paintAnalysis = (context: CanvasRenderingContext2D, y: number, model: B30Model, stats: Stat[]) => {
  drawFlowSeparator(context, y, "B30 数据分析");
  const panelY = y + 36;
  const panelHeight = 285;
  const panelWidth = 510;
  const panelLeft = 66;
  const panelRight = 624;
  fillClipBox(context, panelLeft, panelY, panelWidth, panelHeight, "rgba(0,0,0,.67)", 0.3);
  fillClipBox(context, panelRight, panelY, panelWidth, panelHeight, "rgba(0,0,0,.67)", 0.3);
  context.fillStyle = "#00b7f0";
  context.font = "12px PhiHybrid, sans-serif";
  context.fillText("CHART PROFILE", panelLeft + 28, panelY + 30);
  context.fillStyle = "#fff";
  context.font = "26px PhiHybrid, sans-serif";
  context.fillText("谱面实力分析", panelLeft + 28, panelY + 62);
  context.strokeStyle = "rgba(255,255,255,.28)";
  context.beginPath();
  context.moveTo(panelLeft + 28, panelY + 78);
  context.lineTo(panelLeft + panelWidth - 28, panelY + 78);
  context.stroke();
  context.fillStyle = "#fff";
  context.font = "600 14px PhiHybrid, sans-serif";
  context.fillText("成绩统计", panelLeft + 30, panelY + 108);
  stats.forEach((stat, index) => {
    const rowY = panelY + 137 + index * 31;
    const x = panelLeft + 34;
    context.fillStyle = "rgba(255,255,255,.8)";
    context.font = "12px PhiHybrid, sans-serif";
    context.fillText(stat.title, x, rowY);
    context.fillStyle = "#00b7f0";
    context.fillRect(x + 44, rowY - 10, Math.min(270, stat.tot ? stat.cleared / stat.tot * 270 : 0), 8);
    context.fillStyle = "#fff";
    context.font = "11px PhiHybrid, sans-serif";
    context.fillText(`C ${stat.cleared} · FC ${stat.fc} · Phi ${stat.phi}`, x + 324, rowY);
  });
  context.fillStyle = "rgba(255,255,255,.65)";
  context.font = "11px PhiHybrid, sans-serif";
  context.fillText(`${model.selectedEntries.length} 个有效槽位 · φ3 + B27`, panelLeft + 30, panelY + 257);

  context.fillStyle = "#00b7f0";
  context.font = "12px PhiHybrid, sans-serif";
  context.fillText("RKS DISTRIBUTION", panelRight + 28, panelY + 30);
  context.fillStyle = "#fff";
  context.font = "26px PhiHybrid, sans-serif";
  context.fillText("等效 RKS 直方图", panelRight + 28, panelY + 62);
  const values = model.selectedEntries.map((entry) => entry.singleRks);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  context.fillStyle = "rgba(255,255,255,.78)";
  context.font = "12px PhiHybrid, sans-serif";
  context.fillText(`平均 RKS  ${average.toFixed(4)}`, panelRight + panelWidth - 170, panelY + 32);
  context.strokeStyle = "rgba(255,255,255,.28)";
  context.beginPath();
  context.moveTo(panelRight + 28, panelY + 78);
  context.lineTo(panelRight + panelWidth - 28, panelY + 78);
  context.stroke();
  const plotX = panelRight + 46;
  const plotY = panelY + 105;
  const plotW = panelWidth - 70;
  const plotH = 132;
  context.strokeStyle = "rgba(255,255,255,.18)";
  for (let i = 0; i <= 4; i += 1) {
    const gridY = plotY + plotH - i * plotH / 4;
    context.beginPath();
    context.moveTo(plotX, gridY);
    context.lineTo(plotX + plotW, gridY);
    context.stroke();
  }
  const barGap = 3;
  const barW = values.length ? Math.max(3, (plotW - barGap * (values.length - 1)) / values.length) : 8;
  values.forEach((value, index) => {
    const height = max === min ? plotH : Math.max(3, (value - min) / (max - min) * plotH);
    context.fillStyle = index < 3 ? "#fff" : "#00b7f0";
    context.fillRect(plotX + index * (barW + barGap), plotY + plotH - height, barW, height);
  });
  context.fillStyle = "rgba(255,255,255,.65)";
  context.font = "10px PhiHybrid, sans-serif";
  context.fillText(`${min.toFixed(2)}`, plotX, plotY + plotH + 18);
  context.fillText(`${max.toFixed(2)}`, plotX, plotY - 7);
  context.fillText("P1-P3", panelRight + 35, panelY + 263);
  context.fillStyle = "#00b7f0";
  context.fillText("B1-B27", panelRight + 102, panelY + 263);
};

const paintCard = (context: CanvasRenderingContext2D, entry: RksEntry, index: number, phiCount: number, isOverflow: boolean, art: HTMLImageElement | null, rankArt: HTMLImageElement | null) => {
  const column = index % 3;
  const row = Math.floor(index / 3);
  const x = sideMargin + column * (cardWidth + columnGap);
  const y = headerHeight + row * rowHeight;
  const rank = rankForScore(entry.record.score, entry.record.fc);
  const kind = !isOverflow && index < phiCount ? `P${index + 1}` : `#${isOverflow ? index - 2 : index - phiCount + 1}`;
  const colors = difficultyColors[entry.chart.difficulty] ?? difficultyColors.at;
  const selectedGlow = !isOverflow && index < 30;

  context.save();
  context.shadowColor = selectedGlow ? `${colors.glow}99` : "rgba(255,255,255,.58)";
  context.shadowBlur = 9;
  fillClipBox(context, x, y, cardWidth, cardHeight, "rgba(0,0,0,.34)", 0.3);
  context.restore();

  drawCover(context, art, x + 1, y + 2, 180, 95, 0.3, "saturate(.9)");
  fillClipBox(context, x + 2, y + 2, 58, 16, "rgba(255,255,255,.95)", 0.3);
  context.fillStyle = "#11171a";
  context.font = "700 11px PhiHybrid, sans-serif";
  drawCentered(context, kind, x + 2, y + 13, 58);

  const panelX = x + 152;
  const panelY = y + 5;
  fillClipBox(context, panelX, panelY, 195, 90, colors.panel, 0.3);
  context.strokeStyle = entry.chart.difficulty === "at" ? "#ff0000" : "#00b7f0";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(panelX + 193, panelY + 2);
  context.lineTo(panelX + 193, panelY + 88);
  context.stroke();

  fillClipBox(context, x + 112, y + 67, 66, 31, colors.badge, 0.3);
  context.fillStyle = "#fff";
  context.font = "700 12px PhiHybrid, sans-serif";
  drawCentered(context, `${difficultyNames[entry.chart.difficulty] ?? entry.chart.difficulty.toUpperCase()} ${entry.chart.constant?.toFixed(1) ?? "—"}`, x + 112, y + 80, 66);
  context.font = "700 12px PhiHybrid, sans-serif";
  drawCentered(context, entry.singleRks.toFixed(2), x + 112, y + 94, 66);

  context.fillStyle = "#fff";
  context.textAlign = "center";
  context.font = "600 15px PhiHybrid, sans-serif";
  fitText(context, entry.chart.title, 164, 15, 8);
  context.fillText(entry.chart.title, panelX + 95, panelY + 19);
  context.textAlign = "left";

  context.fillStyle = "#fff";
  context.font = "700 23px PhiHybrid, sans-serif";
  fitText(context, number.format(entry.record.score), 111, 23, 13);
  context.fillText(number.format(entry.record.score), panelX + 50, panelY + 51);
  context.strokeStyle = "rgba(255,255,255,.86)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(panelX + 45, panelY + 59);
  context.lineTo(panelX + 156, panelY + 59);
  context.stroke();
  context.fillStyle = "#fff";
  context.font = "500 13px PhiHybrid, sans-serif";
  context.fillText(`${entry.accuracy.toFixed(2)}%`, panelX + 54, panelY + 77);
  context.fillStyle = "rgba(255,255,255,.8)";
  context.font = "500 10px PhiHybrid, sans-serif";
  context.fillText(`RKS ${entry.singleRks.toFixed(4)}`, panelX + 54, panelY + 89);
  if (rankArt) drawRankIcon(context, rankArt, panelX + 7, panelY + 32, 43);
  else drawRankFallback(context, rank, panelX + 10, panelY + 67);
  context.restore();
};

async function paintB30(canvas: HTMLCanvasElement, model: B30Model, profile: Props["profile"], fetchedAt: string | null, charts: ChartRecord[], records: PhigrosCloudRecord[], cancelled: () => boolean) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const visibleEntries = visibleEntriesFor(model);
  const arts = await Promise.all(visibleEntries.map((entry) => loadArtwork(entry.chart.songId)));
  const rankArts = await Promise.all(visibleEntries.map((entry) => loadImage(rankAssets[rankForScore(entry.record.score, entry.record.fc)])));
  const backgroundArt = visibleEntries[0] ? await loadArtwork(visibleEntries[0].chart.songId, true) : null;
  const avatar = await loadAvatar(profile?.avatar ?? null);
  if (cancelled()) return;

  const rows = Math.max(1, Math.ceil(visibleEntries.length / 3));
  const analysisY = headerHeight + rows * rowHeight + 18;
  const canvasHeight = analysisY + analysisHeight + footerHeight;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#11151c";
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  if (backgroundArt) {
    context.save();
    context.globalAlpha = 0.42;
    context.filter = "blur(24px) brightness(.48) saturate(.8)";
    const scale = Math.max(canvasWidth / backgroundArt.width, canvasHeight / backgroundArt.height);
    const bw = backgroundArt.width * scale;
    const bh = backgroundArt.height * scale;
    context.drawImage(backgroundArt, (canvasWidth - bw) / 2, (canvasHeight - bh) / 2, bw, bh);
    context.restore();
  }
  context.fillStyle = "rgba(5,8,12,.42)";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  // PhiPlugin's B19 header: a black player strip, angled RKS badge, challenge badge and score summary.
  fillClipBox(context, 58, 28, 730, 82, "rgba(0,0,0,.58)", 0.3);
  if (avatar) drawCover(context, avatar, 58, 26, 92, 86, 0.3);
  else fillClipBox(context, 58, 28, 92, 82, "#263039", 0.3);
  context.fillStyle = "#fff";
  context.font = "600 28px PhiHybrid, sans-serif";
  const playerName = profile?.playerName || profile?.playerId || "PLAYER";
  fitText(context, playerName, 270, 28, 14);
  context.fillText(playerName, 180, 73);
  fillClipBox(context, 337, 58, 112, 27, "rgba(255,255,255,.95)", 0.3);
  context.fillStyle = "#101418";
  context.font = "600 18px PhiHybrid, sans-serif";
  drawCentered(context, profile?.rks == null ? "—" : profile.rks.toFixed(4), 337, 78, 112);
  const challenge = profile?.challengeModeRank == null ? "—" : String(profile.challengeModeRank % 100 || Math.floor(profile.challengeModeRank / 100));
  context.fillStyle = "#fff";
  context.font = "500 16px PhiHybrid, sans-serif";
  fillClipBox(context, 474, 47, 58, 38, "rgba(255,255,255,.96)", 0.3);
  context.fillStyle = "#11171a";
  context.font = "700 22px PhiHybrid, sans-serif";
  drawCentered(context, challenge, 474, 73, 58);
  context.fillStyle = "#fff";
  context.font = "500 15px PhiHybrid, sans-serif";
  context.fillText("Challenge", 548, 71);
  context.fillStyle = "rgba(255,255,255,.76)";
  context.font = "12px PhiHybrid, sans-serif";
  context.fillText(formatDate(profile?.updatedAt || fetchedAt), 180, 98);
  if (profile?.data) {
    fillClipBox(context, 58, 117, 192, 24, "rgba(0,0,0,.62)", 0.3);
    context.fillStyle = "rgba(255,255,255,.86)";
    context.font = "11px PhiHybrid, sans-serif";
    context.fillText(profile.data, 74, 133);
  }
  if (profile?.gameVersion) {
    fillClipBox(context, 490, 116, 126, 22, "rgba(255,170,100,.8)", 0.3);
    context.fillStyle = "#1a1512";
    context.font = "600 10px PhiHybrid, sans-serif";
    context.fillText(`${profile.gameVersion} current`, 505, 131);
  }

  const stats = buildStats(charts, records);
  fillClipBox(context, 844, 25, 296, 112, "rgba(0,0,0,.58)", 0.3);
  context.fillStyle = "#fff";
  context.font = "700 13px PhiHybrid, sans-serif";
  context.fillText("\\", 875, 48);
  stats.forEach((stat, index) => {
    const x = 915 + index * 52;
    context.fillStyle = "rgba(255,255,255,.86)";
    context.font = "600 11px PhiHybrid, sans-serif";
    drawCentered(context, stat.title, x - 17, 48, 34);
    context.font = "11px PhiHybrid, sans-serif";
    drawCentered(context, String(stat.cleared), x - 17, 70, 34);
    drawCentered(context, String(stat.fc), x - 17, 90, 34);
    drawCentered(context, String(stat.phi), x - 17, 110, 34);
  });
  context.fillStyle = "rgba(255,255,255,.8)";
  context.font = "10px PhiHybrid, sans-serif";
  context.fillText("C", 875, 70);
  context.fillText("FC", 870, 90);
  context.fillText("Phi", 868, 110);

  context.fillStyle = "rgba(255,255,255,.8)";
  context.font = "13px PhiHybrid, sans-serif";
  context.fillText("*B30 使用当前曲库定数计算；成绩顺序与 PhiPlugin 的 φ3 + B27 规则一致。", 70, 165);
  context.strokeStyle = "rgba(255,255,255,.35)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(34, 193);
  context.lineTo(canvasWidth - 34, 193);
  context.stroke();

  visibleEntries.forEach((entry, index) => paintCard(context, entry, index, model.phiEntries.length, index >= model.selectedEntries.length, arts[index], rankArts[index]));
  if (visibleEntries.length > model.selectedEntries.length) {
    const separatorY = headerHeight + Math.ceil(model.selectedEntries.length / 3) * rowHeight - 14;
    drawFlowSeparator(context, separatorY, "OVER FLOW");
  }
  paintAnalysis(context, analysisY, model, stats);
  context.fillStyle = "rgba(255,255,255,.78)";
  context.font = "24px PhiHybrid, sans-serif";
  context.textAlign = "center";
  context.shadowColor = "#00baff";
  context.shadowBlur = 12;
  context.fillText("PhiTarget", canvasWidth / 2, canvasHeight - 58);
  context.shadowBlur = 0;
  context.font = "11px PhiHybrid, sans-serif";
  context.fillText("B30 · browser generated", canvasWidth / 2, canvasHeight - 38);
  context.font = "9px PhiHybrid, sans-serif";
  context.fillText("*PhiTarget is an unofficial Phigros companion tool.", canvasWidth / 2, canvasHeight - 18);
  context.textAlign = "left";
}

export default function B30Generator({ charts, records, profile, fetchedAt, cloud, onLoaded, onAccountChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderVersion = useRef(0);
  const model = useMemo(() => buildB30Model(charts, records), [charts, records]);
  const visibleEntries = useMemo(() => visibleEntriesFor(model), [model]);
  const canvasHeight = headerHeight + Math.max(1, Math.ceil(visibleEntries.length / 3)) * rowHeight + 18 + analysisHeight + footerHeight;
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");

  useEffect(() => {
    if (!model.selectedEntries.length || !canvasRef.current) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    const version = ++renderVersion.current;
    setStatus("loading");
    void paintB30(canvasRef.current, model, profile, fetchedAt, charts, records, () => cancelled || renderVersion.current !== version).then(() => {
      if (!cancelled) setStatus("ready");
    });
    return () => { cancelled = true; };
  }, [charts, fetchedAt, model, profile, records]);

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
    <header className="feature-heading"><div><small>B30 / BEST 30 IMAGE</small><h1>在线生成 B30 图片</h1><p>按 PhiPlugin 的 φ3 + B27 顺序、斜切曲绘卡片和玩家统计栏在浏览器生成 PNG。</p></div><span className="feature-mark">30</span></header>
    <section className="b30-connect"><div><strong>{records.length ? "更新 B30 数据" : "输入 sessionToken 生成 B30"}</strong><small>玩家数据页与本页使用同一个当前账号；可选保存多个账号并切换。</small></div><CloudAccountPanel charts={charts} cloud={cloud} onLoaded={onLoaded} onAccountChange={onAccountChange} compact /></section>
    {!records.length ? <section className="b30-empty"><strong>还没有可用的云档成绩</strong><p>输入 sessionToken 后，PhiTarget 会在当前浏览器内计算单曲 RKS、φ3 + B27，并生成可下载的 B30 图片。</p></section> : <>
      <section className="b30-summary"><div><strong>{model.selectedEntries.length}</strong><small>已纳入成绩</small></div><div><strong>{model.b30Rks === null ? "—" : model.b30Rks.toFixed(4)}</strong><small>B30 RKS</small></div><div><strong>{profile?.rks === null || profile?.rks === undefined ? "—" : profile.rks.toFixed(4)}</strong><small>云档 RKS</small></div><div><strong>{model.overflowEntries.length}</strong><small>Overflow</small></div></section>
      <section className="b30-toolbar"><div><strong>{model.complete ? "B30 数据完整" : `当前只有 ${model.selectedEntries.length}/30 张可计算成绩`}</strong><small>{model.missingAccuracy ? `${model.missingAccuracy} 张成绩缺少 ACC，未计入 RKS。` : "φ3 + B27 · 当前曲库版本"}</small></div><button type="button" className="primary-action" disabled={status !== "ready"} onClick={download}>{status === "loading" ? "图片生成中…" : "下载 PNG"}</button></section>
      <section className="b30-canvas-wrap"><canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} aria-label="PhiTarget B30 成绩图片" /></section>
      <p className="b30-note">B30 排序和图内卡片结构按 PhiPlugin 的标准成绩图实现；单曲 RKS 使用公开社区公式，云档没有 ACC 的成绩不会计入。</p>
    </>}
  </main>;
}
