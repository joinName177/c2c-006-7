import { normalizeWeights } from './weight-service';
import {
  CONTRIBUTION_LABELS,
  HORIZON_WEIGHTS,
  HORIZONS,
  REVERSIBILITY_KEY,
  VALUE_KEYS,
  VALUE_LABELS,
  type ComponentContribution,
  type ContributionKey,
  type DecisionOption,
  type Horizon,
  type OptionAnalysis,
  type RegretPoint,
  type RehearsalCard,
  type ValueKey,
  type ValueWeights,
} from './models';

/**
 * 时间系数：短期更看重稳定和金钱波动，长期更看重成长和自由的机会成本。
 */
export const TIME_FACTORS: Record<Horizon, Record<ValueKey, number>> = {
  1: { stability: 1.2, growth: 0.75, freedom: 0.8, money: 1.15 },
  5: { stability: 1, growth: 1, freedom: 1, money: 1 },
  10: { stability: 0.8, growth: 1.25, freedom: 1.2, money: 0.85 },
};

/** 不可逆成本系数：reversibility 为 0 且 10 年时贡献 8 分 */
export const IRREVERSIBILITY_COEFFICIENT = 0.08;

/** 展示半档：小于它的差异在整数口径下不可见 */
export const DISPLAY_HALF_STEP = 0.05;
/** 实质并列阈值：精确总分差小于 5 个百分点 */
export const CLOSE_GAP = 5;

export type NormalizedWeights = ValueWeights;

/** 四舍五入（round half up：半档按绝对值方向离开 0，对正负差对称） */
export function roundHalfUp(value: number, digits = 0): number {
  const factor = 10 ** digits;
  const rounded = Math.sign(value) * Math.round(Math.abs(value) * factor + Number.EPSILON) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 单个贡献项的原始贡献分。
 * 价值维度：(5 − impact) / 10 为未满足程度（0–1），再乘归一化权重与时间系数，
 * 权重按 0–100 百分数输入，因此整体落在 0–100 量纲。
 */
function valueContribution(
  option: DecisionOption,
  weights: NormalizedWeights,
  horizon: Horizon,
  key: ValueKey,
): number {
  const unmet = (5 - option.impacts[key]) / 10;
  return unmet * weights[key] * TIME_FACTORS[horizon][key];
}

function reversibilityContribution(option: DecisionOption, horizon: Horizon): number {
  return (100 - option.reversibility) * IRREVERSIBILITY_COEFFICIENT * (horizon / 10);
}

export function scorePoint(option: DecisionOption, weights: NormalizedWeights, horizon: Horizon): RegretPoint {
  const components: ComponentContribution[] = VALUE_KEYS.map((key) => {
    const raw = valueContribution(option, weights, horizon, key);
    return {
      key: key as ContributionKey,
      label: CONTRIBUTION_LABELS[key],
      kind: 'value' as const,
      raw,
      display: roundHalfUp(raw, 1),
    };
  });
  const reversibleRaw = reversibilityContribution(option, horizon);
  components.push({
    key: REVERSIBILITY_KEY,
    label: CONTRIBUTION_LABELS[REVERSIBILITY_KEY],
    kind: 'reversibility',
    raw: reversibleRaw,
    display: roundHalfUp(reversibleRaw, 1),
  });

  const rawTotal = components.reduce((sum, c) => sum + c.raw, 0);
  const rawScore = Math.max(0, Math.min(100, rawTotal));
  const clamped = rawTotal !== rawScore;
  const score = roundHalfUp(rawScore, 0);
  const roundingMargin = roundHalfUp(score - components.reduce((sum, c) => sum + c.display, 0), 1);

  const breakdown = Object.fromEntries(
    VALUE_KEYS.map((key) => [key, components.find((c) => c.key === key)!.display]),
  ) as ValueWeights;

  return { horizon, score, rawScore, breakdown, components, clamped, roundingMargin };
}

export function totalRawOf(points: RegretPoint[]): number {
  return HORIZONS.reduce((sum, h) => {
    const point = points.find((p) => p.horizon === h)!;
    return sum + point.rawScore * HORIZON_WEIGHTS[h];
  }, 0);
}

export function buildCards(
  option: DecisionOption,
  points: RegretPoint[],
  weights: NormalizedWeights,
): RehearsalCard[] {
  return points.map((p) => {
    // 该时间跨度后悔最大的维度（用原始贡献，不用展示值）
    const key = VALUE_KEYS.slice().sort((a, b) => {
      const ca = p.components.find((c) => c.key === a)!.raw;
      const cb = p.components.find((c) => c.key === b)!.raw;
      return cb - ca;
    })[0];
    const label = VALUE_LABELS[key];
    return {
      horizon: p.horizon,
      regret: `${p.horizon} 年后，你可能遗憾「${option.name}」没有更好照顾${label}。`,
      trigger: `当${label}需求持续得不到满足，后悔感可能升高。`,
      reversibility: option.reversibility >= 60 ? '仍有较大调整空间' : '改变成本可能随时间增加',
      action: `现在就为${label}设一个可检查的阶段目标。`,
    };
  });
}

export function scoreOption(option: DecisionOption, weights: NormalizedWeights): OptionAnalysis {
  const points = HORIZONS.map((h) => scorePoint(option, weights, h));
  const totalRaw = totalRawOf(points);
  return {
    option,
    points,
    cards: buildCards(option, points, weights),
    totalRaw,
    total: roundHalfUp(totalRaw, 0),
  };
}

export { normalizeWeights };
