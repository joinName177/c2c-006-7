import { describe, expect, it } from 'vitest';
import {
  IRREVERSIBILITY_COEFFICIENT,
  TIME_FACTORS,
  roundHalfUp,
  scoreOption,
  scorePoint,
} from '../regret-engine';
import { normalizeWeights } from '../weight-service';
import {
  HORIZONS,
  REVERSIBILITY_KEY,
  VALUE_KEYS,
  type DecisionOption,
  type ValueWeights,
} from '../models';

const weights: ValueWeights = { stability: 30, growth: 35, freedom: 20, money: 15 };

function option(partial: Partial<DecisionOption> = {}): DecisionOption {
  return {
    id: partial.id ?? 'o',
    name: partial.name ?? '方案',
    description: '',
    impacts: partial.impacts ?? { stability: 0, growth: 0, freedom: 0, money: 0 },
    reversibility: partial.reversibility ?? 70,
  };
}

describe('roundHalfUp', () => {
  it('对称地处理正负半档', () => {
    expect(roundHalfUp(0.05, 1)).toBe(0.1);
    expect(roundHalfUp(-0.05, 1)).toBe(-0.1);
    expect(roundHalfUp(2.35, 1)).toBe(2.4);
    expect(roundHalfUp(2.5, 0)).toBe(3);
  });
});

describe('scorePoint', () => {
  it('分数保持在 0–100，且同一输入结果确定', () => {
    const w = normalizeWeights(weights);
    const a = scorePoint(option(), w, 1);
    const b = scorePoint(option(), w, 1);
    expect(a.score).toBe(b.score);
    expect(a.rawScore).toBeGreaterThanOrEqual(0);
    expect(a.rawScore).toBeLessThanOrEqual(100);
  });

  it('不可逆成本作为独立第五个贡献项进入拆解', () => {
    const p = scorePoint(option({ reversibility: 40 }), normalizeWeights(weights), 10);
    const rev = p.components.find((c) => c.key === REVERSIBILITY_KEY)!;
    expect(rev.kind).toBe('reversibility');
    expect(rev.raw).toBeCloseTo((100 - 40) * IRREVERSIBILITY_COEFFICIENT * 1, 10);
    expect(p.components).toHaveLength(5);
  });

  it('细项展示值加舍入余量必须精确等于显示整数分', () => {
    for (const h of HORIZONS) {
      const p = scorePoint(option({ reversibility: 33 }), normalizeWeights(weights), h);
      const sum = p.components.reduce((n, c) => n + c.display, 0);
      expect(roundHalfUp(sum + p.roundingMargin, 1)).toBeCloseTo(p.score, 10);
    }
  });

  it('短期更看重稳定/金钱，长期更看重成长/自由', () => {
    const w = normalizeWeights({ stability: 40, growth: 40, freedom: 10, money: 10 });
    const unstable = option({ impacts: { stability: -4, growth: 4, freedom: 0, money: -2 } });
    const p1 = scorePoint(unstable, w, 1);
    const p10 = scorePoint(unstable, w, 10);
    const stabilityRatio =
      p1.components.find((c) => c.key === 'stability')!.raw /
      p10.components.find((c) => c.key === 'stability')!.raw;
    const growthRatio =
      p1.components.find((c) => c.key === 'growth')!.raw /
      p10.components.find((c) => c.key === 'growth')!.raw;
    expect(stabilityRatio).toBeCloseTo(TIME_FACTORS[1].stability / TIME_FACTORS[10].stability, 10);
    expect(growthRatio).toBeCloseTo(TIME_FACTORS[1].growth / TIME_FACTORS[10].growth, 10);
    expect(stabilityRatio).toBeGreaterThan(1);
    expect(growthRatio).toBeLessThan(1);
  });

  it('极端负向输入触发截断并标记 clamped', () => {
    const allLow = option({ impacts: { stability: -5, growth: -5, freedom: -5, money: -5 }, reversibility: 0 });
    const p = scorePoint(allLow, normalizeWeights({ stability: 100, growth: 0, freedom: 0, money: 0 }), 1);
    expect(p.rawScore).toBe(100);
    expect(p.clamped).toBe(true);
    // 截断差额仍由余量行承担，账目依旧对得上
    const sum = p.components.reduce((n, c) => n + c.display, 0);
    expect(roundHalfUp(sum + p.roundingMargin, 1)).toBe(p.score);
  });
});

describe('scoreOption', () => {
  it('总分按 30/40/30 用精确点分加权，且排名可由 totalRaw 复算', () => {
    const result = scoreOption(option({ reversibility: 50 }), normalizeWeights(weights));
    const expected =
      result.points[0].rawScore * 0.3 + result.points[1].rawScore * 0.4 + result.points[2].rawScore * 0.3;
    expect(result.totalRaw).toBeCloseTo(expected, 10);
    expect(result.total).toBe(roundHalfUp(expected, 0));
    VALUE_KEYS.forEach(() => undefined);
  });
});
