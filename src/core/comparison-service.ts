import{HORIZON_WEIGHT,TIME_FACTOR}from'./analysis-service';import{VALUE_KEYS,VALUE_LABELS,type ComparisonLine,type DecisionAnalysis,type ExplainedLine,type Horizon,type HorizonComparison,type OptionComparison,type OptionAnalysis}from'./models';
// 舍入口径：细项保留 1 位小数；维度差 = A细项 − B细项（同为 0.1 精度，差无舍入）；
// 时间层差距 = 该层各细项差之和（与细项严格对得上）；
// 总差距 = 0.3×1年差 + 0.4×5年差 + 0.3×10年差，保留 1 位小数（可用展示值复算）；
// 排名与并列判断用未舍入精确分，整数总分相同也能暴露小差异。
const round1=(n:number)=>Math.round(n*10)/10;
const fmtImpact=(n:number)=>n>0?`+${n}`:`${n}`;
function reason(key:ComparisonLine['key'],horizon:Horizon,base:OptionAnalysis,peer:OptionAnalysis,weights:DecisionAnalysis['weights']):string{
if(key==='irreversibility')return`可逆性 ${base.option.reversibility}% vs ${peer.option.reversibility}%，${horizon} 年层不可逆成本随时间放大`;
return`影响判断 ${fmtImpact(base.option.impacts[key])} vs ${fmtImpact(peer.option.impacts[key])}，你的权重 ${weights[key]}%，${horizon} 年时间因子 ×${TIME_FACTOR[horizon][key]}`}
export function compareOptions(analysis:DecisionAnalysis,baseId:string,peerId:string):OptionComparison|undefined{
const base=analysis.options.find(o=>o.option.id===baseId);
const peer=analysis.options.find(o=>o.option.id===peerId);
if(!base||!peer)return undefined;
const meta={baseId,peerId,baseName:base.option.name,peerName:peer.option.name,weights:analysis.weights,analyzedAt:analysis.analyzedAt,totalA:base.total,totalB:peer.total};
if(baseId===peerId)return{...meta,relation:'same',horizons:[],totalDiff:0,preciseDiff:0,drivers:[],offsets:[]};
const horizons:HorizonComparison[]=base.points.map((p,i)=>{const q=peer.points[i];
const lines:ComparisonLine[]=VALUE_KEYS.map(k=>({key:k,label:VALUE_LABELS[k],a:p.breakdown[k],b:q.breakdown[k],diff:round1(p.breakdown[k]-q.breakdown[k])}));
lines.push({key:'irreversibility',label:'不可逆成本',a:p.irreversibility,b:q.irreversibility,diff:round1(p.irreversibility-q.irreversibility)});
return{horizon:p.horizon,weight:HORIZON_WEIGHT[p.horizon],lines,diff:round1(lines.reduce((n,l)=>n+l.diff,0)),scoreA:p.score,scoreB:q.score}});
const preciseDiff=base.points.reduce((n,p,i)=>n+(p.precise-peer.points[i].precise)*HORIZON_WEIGHT[p.horizon],0);
const totalDiff=round1(horizons.reduce((n,h)=>n+h.diff*h.weight,0));
const relation=Math.abs(preciseDiff)<1e-9?'tie':preciseDiff<0?'base-better':'peer-better';
const net=Math.sign(preciseDiff);
const explained:ExplainedLine[]=horizons.flatMap(h=>h.lines.map(l=>({...l,horizon:h.horizon,weighted:round1(l.diff*h.weight),reason:reason(l.key,h.horizon,base,peer,analysis.weights)}))).filter(l=>l.weighted!==0).sort((a,b)=>Math.abs(b.weighted)-Math.abs(a.weighted));
// 优先解释：对总差距贡献最大的前 3 条；抵消项（方向与净差距相反）全部保留，不得并入「其他」。
const drivers=explained.filter(l=>Math.sign(l.weighted)===net).slice(0,3);
const offsets=explained.filter(l=>Math.sign(l.weighted)===-net);
return{...meta,relation,horizons,totalDiff,preciseDiff,drivers,offsets}}
