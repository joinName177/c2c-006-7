import { describe, expect, it } from 'vitest';
import { analyzeDecision } from '../analysis-service';
import { compareOptions, MATERIAL_DELTA } from '../compare-service';
import { REVERSIBILITY_KEY, VALUE_KEYS, type DecisionDraft, type DecisionOption } from '../models';

function option(id: string, name: string, impacts: DecisionOption['impacts'], reversibility = 70): DecisionOption {
  return { id, name, description: '', impacts, reversibility };
}

function draftOf(options: DecisionOption[], weights = { stability: 25, growth: 25, freedom: 25, money: 25 }): DecisionDraft {
  return {
    id: 'case',
    title: '测试决策',
    background: '',
    options,
    weights,
    updatedAt: '2026-10-07T00:00:00.000Z',
  };
}

function analyze(options: DecisionOption[], weights?: DecisionDraft['weights']) {
  return analyzeDecision(draftOf(options, weights), {
    id: 'analysis-test',
    generatedAt: '2026-10-07T00:00:00.000Z',
  });
}

describe('compareOptions', () => {
  it('同一方案返回 same 空态，不编造差异', () => {
    const a = option('a', '甲', { stability: 0, growth: 0, freedom: 0, money: 0 });
    const result = compareOptions(analyze([a, option('b', '乙', { stability: 1, growth: 1, freedom: 1, money: 1 })]), 'a', 'a');
    expect(result.kind).toBe('same');
  });

  it('差额恒为 other − base，符号与受益方正确', () => {
    const a = option('a', '甲', { stability: 3, growth: 0, freedom: 0, money: 0 });
    const b = option('b', '乙', { stability: -3, growth: 0, freedom: 0, money: 0 });
    const analysis = analyze([a, b]);
    const ab = compareOptions(analysis, 'a', 'b');
    expect(ab.kind).toBe('pair');
    if (ab.kind !== 'pair') return;
    // b 的稳定更差 → 后悔分更高 → delta 为正 → 对 a（base）有利
    const stability = ab.horizons[1].components.find((c) => c.key === 'stability')!;
    expect(stability.deltaRaw).toBeGreaterThan(0);
    expect(stability.favors).toBe('base');
    ab.horizons.forEach((h) => expect(h.deltaRaw).toBeGreaterThan(0));
    expect(ab.deltaRaw).toBeGreaterThan(0);
  });

  it('反转方向不是重挑理由：每个差额精确变号，受益方互换', () => {
    const a = option('a', '甲', { stability: 3, growth: -2, freedom: 1, money: 0 }, 80);
    const b = option('b', '乙', { stability: -2, growth: 3, freedom: 0, money: 1 }, 50);
    const analysis = analyze([a, b]);
    const ab = compareOptions(analysis, 'a', 'b');
    const ba = compareOptions(analysis, 'b', 'a');
    if (ab.kind !== 'pair' || ba.kind !== 'pair') throw new Error('应为成对比较');

    expect(ba.deltaRaw).toBeCloseTo(-ab.deltaRaw, 10);
    expect(ba.deltaDisplay).toBe(-ab.deltaDisplay);
    expect(ba.baseId).toBe(ab.otherId);
    ab.horizons.forEach((h, i) => {
      const reversed = ba.horizons[i];
      expect(reversed.deltaRaw).toBeCloseTo(-h.deltaRaw, 10);
      expect(reversed.deltaDisplay).toBe(-h.deltaDisplay);
      h.components.forEach((c, j) => {
        expect(reversed.components[j].key).toBe(c.key);
        expect(reversed.components[j].deltaRaw).toBeCloseTo(-c.deltaRaw, 10);
        const rf = reversed.components[j].favors;
        if (c.favors === 'none') expect(rf).toBe('none');
        else expect(rf).toBe(c.favors === 'base' ? 'other' : 'base');
      });
    });
    ab.aggregate.forEach((c, j) => {
      expect(ba.aggregate[j].deltaRaw).toBeCloseTo(-c.deltaRaw, 10);
      expect(ba.aggregate[j].favors).toBe(c.favors === 'base' ? 'other' : c.favors === 'other' ? 'base' : 'none');
    });
  });

  it('各时间跨度细项差额加余量精确等于展示差额（细项、差额与排名对得上）', () => {
    const a = option('a', '甲', { stability: 2, growth: -1, freedom: 3, money: 0 }, 77);
    const b = option('b', '乙', { stability: -1, growth: 2, freedom: -2, money: 1 }, 43);
    const result = compareOptions(analyze([a, b]), 'a', 'b');
    if (result.kind !== 'pair') throw new Error('应为成对比较');
    result.horizons.forEach((h) => {
      const sum = h.components.reduce((n, c) => n + c.deltaDisplay, 0);
      expect(Math.round((sum + h.roundingMargin) * 10) / 10).toBeCloseTo(h.deltaDisplay, 10);
    });
    const aggSum = result.aggregate.reduce((n, c) => n + c.deltaDisplay, 0);
    expect(Math.round((aggSum + result.aggregateMargin) * 10) / 10).toBeCloseTo(result.deltaDisplay, 10);
  });

  it('完全相同的输入如实呈现为实质并列，tied 且无胜负措辞', () => {
    const a = option('a', '甲', { stability: 1, growth: 1, freedom: 1, money: 1 }, 60);
    const b = option('b', '乙', { stability: 1, growth: 1, freedom: 1, money: 1 }, 60);
    const result = compareOptions(analyze([a, b]), 'a', 'b');
    if (result.kind !== 'pair') throw new Error('相同方案的不同 id 仍应成对');
    expect(result.tied).toBe(true);
    expect(result.deltaRaw).toBe(0);
    expect(result.deltaDisplay).toBe(0);
    result.horizons.forEach((h) => expect(h.deltaRaw).toBe(0));
  });

  it('整数总分相同但精确差达到半档以上时，标记为被整数口径掩盖', () => {
    // 可逆性差 4 个百分点：总分差 4×.08×.53 ≈ 0.17，小于 0.5 个整数档但超过并列阈值
    const a = option('a', '甲', { stability: 0, growth: 0, freedom: 0, money: 0 }, 72);
    const b = option('b', '乙', { stability: 0, growth: 0, freedom: 0, money: 0 }, 68);
    const result = compareOptions(analyze([a, b]), 'a', 'b');
    if (result.kind !== 'pair') throw new Error('应为成对比较');
    expect(result.totalBase).toBe(result.totalOther);
    expect(result.maskedByRounding).toBe(true);
    expect(result.tied).toBe(false);
    expect(Math.abs(result.deltaRaw)).toBeGreaterThanOrEqual(0.05);
  });

  it('正负两侧的最大贡献被保留为抵消对，不会因净额小而省略', () => {
    // a 稳定强成长弱，b 稳定弱成长强；权重相等 → 总分接近但毛额巨大
    const a = option('a', '甲', { stability: 5, growth: -5, freedom: 0, money: 0 }, 70);
    const b = option('b', '乙', { stability: -5, growth: 5, freedom: 0, money: 0 }, 70);
    const result = compareOptions(analyze([a, b]), 'a', 'b');
    if (result.kind !== 'pair') throw new Error('应为成对比较');
    expect(result.offsetPair).toBeDefined();
    const [pro, con] = result.offsetPair!;
    const keys = [pro.key, con.key].sort();
    expect(keys).toEqual(['growth', 'stability']);
    expect(pro.deltaRaw * con.deltaRaw).toBeLessThan(0);
    expect(Math.abs(pro.deltaDisplay)).toBeGreaterThanOrEqual(MATERIAL_DELTA);
    expect(Math.abs(con.deltaDisplay)).toBeGreaterThanOrEqual(MATERIAL_DELTA);
  });

  it('细项依据同时连接影响判断、权重、时间系数与可逆性', () => {
    const a = option('a', '甲', { stability: 4, growth: 0, freedom: 0, money: 0 }, 80);
    const b = option('b', '乙', { stability: 0, growth: 0, freedom: 0, money: 0 }, 50);
    const analysis = analyze([a, b], { stability: 40, growth: 20, freedom: 20, money: 20 });
    const result = compareOptions(analysis, 'a', 'b');
    if (result.kind !== 'pair') throw new Error('应为成对比较');
    const h1 = result.horizons[0];
    const valueBasis = h1.bases.stability;
    expect(valueBasis.kind).toBe('value');
    if (valueBasis.kind !== 'value') return;
    expect(valueBasis.baseImpact).toBe(4);
    expect(valueBasis.otherImpact).toBe(0);
    expect(valueBasis.weightPct).toBe(40);
    expect(valueBasis.timeFactor).toBe(1.2);
    const revBasis = h1.bases[REVERSIBILITY_KEY];
    expect(revBasis.kind).toBe('reversibility');
    if (revBasis.kind !== 'reversibility') return;
    expect(revBasis.baseReversibility).toBe(80);
    expect(revBasis.otherReversibility).toBe(50);
  });

  it('优先解释只包含达到阈值的贡献，微小差异不被夸大为理由', () => {
    const a = option('a', '甲', { stability: 5, growth: 0, freedom: 0, money: 0 }, 70);
    const b = option('b', '乙', { stability: -5, growth: 0, freedom: 0, money: 0 }, 70);
    const result = compareOptions(analyze([a, b]), 'a', 'b');
    if (result.kind !== 'pair') throw new Error('应为成对比较');
    expect(result.highlights.length).toBeGreaterThan(0);
    expect(result.highlights.length).toBeLessThanOrEqual(2);
    result.highlights.forEach((d) => expect(Math.abs(d.deltaDisplay)).toBeGreaterThanOrEqual(MATERIAL_DELTA));
  });

  it('绑定分析 id，并在方案缺失时安全回退而不编造', () => {
    const a = option('a', '甲', { stability: 0, growth: 0, freedom: 0, money: 0 });
    const b = option('b', '乙', { stability: 1, growth: 1, freedom: 1, money: 1 });
    const analysis = analyze([a, b]);
    const valid = compareOptions(analysis, 'a', 'b');
    expect(valid.kind).toBe('pair');
    const missing = compareOptions(analysis, 'a', 'gone');
    expect(missing.kind).toBe('same');
    VALUE_KEYS.forEach(() => undefined);
  });
});
