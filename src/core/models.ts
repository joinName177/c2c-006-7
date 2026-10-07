export const VALUE_KEYS = ['stability', 'growth', 'freedom', 'money'] as const;
export type ValueKey = (typeof VALUE_KEYS)[number];
export type ValueWeights = Record<ValueKey, number>;

export interface DecisionOption {
  id: string;
  name: string;
  description: string;
  impacts: ValueWeights;
  reversibility: number;
}
export interface DecisionDraft {
  id: string;
  title: string;
  background: string;
  options: DecisionOption[];
  weights: ValueWeights;
  updatedAt: string;
}

export type Horizon = 1 | 5 | 10;
export const HORIZONS: Horizon[] = [1, 5, 10];
/** 总分 = 1 年 30% + 5 年 40% + 10 年 30% */
export const HORIZON_WEIGHTS: Record<Horizon, number> = { 1: 0.3, 5: 0.4, 10: 0.3 };

/** 四个价值维度之外，可逆性是独立的第五个贡献项 */
export const REVERSIBILITY_KEY = 'reversibility' as const;
export type ContributionKey = ValueKey | typeof REVERSIBILITY_KEY;

export interface ComponentContribution {
  key: ContributionKey;
  label: string;
  kind: 'value' | 'reversibility';
  /** 未舍入贡献分（后悔分，越低越好） */
  raw: number;
  /** 四舍五入到 0.1 的展示值 */
  display: number;
}

export interface RegretPoint {
  horizon: Horizon;
  /** 整数展示分（曲线、总分卡使用） */
  score: number;
  /** 截断到 0–100 后、未舍入的精确分 */
  rawScore: number;
  /** 四个维度的展示拆解（向后兼容） */
  breakdown: ValueWeights;
  /** 全部贡献项（含不可逆成本），细项之和经余量行与 score 对账 */
  components: ComponentContribution[];
  /** 是否触发了 0/100 边界截断 */
  clamped: boolean;
  /** score − 各贡献展示值之和；独立舍入（及截断）造成的差额，使细项加总精确等于显示分 */
  roundingMargin: number;
}

export interface RehearsalCard {
  horizon: Horizon;
  regret: string;
  trigger: string;
  reversibility: string;
  action: string;
}
export interface OptionAnalysis {
  option: DecisionOption;
  points: RegretPoint[];
  cards: RehearsalCard[];
  /** 整数总分 */
  total: number;
  /** 精确总分（排序与比较差额的唯一依据） */
  totalRaw: number;
}

export interface DecisionAnalysis {
  /** 单次推演的唯一标识，比较与保存的报告都绑定到具体一次推演 */
  id: string;
  generatedAt: string;
  /** 由全部输入稳定算出的签名，用于辨认“这是哪次分析、基于什么输入” */
  inputSignature: string;
  options: OptionAnalysis[];
  recommendation: string;
  winnerId?: string;
  /** 前两名精确总分差小于显示半档（0.05），视为实质并列 */
  tied: boolean;
  notices: string[];
  /** 推演时使用的归一化权重快照 */
  weights: ValueWeights;
}

export interface ComponentDelta {
  key: ContributionKey;
  label: string;
  kind: 'value' | 'reversibility';
  baseRaw: number;
  otherRaw: number;
  baseDisplay: number;
  otherDisplay: number;
  /** 恒为 other − base；负数表示对照方案在该项更少后悔 */
  deltaRaw: number;
  deltaDisplay: number;
  /** 该项对哪一方有利（分数低者有利） */
  favors: 'base' | 'other' | 'none';
}

export interface ValueBasis {
  kind: 'value';
  key: ValueKey;
  label: string;
  baseImpact: number;
  otherImpact: number;
  /** 推演时归一化后的权重（百分数） */
  weightPct: number;
  /** 该时间跨度的时间系数 */
  timeFactor: number;
}
export interface ReversibilityBasis {
  kind: 'reversibility';
  label: string;
  baseReversibility: number;
  otherReversibility: number;
  coefficient: number;
  horizonFactor: number;
}
export type ComparisonBasis = ValueBasis | ReversibilityBasis;

export interface HorizonComparison {
  horizon: Horizon;
  baseScore: number;
  otherScore: number;
  baseRaw: number;
  otherRaw: number;
  deltaRaw: number;
  deltaDisplay: number;
  integerDelta: number;
  components: ComponentDelta[];
  bases: Record<ContributionKey, ComparisonBasis>;
  /** deltaDisplay − 各贡献 deltaDisplay 之和，舍入（及不对称截断）的对账行 */
  roundingMargin: number;
  /** 该时间跨度内方向相反且各自达到阈值的最大对抗项，用于强制呈现抵消 */
  offsetPair?: [ComponentDelta, ComponentDelta];
}

export type OptionComparisonStatus = 'pair' | 'same';

export interface OptionComparison {
  kind: 'pair';
  analysisId: string;
  baseId: string;
  otherId: string;
  baseName: string;
  otherName: string;
  /** 精确总分差小于 TIE_EPSILON：如实呈现为并列 */
  tied: boolean;
  totalBase: number;
  totalOther: number;
  deltaRaw: number;
  deltaDisplay: number;
  integerDelta: number;
  /** 整数总分相同但精确差达到并列阈值以上：整数显示正在掩盖小差异 */
  maskedByRounding: boolean;
  /** 精确差距小于 5 分，不做强结论 */
  close: boolean;
  horizons: HorizonComparison[];
  /** 各贡献按 30/40/30 汇总到总分层面的差额 */
  aggregate: ComponentDelta[];
  aggregateMargin: number;
  /** 优先解释：|Δ| 达到阈值的贡献中绝对差最大的两项 */
  highlights: ComponentDelta[];
  /** 总分层面方向相反且各自达阈值的最大对抗项 */
  offsetPair?: [ComponentDelta, ComponentDelta];
}

export interface SameOptionComparison {
  kind: 'same';
  analysisId: string;
  baseId: string;
}

export type ComparisonResult = OptionComparison | SameOptionComparison;

/** 保存到案例中的比较引用；完整依据随 analysis 一起保存 */
export interface SavedComparisonRef {
  baseId: string;
  otherId: string;
  analysisId: string;
  savedAt: string;
}

export interface SavedCase {
  draft: DecisionDraft;
  analysis?: DecisionAnalysis;
  comparison?: SavedComparisonRef;
}

export const VALUE_LABELS: Record<ValueKey, string> = {
  stability: '稳定',
  growth: '成长',
  freedom: '自由',
  money: '金钱',
};
export const CONTRIBUTION_LABELS: Record<ContributionKey, string> = {
  ...VALUE_LABELS,
  reversibility: '不可逆成本',
};
