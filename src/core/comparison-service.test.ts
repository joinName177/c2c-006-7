import{describe,expect,it}from'vitest';
import{analyzeDecision}from'./analysis-service';
import{compareOptions}from'./comparison-service';
import{createSampleDraft}from'./sample-data';
import type{DecisionDraft,DecisionOption}from'./models';
const opt=(id:string,impacts:DecisionOption['impacts'],reversibility:number):DecisionOption=>({id,name:id,description:'',impacts,reversibility});
const draft=(options:DecisionOption[]):DecisionDraft=>({id:'t',title:'t',background:'',weights:{stability:25,growth:25,freedom:25,money:25},updatedAt:'',options});
describe('compareOptions',()=>{
it('细项、时间层差距与总差距严格对账',()=>{
const a=analyzeDecision(createSampleDraft());
const c=compareOptions(a,a.options[0].option.id,a.options[1].option.id)!;
for(const h of c.horizons){
const sum=h.lines.reduce((n,l)=>n+l.diff,0);
expect(Math.abs(sum-h.diff)).toBeLessThan(1e-9)}
const weighted=c.horizons.reduce((n,h)=>n+h.diff*h.weight,0);
expect(Math.abs(weighted-c.totalDiff)).toBeLessThanOrEqual(0.05+1e-9)});
it('交换比较方向时所有差异取反、结论反转',()=>{
const a=analyzeDecision(createSampleDraft());
const[x,y]=[a.options[0].option.id,a.options[1].option.id];
const ab=compareOptions(a,x,y)!;const ba=compareOptions(a,y,x)!;
expect(ab.totalDiff).toBeCloseTo(-ba.totalDiff,10);
expect(ab.preciseDiff).toBeCloseTo(-ba.preciseDiff,10);
ab.horizons.forEach((h,i)=>{expect(h.diff).toBeCloseTo(-ba.horizons[i].diff,10);
h.lines.forEach((l,j)=>expect(l.diff).toBeCloseTo(-ba.horizons[i].lines[j].diff,10))});
const flip:Record<string,string>={'base-better':'peer-better','peer-better':'base-better',tie:'tie'};
expect(ba.relation).toBe(flip[ab.relation])});
it('相同方案如实呈现为 same',()=>{
const a=analyzeDecision(createSampleDraft());
const id=a.options[0].option.id;
const c=compareOptions(a,id,id)!;
expect(c.relation).toBe('same');
expect(c.totalDiff).toBe(0)});
it('完全并列如实呈现为 tie',()=>{
const a=analyzeDecision(draft([opt('x',{stability:1,growth:1,freedom:1,money:1},70),opt('y',{stability:1,growth:1,freedom:1,money:1},70)]));
const c=compareOptions(a,'x','y')!;
expect(c.relation).toBe('tie');
expect(c.totalDiff).toBe(0);
expect(c.drivers).toHaveLength(0);
expect(c.offsets).toHaveLength(0)});
it('整数总分相同也不掩盖小差异',()=>{
const a=analyzeDecision(draft([opt('x',{stability:0,growth:0,freedom:0,money:0},100),opt('y',{stability:0,growth:0,freedom:0,money:0},99)]));
const c=compareOptions(a,'x','y')!;
expect(c.totalA).toBe(c.totalB);
expect(c.relation).not.toBe('tie');
expect(Math.abs(c.preciseDiff)).toBeGreaterThan(0)});
it('抵消项全部保留且方向与净差距相反',()=>{
const a=analyzeDecision(createSampleDraft());
const c=compareOptions(a,a.options[0].option.id,a.options[1].option.id)!;
const net=Math.sign(c.preciseDiff);
const expected=c.horizons.flatMap(h=>h.lines.map(l=>Math.round(l.diff*h.weight*10)/10)).filter(w=>w!==0&&Math.sign(w)===-net).length;
expect(c.offsets).toHaveLength(expected);
for(const o of c.offsets)expect(Math.sign(o.weighted)).toBe(-net);
for(const d of c.drivers)expect(Math.sign(d.weighted)).toBe(net);
expect(c.drivers.length).toBeLessThanOrEqual(3)});
it('方案不存在时返回 undefined',()=>{
const a=analyzeDecision(createSampleDraft());
expect(compareOptions(a,'nope','alsonope')).toBeUndefined()})});
