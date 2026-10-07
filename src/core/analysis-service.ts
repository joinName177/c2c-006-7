import { normalizeWeights } from './weight-service';
import {
  CLOSE_GAP,
  DISPLAY_HALF_STEP,
  roundHalfUp,
  scoreOption,
} from './regret-engine';
import { safetyNoticesFor } from './safety-notice';
import {
  VALUE_KEYS,
  type DecisionAnalysis,
  type DecisionDraft,
  type ValueWeights,
} from './models';

/** 稳定的 32 位字符串哈希（FNV-1a），用于给输入与某次分析打指纹 */
export function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** 由全部会影响评分的输入生成签名；与展示性字段（背景说明等）无关 */
export function signatureFor(draft: DecisionDraft): string {
  const payload = JSON.stringify({
    w: VALUE_KEYS.map((k) => draft.weights[k]),
    o: draft.options.map((o) => [
      o.name,
      o.reversibility,
      VALUE_KEYS.map((k) => o.impacts[k]),
    ]),
  });
  return stableHash(payload);
}

export interface AnalysisMeta {
  /** 由调用方（界面/控制器）提供时间戳；核心层不读取系统时间 */
  generatedAt?: string;
  id?: string;
}

/**
 * 对一份草稿执行一次推演。结果不可变，并带唯一 id、时间戳与输入签名，
 * 让比较和保存的报告都能声明自己依据的是“哪一次分析”。
 */
export function analyzeDecision(draft: DecisionDraft, meta: AnalysisMeta = {}): DecisionAnalysis {
  const weights: ValueWeights = normalizeWeights(draft.weights);
  const inputSignature = signatureFor(draft);
  const generatedAt = meta.generatedAt ?? new Date(0).toISOString();
  const id = meta.id ?? `analysis-${stableHash(`${inputSignature}:${generatedAt}`)}`;

  const options = draft.options
    .map((option) => scoreOption(option, weights))
    .sort((a, b) => {
      if (a.totalRaw !== b.totalRaw) return a.totalRaw - b.totalRaw;
      if (a.option.name !== b.option.name) return a.option.name.localeCompare(b.option.name);
      return a.option.id.localeCompare(b.option.id);
    });

  const gap = options.length > 1 ? options[1].totalRaw - options[0].totalRaw : Infinity;
  // 并列与“接近”都用精确值判断，整数总分不再参与任何决策
  const tied = options.length > 1 && gap < DISPLAY_HALF_STEP;
  const close = options.length > 1 && gap < CLOSE_GAP;
  const winnerId = !tied && !close ? options[0].option.id : undefined;

  const leader = options[0].option.name;
  const runnerUp = options[1]?.option.name;
  const recommendation = tied
    ? `「${leader}」与「${runnerUp}」精确总分差不足 ${DISPLAY_HALF_STEP} 分，实质并列；调整一点权重或补充一条信息，顺序就可能改变。`
    : close
      ? `「${leader}」与「${runnerUp}」非常接近（精确差 ${roundHalfUp(gap, 1)} 分），建议补充信息后再决定。`
      : `目前看，「${leader}」是更不容易后悔的方向。`;

  return {
    id,
    generatedAt,
    inputSignature,
    options,
    recommendation,
    winnerId,
    tied,
    notices: safetyNoticesFor(`${draft.title} ${draft.background}`),
    weights,
  };
}
