export const VALUE_KEYS=['stability','growth','freedom','money'] as const;
export type ValueKey=typeof VALUE_KEYS[number];
export type ValueWeights=Record<ValueKey,number>;
export interface DecisionOption{id:string;name:string;description:string;impacts:ValueWeights;reversibility:number}
export interface DecisionDraft{id:string;title:string;background:string;options:DecisionOption[];weights:ValueWeights;updatedAt:string}
export type Horizon=1|5|10;
export interface RegretPoint{horizon:Horizon;score:number;breakdown:ValueWeights;irreversibility:number;precise:number}
export interface RehearsalCard{horizon:Horizon;regret:string;trigger:string;reversibility:string;action:string}
export interface OptionAnalysis{option:DecisionOption;points:RegretPoint[];cards:RehearsalCard[];total:number}
export interface DecisionAnalysis{options:OptionAnalysis[];recommendation:string;winnerId?:string;notices:string[];weights:ValueWeights;analyzedAt:string}
export interface SavedCase{draft:DecisionDraft;analysis?:DecisionAnalysis;comparison?:OptionComparison}
export const VALUE_LABELS:Record<ValueKey,string>={stability:'稳定',growth:'成长',freedom:'自由',money:'金钱'};
// ---- 方案对比 ----
export type ComparisonLineKey=ValueKey|'irreversibility';
export interface ComparisonLine{key:ComparisonLineKey;label:string;a:number;b:number;diff:number}
export interface HorizonComparison{horizon:Horizon;weight:number;lines:ComparisonLine[];diff:number;scoreA:number;scoreB:number}
export type ComparisonRelation='base-better'|'peer-better'|'tie'|'same';
export interface ExplainedLine extends ComparisonLine{horizon:Horizon;weighted:number;reason:string}
export interface OptionComparison{baseId:string;peerId:string;baseName:string;peerName:string;relation:ComparisonRelation;horizons:HorizonComparison[];totalDiff:number;preciseDiff:number;totalA:number;totalB:number;drivers:ExplainedLine[];offsets:ExplainedLine[];weights:ValueWeights;analyzedAt:string}
