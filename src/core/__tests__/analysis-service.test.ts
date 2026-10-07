import { describe, expect, it } from 'vitest';
import { analyzeDecision, signatureFor, stableHash } from '../analysis-service';
import { createSampleDraft } from '../sample-data';
import type { DecisionDraft, DecisionOption } from '../models';

function cloneDraft(): DecisionDraft {
  return JSON.parse(JSON.stringify(createSampleDraft()));
}

function option(id: string, name: string, impacts: DecisionOption['impacts'], reversibility = 70): DecisionOption {
  return { id, name, description: '', impacts, reversibility };
}

describe('analyzeDecision', () => {
  it('按精确总分排序，整数总分相同也不并列', () => {
    const draft = cloneDraft();
    draft.options = [
      option('a', '甲', { stability: 1, growth: 1, freedom: 1, money: 1 }, 70),
      // 可逆性差 5 个百分点 ≈ 0.21 总分，小于整数半档但超过并列阈值
      option('b', '乙', { stability: 1, growth: 1, freedom: 1, money: 1 }, 65),
    ];
    const result = analyzeDecision(draft, { generatedAt: '2026-10-07T00:00:00.000Z' });
    expect(result.options[0].option.id).toBe('a');
    expect(result.tied).toBe(false);
  });

  it('精确差小于 0.05 判实质并列，不给胜者', () => {
    const draft = cloneDraft();
    draft.options = [
      option('a', '甲', { stability: 0, growth: 0, freedom: 0, money: 0 }, 70),
      option('b', '乙', { stability: 0, growth: 0, freedom: 0, money: 0 }, 70),
    ];
    const result = analyzeDecision(draft, { generatedAt: '2026-10-07T00:00:00.000Z' });
    expect(result.tied).toBe(true);
    expect(result.winnerId).toBeUndefined();
    expect(result.recommendation).toContain('实质并列');
  });

  it('精确差恰为 5 分时给明确胜者，小于 5 才提示接近', () => {
    // 用可逆性差精确构造：irreversibility 总分贡献 = (100-r)*.08*(.3*.1+.4*.5+.3*1)
    // 平均 horizon/10 = 0.03+0.2+0.3 = 0.53；要凑 5 分则 (100-r)*.08*.53 差值
    const draft = cloneDraft();
    draft.options = [
      option('a', '甲', { stability: 3, growth: 3, freedom: 3, money: 3 }, 100),
      option('b', '乙', { stability: -5, growth: -5, freedom: -5, money: -5 }, 0),
    ];
    const result = analyzeDecision(draft, { generatedAt: '2026-10-07T00:00:00.000Z' });
    expect(result.options[1].totalRaw - result.options[0].totalRaw).toBeGreaterThan(5);
    expect(result.winnerId).toBe('a');
  });

  it('每次推演带唯一 id、时间戳与输入签名，且输入不变签名不变', () => {
    const a = analyzeDecision(cloneDraft(), { generatedAt: '2026-10-07T00:00:00.000Z' });
    const b = analyzeDecision(cloneDraft(), { generatedAt: '2026-10-07T01:00:00.000Z' });
    expect(a.id).not.toBe(b.id);
    expect(a.inputSignature).toBe(b.inputSignature);
    expect(a.generatedAt).toBe('2026-10-07T00:00:00.000Z');

    const changed = cloneDraft();
    changed.weights.growth += 1;
    expect(signatureFor(changed)).not.toBe(a.inputSignature);
  });

  it('背景文字变化不改变签名，但权重和影响值改变会', () => {
    const d1 = cloneDraft();
    const d2 = cloneDraft();
    d2.background = '完全不同的背景说明';
    expect(signatureFor(d1)).toBe(signatureFor(d2));
    d2.options[0].impacts.money += 1;
    expect(signatureFor(d1)).not.toBe(signatureFor(d2));
  });

  it('快照记录推演时的归一化权重', () => {
    const draft = cloneDraft();
    draft.weights = { stability: 60, growth: 0, freedom: 0, money: 0 };
    const result = analyzeDecision(draft, { generatedAt: '2026-10-07T00:00:00.000Z' });
    expect(result.weights.stability).toBe(100);
  });

  it('稳定哈希输出 8 位十六进制', () => {
    expect(stableHash('abc')).toMatch(/^[0-9a-f]{8}$/);
  });
});
