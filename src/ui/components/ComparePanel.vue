<script setup lang="ts">
import{computed}from'vue';
import type{OptionAnalysis,OptionComparison}from'../../core/models';
import{VALUE_KEYS,VALUE_LABELS}from'../../core/models';
const props=defineProps<{options:OptionAnalysis[];comparison?:OptionComparison;base?:string;peer?:string}>();
const emit=defineEmits<{'update:base':[id:string];'update:peer':[id:string]}>();
const fmt=(n:number)=>n>0?`+${n.toFixed(1)}`:n<0?n.toFixed(1):'0.0';
const gapText=computed(()=>{const c=props.comparison;if(!c)return'';
if(Math.abs(c.totalDiff)===0)return'差距小于 0.1 分';
return`总差距 ${Math.abs(c.totalDiff).toFixed(1)} 分`});
const verdict=computed(()=>{const c=props.comparison;if(!c)return'';
if(c.relation==='same')return`这是同一个方案，所有维度差异为 0。`;
if(c.relation==='tie')return`两者完全并列：精确到未舍入分数，各时间层细项差均为 0。`;
const better=c.relation==='base-better'?c.baseName:c.peerName;
const worse=c.relation==='base-better'?c.peerName:c.baseName;
return`「${better}」比「${worse}」更不容易后悔，${gapText.value}。`});
const weightSnapshot=computed(()=>{const c=props.comparison;if(!c)return'';
return VALUE_KEYS.map(k=>`${VALUE_LABELS[k]} ${c.weights[k]}%`).join(' · ')});
function swap(){if(props.base&&props.peer){emit('update:base',props.peer);emit('update:peer',props.base)}}
</script>
<template>
<section class="compare-card">
<div class="curve-head"><div><span>HEAD-TO-HEAD</span><h3>方案对比 · 差距拆解</h3></div>
<div class="compare-selects">
<select :value="base" aria-label="基准方案" @change="emit('update:base',($event.target as HTMLSelectElement).value)"><option v-for="o in options" :key="o.option.id" :value="o.option.id">{{o.option.name}}</option></select>
<button class="swap" title="交换比较方向" @click="swap">⇄</button>
<select :value="peer" aria-label="对比方案" @change="emit('update:peer',($event.target as HTMLSelectElement).value)"><option v-for="o in options" :key="o.option.id" :value="o.option.id">{{o.option.name}}</option></select>
</div></div>
<p v-if="!comparison" class="compare-empty">选择两个方案后，这里会按 1 / 5 / 10 年拆解差距来源。</p>
<template v-else>
<p class="compare-meta">基于 {{new Date(comparison.analyzedAt).toLocaleString()}} 的分析 · 差 = 「{{comparison.baseName}}」−「{{comparison.peerName}}」，正值表示基准方案后悔更多</p>
<div class="compare-verdict" :data-relation="comparison.relation"><b>{{verdict}}</b><small>整数总分 {{comparison.totalA}} vs {{comparison.totalB}}（排名按未舍入精确分）</small></div>
<div v-for="h in comparison.horizons" :key="h.horizon" class="horizon-block">
<h4>{{h.horizon}} 年后 · 差距 {{fmt(h.diff)}} <small>（该层权重 {{h.weight*100}}%，整数分 {{h.scoreA}} vs {{h.scoreB}}）</small></h4>
<table><thead><tr><th>维度</th><th>{{comparison.baseName}}</th><th>{{comparison.peerName}}</th><th>差</th></tr></thead>
<tbody><tr v-for="l in h.lines" :key="l.key" :class="{favor:l.diff<0,against:l.diff>0}"><td>{{l.label}}</td><td>{{l.a.toFixed(1)}}</td><td>{{l.b.toFixed(1)}}</td><td>{{fmt(l.diff)}}</td></tr></tbody>
<tfoot><tr><td>合计</td><td></td><td></td><td>{{fmt(h.diff)}}</td></tr></tfoot></table>
</div>
<div v-if="comparison.drivers.length" class="explain-block"><h4>关键驱动 <small>按对总差距的贡献排序，优先解释</small></h4>
<ol><li v-for="d in comparison.drivers" :key="`${d.horizon}-${d.key}`"><b>{{d.horizon}}年 · {{d.label}} {{fmt(d.weighted)}}</b><span>{{d.reason}}</span></li></ol></div>
<div class="explain-block offsets"><h4>相互抵消 <small>方向相反的优势，逐条列出、不并入「其他」</small></h4>
<p v-if="!comparison.offsets.length" class="compare-empty">没有与净差距方向相反的细项。</p>
<ol><li v-for="o in comparison.offsets" :key="`${o.horizon}-${o.key}`"><b>{{o.horizon}}年 · {{o.label}} {{fmt(o.weighted)}}</b><span>{{o.reason}}</span></li></ol></div>
<p class="compare-note">口径：细项保留 1 位小数；维度差 = 两方案细项相减；时间层差距 = 该层细项差之和；总差距 = 0.3×1年 + 0.4×5年 + 0.3×10年，可用上方展示值复算。权重快照：{{weightSnapshot}}。</p>
</template>
</section>
</template>
