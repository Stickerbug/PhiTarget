export type RoundingMode = "floor" | "nearest" | "ceil";

export type JudgementCounts = {
  perfect: number;
  good: number;
  bad: number;
  miss: number;
};

export type ScoreInput = JudgementCounts & {
  notes: number;
  maxCombo: number;
};

export type Rational = { numerator: bigint; denominator: bigint };

export type ScoreResult = {
  raw: Rational;
  display: bigint;
  confidence: "approximate" | "calibrated";
};

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x === 0n ? 1n : x;
}

export function rational(numerator: bigint, denominator: bigint): Rational {
  if (denominator <= 0n) throw new Error("Denominator must be positive");
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function validateScoreInput(input: ScoreInput): void {
  const values = [input.notes, input.perfect, input.good, input.bad, input.miss, input.maxCombo];
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error("Score counts must be non-negative integers");
  }
  if (input.notes <= 0) throw new Error("Notes must be greater than zero");
  if (input.perfect + input.good + input.bad + input.miss !== input.notes) {
    throw new Error("Perfect + Good + Bad + Miss must equal notes");
  }
  if (input.maxCombo > input.notes) throw new Error("Max Combo cannot exceed notes");
}

function rounded(raw: Rational, mode: RoundingMode): bigint {
  const q = raw.numerator / raw.denominator;
  const remainder = raw.numerator % raw.denominator;
  if (mode === "floor") return q;
  if (mode === "ceil") return remainder === 0n ? q : q + 1n;
  return remainder * 2n >= raw.denominator ? q + 1n : q;
}

export function roundGameScore(raw: Rational, mode: RoundingMode): bigint {
  return rounded(raw, mode);
}

export function normalRawScore(input: ScoreInput): Rational {
  validateScoreInput(input);
  const numerator = 900000n * BigInt(input.perfect) + 585000n * BigInt(input.good) + 100000n * BigInt(input.maxCombo);
  return rational(numerator, BigInt(input.notes));
}

export function challengeRawScore(input: JudgementCounts & { notes: number }): Rational {
  const scoreInput: ScoreInput = { ...input, maxCombo: 0 };
  validateScoreInput(scoreInput);
  const numerator = 1000000n * BigInt(input.perfect) + 650000n * BigInt(input.good);
  return rational(numerator, BigInt(input.notes));
}

export function score(input: ScoreInput, mode: RoundingMode = "nearest"): ScoreResult {
  const raw = normalRawScore(input);
  return { raw, display: roundGameScore(raw, mode), confidence: "approximate" };
}

export function challengeScore(input: JudgementCounts & { notes: number }, mode: RoundingMode = "nearest"): ScoreResult {
  const raw = challengeRawScore(input);
  return { raw, display: roundGameScore(raw, mode), confidence: "approximate" };
}

export function formatRational(raw: Rational, decimals = 3): string {
  const scale = 10n ** BigInt(decimals);
  const scaled = (raw.numerator * scale) / raw.denominator;
  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(decimals, "0");
  return `${whole}.${fraction}`;
}
