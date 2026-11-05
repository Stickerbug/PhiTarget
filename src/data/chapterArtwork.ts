/**
 * The chapter carousel uses the game's chapter artwork rather than the first
 * song in a chapter. These are small local WebP crops from the public
 * Phi-Score-Query chapter set, which keeps the carousel fast and gives the
 * special collections (Legacy and maimai, for example) their own artwork.
 */
const local = (index: number) => `/assets/chapter-cards/psq-${String(index).padStart(2, "0")}.webp`;

export const chapterArtwork: Record<string, string> = {
  all: local(1),
  "单曲精选集": local(0),
  "Chapter Legacy 过去的章节": local(25),
  "Chapter 5 霓虹灯牌": local(2),
  "Chapter 6 方舟蜃景": local(3),
  "Chapter 7 时钟链接": local(4),
  "Chapter 8 凌日潮汐": local(5),
  "Chapter 9 穹顶孤舟": local(30),
  "Side Story 1 忘忧宫": local(27),
  "Side Story 2 弭刻日": local(28),
  "Side Story 3 盗乐行": local(29),
  "Chapter Ex-Liminality 精选集": local(15),
  "Chapter Ex-maimai 精选集": local(16),
  "Chapter Ex-オンゲキ 精选集": local(24),
  "Chapter Ex-Immaculée Sekai 精选集": local(12),
  "Chapter Ex-EGTS 精选集": local(9),
  "Chapter Ex-Paradigm: Reboot 精选集": local(19),
  "Chapter Ex-Paradigm：Reboot 精选集": local(19),
  "Chapter Ex-CHUNITHM 精选集": local(8),
  "Chapter Ex-Rotaeno 精选集": local(21),
  "Chapter Ex-OverRapid 精选集": local(18),
  "Chapter Ex-茶鸣拾贰律 精选集": local(6),
  "Chapter Ex-姜米條 精选集": local(7),
  "Chapter Ex-Lanota 精选集": local(14),
  "Chapter Ex-KALPA 精选集": local(13),
  "Chapter Ex-Muse Dash 精选集": local(17),
  "Chapter Ex-WAVEAT 精选集": local(23),
  "Chapter Ex-GOOD 精选集": local(10),
  "Chapter Ex-HyuN 精选集": local(11),
  "Chapter Ex-Rising Sun Traxx": local(20),
  "Chapter Ex-SHINOBI SLASH 精选集": local(22),
  "极星卫": local(26),
  "Extra Story Chapter 极星卫": local(26),
};

export const chapterArtworkFor = (chapter: string, fallback: string) => chapterArtwork[chapter] ?? fallback;
