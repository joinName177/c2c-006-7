import {
  CONTRIBUTION_LABELS,
  HORIZON_WEIGHTS,
  HORIZONS,
  REVERSIBILITY_KEY,
  VALUE_KEYS,
  type ComparisonBasis,
  type ComponentDelta,
  type ContributionKey,
  type DecisionAnalysis,
  type HorizonComparison,
  type OptionAnalysis,
  type OptionComparison,
  type ComparisonResult,
  type ReversibilityBasis,
  type SameOptionComparison,
  type ValueBasis,
} from './models';
import {
  CLOSE_GAP,
  DISPLAY_HALF_STEP,
  IRREVERSIBILITY_COEFFICIENT,
  TIME_FACTORS,
  roundHalfUp,
} from './regret-engine';

/**
 * 比较口径（与展示半档、并列阈值共用同一套精度约定）：
 * - 所有差额一律  delta = other − base，精确值参与判定，展示统一四舍五入到 0.1；
 * - |deltaDisplay| >= MATERIAL_DELTA 的贡献才进入“优先解释”，
 *   小于它的差异只出现在完整列表里，不夸大为理由；
 * - 但正负两侧各自达标的最大对抗项必须成对呈现，不能因相互抵消而省略。
 */
export const MATERIAL_DELTA = 0.5;

function favorsOf(deltaRaw: number): ComponentDelta['favors'] {
  if (Math.abs(deltaRaw) < DISPLAY_HALF_STEP) return 'none';
  // 后悔分越低越好：other − base > 0 表示对照方案更差，对基准方案有利
  return deltaRaw > 0 ? 'base' : 'other';
}

function valueBasis(
  key: Exclude<ContributionKey, typeof REVERSIBILITY_KEY>,
  base: OptionAnalysis,
  other: OptionAnalysis,
  horizon: HorizonComparison['horizon'],
  analysis: DecisionAnalysis,
): ValueBasis {
  return {
    kind: 'value',
    key,
    label: CONTRIBUTION_LABELS[key],
    baseImpact: base.option.impacts[key],
    otherImpact: other.option.impacts[key],
    weightPct: analysis.weights[key],
    timeFactor: TIME_FACTORS[horizon][key],
  };
}

function reversibilityBasis(base: OptionAnalysis, other: OptionAnalysis, horizon: HorizonComparison['horizon']): ReversibilityBasis {
  return {
    kind: 'reversibility',
    label: '不可逆成本',
    baseReversibility: base.option.reversibility,
    otherReversibility: other.option.reversibility,
    coefficient: IRREVERSIBILITY_COEFFICIENT,
    horizonFactor: horizon / 10,
  };
}

function componentDeltas(
  base: OptionAnalysis,
  other: OptionAnalysis,
  horizon: HorizonComparison['horizon'],
  analysis: DecisionAnalysis,
): { deltas: ComponentDelta[]; bases: Record<ContributionKey, ComparisonBasis> } {
  const basePoint = base.points.find((p) => p.horizon === horizon)!;
  const otherPoint = other.points.find((p) => p.horizon === horizon)!;
  const bases = {} as Record<ContributionKey, ComparisonBasis>;

  const deltas: ComponentDelta[] = basePoint.components.map((bc) => {
    const oc = otherPoint.components.find((c) => c.key === bc.key)!;
    const deltaRaw = oc.raw - bc.raw;
    return {
      key: bc.key,
      label: bc.label,
      kind: bc.kind,
      baseRaw: bc.raw,
      otherRaw: oc.raw,
      baseDisplay: bc.display,
      otherDisplay: oc.display,
      deltaRaw,
      deltaDisplay: roundHalfUp(deltaRaw, 1),
      favors: favorsOf(deltaRaw),
    };
  });

  VALUE_KEYS.forEach((key) => {
    bases[key] = valueBasis(key, base, other, horizon, analysis);
  });
  bases[REVERSIBILITY_KEY] = reversibilityBasis(base, other, horizon);

  return { deltas, bases };
}

/** 正负两侧各自达标的最大项：它们解释“为什么毛额大、净额小”，任何一项都不能省略 */
function findOffsetPair(deltas: ComponentDelta[]): [ComponentDelta, ComponentDelta] | undefined {
  const material = deltas.filter((d) => Math.abs(d.deltaDisplay) >= MATERIAL_DELTA);
  const bestForBase = material
    .filter((d) => d.deltaRaw > 0)
    .sort((a, b) => Math.abs(b.deltaRaw) - Math.abs(a.deltaRaw))[0];
  const bestForOther = material
    .filter((d) => d.deltaRaw < 0)
    .sort((a, b) => Math.abs(b.deltaRaw) - Math.abs(a.deltaRaw))[0];
  return bestForBase && bestForOther ? [bestForBase, bestForOther] : undefined;
}

