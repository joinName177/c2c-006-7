<script setup lang="ts">
import { ref, watch } from 'vue';
import type { DecisionAnalysis, SavedComparisonRef } from '../../core/models';
import RegretCurve from './RegretCurve.vue';
import ComparisonView from './ComparisonView.vue';

const props = defineProps<{
  analysis: DecisionAnalysis;
  stale: boolean;
  comparison?: SavedComparisonRef;
}>();

const emit = defineEmits<{
  compare: [baseId: string, otherId: string];
  swap: [];
  clearCompare: [];
}>();

// 两个下拉是“草稿选择”，本地暂存；只有点“生成拆解”才发出完整的一对
const baseId = ref(props.comparison?.baseId ?? '');
const otherId = ref(props.comparison?.otherId ?? '');
// 切换分析或结束比较时重置下拉
watch(
  () => [props.analysis.id, props.comparison?.baseId, props.comparison?.otherId],
  () => {
    baseId.value = props.comparison?.baseId ?? '';
    otherId.value = props.comparison?.otherId ?? '';
  },
);
const canCompare = () => Boolean(baseId.value && otherId.value && baseId.value !== otherId.value);

function onCompare() {
  if (canCompare()) emit('compare', baseId.value, otherId.value);
}
</script>

<template>
  <section class="results">
    <div v-if="stale" class="stale-note">输入已变化，下方是上一次分析结果，请重新计算。</div>

    <div class="recommendation">
      <span>THE LEAST REGRETFUL PATH</span>
      <h2>最不后悔建议</h2>
      <p>{{ analysis.recommendation }}</p>
      <small class="analysis-meta">
        分析编号 {{ analysis.id }} ｜ 输入签名 {{ analysis.inputSignature }} ｜
        推演时间 {{ new Date(analysis.generatedAt).toLocaleString() }}
      </small>
      <aside v-for="notice in analysis.notices" :key="notice">{{ notice }}</aside>
    </div>

    <RegretCurve :options="analysis.options" />

    <!-- 比较选择：选定两个方案后按 1/5/10 年拆解差距 -->
    <div class="compare-picker paper-panel-flat">
      <div>
        <span>COMPARE TWO PATHS</span>
        <h3>选两个方案，看差距到底来自哪里</h3>
      </div>
      <div class="compare-selects">
        <label>基准 A
          <select v-model="baseId">
            <option value="" disabled>选择方案…</option>
            <option v-for="o in analysis.options" :key="o.option.id" :value="o.option.id">{{ o.option.name }}</option>
          </select>
        </label>
        <b>对比</b>
        <label>对照 B
          <select v-model="otherId">
            <option value="" disabled>选择方案…</option>
            <option v-for="o in analysis.options" :key="o.option.id" :value="o.option.id">{{ o.option.name }}</option>
          </select>
        </label>
        <button type="button" :disabled="!canCompare" @click="onCompare">生成拆解</button>
      </div>
      <p v-if="baseId && otherId && baseId === otherId" class="picker-hint">基准与对照是同一方案，无法比较差距；如需对比请选两个不同方案。</p>
    </div>

    <ComparisonView
      :analysis="analysis"
      :comparison="comparison"
      :stale="stale"
      @swap="emit('swap')"
      @clear="emit('clearCompare')"
    />

    <div class="score-grid">
      <article v-for="(item, index) in analysis.options" :key="item.option.id">
        <span>#0{{ index + 1 }}</span>
        <h3>{{ item.option.name }}</h3>
        <b>{{ item.total }}<small>/100</small></b>
        <em v-if="analysis.winnerId === item.option.id" class="winner-tag">最不后悔</em>
        <div>
          <i v-for="p in item.points" :key="p.horizon">{{ p.horizon }}年 {{ p.score }}</i>
        </div>
        <details class="score-detail">
          <summary>评分细项与对账</summary>
          <div v-for="p in item.points" :key="p.horizon" class="point-breakdown">
            <b>{{ p.horizon }} 年 · 显示 {{ p.score }} 分</b>
            <table>
              <tbody>
                <tr v-for="c in p.components" :key="c.key">
                  <th>{{ c.label }}</th>
                  <td>{{ c.display.toFixed(1) }}</td>
                </tr>
                <tr>
                  <th>舍入 / 截断余量</th>
                  <td>{{ p.roundingMargin > 0 ? '+' : '' }}{{ p.roundingMargin.toFixed(1) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </article>
    </div>

    <div class="rehearsals">
      <article v-for="item in analysis.options" :key="item.option.id">
        <h3>{{ item.option.name }} · 后悔预演</h3>
        <div v-for="card in item.cards" :key="card.horizon">
          <b>{{ card.horizon }} 年后</b>
          <p>{{ card.regret }}</p>
          <small>{{ card.trigger }} {{ card.reversibility }}；{{ card.action }}</small>
        </div>
      </article>
    </div>
  </section>
</template>