function compareHorizon(
  horizon: HorizonComparison['horizon'],
  base: OptionAnalysis,
  other: OptionAnalysis,
  analysis: DecisionAnalysis,
): HorizonComparison {
  const bp = base.points.find((p) => p.horizon === horizon)!;
  const op = other.points.find((p) => p.horizon === horizon)!;
  const { deltas, bases } = componentDeltas(base, other, horizon, analysis);
  const deltaRaw = op.rawScore - bp.rawScore;
  const deltaDisplay = roundHalfUp(deltaRaw, 1);
  // 舍入余量：让“各贡献展示差额之和 + 余量”精确等于展示差额
  const roundingMargin = roundHalfUp(
    deltaDisplay - deltas.reduce((sum, d) => sum + d.deltaDisplay, 0),
    1,
  );
  return {
    horizon,
    baseScore: bp.score,
    otherScore: op.score,
    baseRaw: bp.rawScore,
    otherRaw: op.rawScore,
    deltaRaw,
    deltaDisplay,
    integerDelta: op.score - bp.score,
    components: deltas.sort((a, b) => Math.abs(b.deltaRaw) - Math.abs(a.deltaRaw)),
    bases,
    roundingMargin,
    offsetPair: findOffsetPair(deltas),
  };
}

/** 30/40/30 汇总到总分层面的贡献差额（用原始值加权后再舍入，避免把舍入误差再加权） */
function aggregateDeltas(
  base: OptionAnalysis,
  other: OptionAnalysis,
): { deltas: ComponentDelta[]; margin: number } {
  const keys = base.points[0].components.map((c) => c.key);
  const deltas: ComponentDelta[] = keys.map((key) => {
    let br = 0;
    let or = 0;
    HORIZONS.forEach((h) => {
      const bc = base.points.find((p) => p.horizon === h)!.components.find((c) => c.key === key)!;
      const oc = other.points.find((p) => p.horizon === h)!.components.find((c) => c.key === key)!;
      br += bc.raw * HORIZON_WEIGHTS[h];
      or += oc.raw * HORIZON_WEIGHTS[h];
    });
    const first = base.points[0].components.find((c) => c.key === key)!;
    const deltaRaw = or - br;
    return {
      key,
      label: first.label,
      kind: first.kind,
      baseRaw: br,
      otherRaw: or,
      baseDisplay: roundHalfUp(br, 1),
      otherDisplay: roundHalfUp(or, 1),
      deltaRaw,
      deltaDisplay: roundHalfUp(deltaRaw, 1),
      favors: favorsOf(deltaRaw),
    };
  });
  const totalDeltaRaw = other.totalRaw - base.totalRaw;
  const margin = roundHalfUp(
    roundHalfUp(totalDeltaRaw, 1) - deltas.reduce((sum, d) => sum + d.deltaDisplay, 0),
    1,
  );
  return { deltas: deltas.sort((a, b) => Math.abs(b.deltaRaw) - Math.abs(a.deltaRaw)), margin };
}

/**
 * 比较两个方案。这是唯一的比较入口：
 * 切换方向不是重写一套理由，而是交换 baseId / otherId 后再次调用——
 * delta 恒为 other − base，符号、受益方、摘要全部随之精确反转。
 */
export function compareOptions(
  analysis: DecisionAnalysis,
  baseId: string,
  otherId: string,
): ComparisonResult {
  if (baseId === otherId) {
    return { kind: 'same', analysisId: analysis.id, baseId } satisfies SameOptionComparison;
  }
  const base = analysis.options.find((o) => o.option.id === baseId);
  const other = analysis.options.find((o) => o.option.id === otherId);
  if (!base || !other) {
    // 方案被删除时，调用方必须结束比较；这里只兜底返回“相同”空态，不编造差异
    return { kind: 'same', analysisId: analysis.id, baseId };
  }

  const horizons = HORIZONS.map((h) => compareHorizon(h, base, other, analysis));
  const { deltas: aggregate, margin: aggregateMargin } = aggregateDeltas(base, other);
  const deltaRaw = other.totalRaw - base.totalRaw;
  const tied = Math.abs(deltaRaw) < DISPLAY_HALF_STEP;
  const maskedByRounding =
    !tied && base.total === other.total && Math.abs(deltaRaw) >= DISPLAY_HALF_STEP;
  const material = aggregate.filter((d) => Math.abs(d.deltaDisplay) >= MATERIAL_DELTA);
  const highlights = material.slice(0, 2);

  return {
    kind: 'pair',
    analysisId: analysis.id,
    baseId,
    otherId,
    baseName: base.option.name,
    otherName: other.option.name,
    tied,
    totalBase: base.total,
    totalOther: other.total,
    deltaRaw,
    deltaDisplay: roundHalfUp(deltaRaw, 1),
    integerDelta: other.total - base.total,
    maskedByRounding,
    close: Math.abs(deltaRaw) < CLOSE_GAP,
    horizons,
    aggregate,
    aggregateMargin,
    highlights,
    offsetPair: findOffsetPair(aggregate),
  } satisfies OptionComparison;
}
