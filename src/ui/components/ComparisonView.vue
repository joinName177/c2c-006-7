<script setup lang="ts">
import { computed } from 'vue';
import { compareOptions, MATERIAL_DELTA } from '../../core/compare-service';
import {
  VALUE_KEYS,
  type ComparisonResult,
  type ComponentDelta,
  type DecisionAnalysis,
  type HorizonComparison,
  type OptionComparison,
  type SavedComparisonRef,
} from '../../core/models';

const props = defineProps<{
  analysis: DecisionAnalysis;
  comparison?: SavedComparisonRef;
  stale: boolean;
}>();

const emit = defineEmits<{
  swap: [];
  clear: [];
}>();

const result = computed<ComparisonResult | undefined>(() => {
  if (!props.comparison) return undefined;
  return compareOptions(props.analysis, props.comparison.baseId, props.comparison.otherId);
});

const pair = computed<OptionComparison | undefined>(() =>
  result.value?.kind === 'pair' ? result.value : undefined,
);

/** 抵消对的毛额（两侧幅度之和）与对消后的净额，用于避免把净额误当“没有分歧” */
const offsetSums = computed(() => {
  const p = pair.value;
  if (!p?.offsetPair) return undefined;
  const [pro, con] = p.offsetPair;
  return {
    gross: Math.abs(pro.deltaRaw) + Math.abs(con.deltaRaw),
    net: Math.abs(pro.deltaRaw + con.deltaRaw),
    pro: Math.abs(pro.deltaDisplay),
    con: Math.abs(con.deltaDisplay),
  };
});

/** 比较绑定的分析与当前显示的分析不是同一次：必须标注，不假装仍然成立 */
const mismatched = computed(
  () => Boolean(props.comparison && pair.value && pair.value.analysisId !== props.analysis.id),
);

function signedText(value: number): string {
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function favorText(delta: ComponentDelta, names: { base: string; other: string }): string {
  if (delta.favors === 'none') return '双方持平';
  return delta.favors === 'base'
    ? `对「${names.base}」有利`
    : `对「${names.other}」有利`;
}

/** 细项依据：影响判断、权重、可逆性与时间系数，都从所绑定分析的快照取数 */
function basisLines(h: HorizonComparison, delta: ComponentDelta): string[] {
  const basis = h.bases[delta.key];
  if (basis.kind === 'value') {
    return [
      `影响判断（-5 ~ +5）：${pair.value!.baseName} ${basis.baseImpact}，${pair.value!.otherName} ${basis.otherImpact}`,
      `权重：${basis.weightPct}% ｜ ${h.horizon} 年时间系数：${basis.timeFactor}`,
    ];
  }
  return [
    `可逆性：${pair.value!.baseName} ${basis.baseReversibility}%，${pair.value!.otherName} ${basis.otherReversibility}%`,
    `系数：${basis.coefficient} × ${h.horizon}/10`,
  ];
}

function aggregateBasisLines(delta: ComponentDelta): string[] {
  if (delta.kind === 'reversibility') {
    return [
      `不可逆成本差距按 30% / 40% / 30% 汇总：${signedText(delta.deltaDisplay)} 分`,
      `算法：(100 − 可逆性) × 0.08 × h/10`,
    ];
  }
  const key = delta.key as (typeof VALUE_KEYS)[number];
  return [
    `影响判断（-5 ~ +5）：${pair.value!.baseName} ${basisImpact(pair.value!, key, 'base')}，${pair.value!.otherName} ${basisImpact(pair.value!, key, 'other')}`,
    `权重快照：${props.analysis.weights[key]}%（本次推演归一化后）`,
  ];
}

function basisImpact(p: OptionComparison, key: string, side: 'base' | 'other'): number {
  const id = side === 'base' ? p.baseId : p.otherId;
  const option = props.analysis.options.find((o) => o.option.id === id)!.option;
  return option.impacts[key as (typeof VALUE_KEYS)[number]];
}

</script>

<template>
  <section v-if="pair" class="compare-panel">
    <div class="compare-head">
      <span>SIDE BY SIDE</span>
      <h3>方案差距拆解</h3>
      <div class="compare-controls">
        <button type="button" @click="emit('swap')">⇄ 反转比较方向</button>
        <button type="button" @click="emit('clear')">结束比较</button>
      </div>
    </div>

    <p v-if="stale" class="compare-warning">
      输入已变化，以下比较基于上一次推演（{{ new Date(analysis.generatedAt).toLocaleString() }}），重新推演后才会更新。
    </p>
    <p v-else-if="mismatched" class="compare-warning">
      比较绑定的是另一次推演的结果，请重新推演后再依赖这些差额。
    </p>

    <!-- 总账：整数总分 + 精确差额，先把“差在哪、差多少”讲清楚 -->
    <div class="compare-summary">
      <div class="compare-names">
        <b>{{ pair.baseName }}</b>
        <em>对照</em>
        <b>{{ pair.otherName }}</b>
      </div>
      <template v-if="pair.tied">
        <p class="compare-verdict tie">两个方案精确总分差仅 {{ Math.abs(pair.deltaDisplay).toFixed(1) }} 分（＜0.05），实质并列；以下差额都不足以区分先后。</p>
      </template>
      <template v-else>
        <p class="compare-verdict">
          总分 <b>{{ pair.totalBase }}</b> 对 <b>{{ pair.totalOther }}</b>，精确差
          <b :class="pair.deltaRaw > 0 ? 'favor-base' : 'favor-other'">{{ signedText(pair.deltaRaw) }}</b>
          分（差额 = 对照 − 基准；正数表示「{{ pair.otherName }}」后悔分更高、对「{{ pair.baseName }}」有利）。
        </p>
        <p v-if="pair.maskedByRounding" class="compare-mask">
          整数总分看起来相同（整数差 {{ pair.integerDelta }}），但精确差为 {{ signedText(pair.deltaRaw) }} 分——整数口径正在掩盖这一小差异；排名以精确值为准。
        </p>
        <p v-else-if="pair.close" class="compare-mask">差距小于 5 分，模拟器不做强结论，建议据此补充信息。</p>
      </template>
    </div>

    <!-- 优先解释：达到阈值的最大贡献项先讲，微小差异不夸大为理由 -->
    <div v-if="!pair.tied && pair.highlights.length" class="compare-highlights">
      <h4>优先解释的差距来源</h4>
      <ul>
        <li v-for="d in pair.highlights" :key="d.key">
          <b>{{ d.label }}</b>：{{ signedText(d.deltaDisplay) }} 分，{{ favorText(d, { base: pair.baseName, other: pair.otherName }) }}。
        </li>
      </ul>
    </div>

    <!-- 抵消不能省略：毛额与净额都要交代，不能只写一个被对消后的小净额 -->
    <div v-if="!pair.tied && pair.offsetPair && offsetSums" class="compare-offset">
      <h4>差距是“抵消后”的净额，不是没有分歧</h4>
      <p>
        <b>{{ pair.offsetPair[0].label }}</b> 上「{{ pair.baseName }}」少 {{ offsetSums.pro.toFixed(1) }} 分后悔，
        <b>{{ pair.offsetPair[1].label }}</b> 上「{{ pair.otherName }}」少 {{ offsetSums.con.toFixed(1) }} 分；
        两侧毛额合计 {{ offsetSums.gross.toFixed(1) }} 分，方向相反相互对消，最终只净剩 {{ offsetSums.net.toFixed(1) }} 分。
      </p>
    </div>

    <!-- 按 1 / 5 / 10 年拆解 -->
    <div class="compare-horizons">
      <article v-for="h in pair.horizons" :key="h.horizon">
        <header>
          <h4>{{ h.horizon }} 年后</h4>
          <span :class="h.deltaRaw > 0 ? 'favor-base' : h.deltaRaw < 0 ? 'favor-other' : ''">
            差 {{ signedText(h.deltaRaw) }}
          </span>
          <small>{{ h.baseScore }} → {{ h.otherScore }}（整数差 {{ h.integerDelta > 0 ? '+' : '' }}{{ h.integerDelta }}）</small>
        </header>

        <table>
          <thead>
            <tr>
              <th>贡献项</th>
              <th>{{ pair.baseName }}</th>
              <th>差额</th>
              <th>{{ pair.otherName }}</th>
              <th>判断依据</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in h.components" :key="d.key" :class="{ muted: Math.abs(d.deltaDisplay) < MATERIAL_DELTA }">
              <th>{{ d.label }}</th>
              <td>{{ d.baseDisplay.toFixed(1) }}</td>
              <td class="delta" :class="d.favors === 'base' ? 'favor-base' : d.favors === 'other' ? 'favor-other' : ''">
                {{ signedText(d.deltaDisplay) }}
              </td>
              <td>{{ d.otherDisplay.toFixed(1) }}</td>
              <td class="basis"><details><summary>{{ favorText(d, { base: pair.baseName, other: pair.otherName }) }}</summary><p v-for="(line, i) in basisLines(h, d)" :key="i">{{ line }}</p></details></td>
            </tr>
            <tr class="margin-row">
              <th>舍入 / 截断余量</th>
              <td></td>
              <td>{{ signedText(h.roundingMargin) }}</td>
              <td></td>
              <td class="basis">细项展示值经四舍五入，加上本行后与展示差额精确一致</td>
            </tr>
          </tbody>
        </table>

        <p v-if="h.offsetPair" class="horizon-offset">
          此阶段存在抵消：{{ h.offsetPair[0].label }}（{{ Math.abs(h.offsetPair[0].deltaDisplay).toFixed(1) }}）
          与 {{ h.offsetPair[1].label }}（{{ Math.abs(h.offsetPair[1].deltaDisplay).toFixed(1) }}）方向相反。
        </p>
      </article>
    </div>

    <!-- 总分层面汇总，与最终排名对账 -->
    <div class="compare-aggregate">
      <h4>贡献项如何汇总成总分差额（30% / 40% / 30%）</h4>
      <table>
        <thead>
          <tr>
            <th>贡献项</th>
            <th>{{ pair.baseName }}</th>
            <th>差额</th>
            <th>{{ pair.otherName }}</th>
            <th>判断依据</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in pair.aggregate" :key="d.key" :class="{ muted: Math.abs(d.deltaDisplay) < MATERIAL_DELTA }">
            <th>{{ d.label }}</th>
            <td>{{ d.baseDisplay.toFixed(1) }}</td>
            <td class="delta" :class="d.favors === 'base' ? 'favor-base' : d.favors === 'other' ? 'favor-other' : ''">{{ signedText(d.deltaDisplay) }}</td>
            <td>{{ d.otherDisplay.toFixed(1) }}</td>
            <td class="basis"><details><summary>{{ favorText(d, { base: pair.baseName, other: pair.otherName }) }}</summary><p v-for="(line, i) in aggregateBasisLines(d)" :key="i">{{ line }}</p></details></td>
          </tr>
          <tr class="margin-row">
            <th>舍入 / 截断余量</th>
            <td></td>
            <td>{{ signedText(pair.aggregateMargin) }}</td>
            <td></td>
            <td class="basis">汇总贡献差额 + 余量 = {{ signedText(pair.deltaDisplay) }}（即总分精确差的展示值）</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="compare-foot">
      分析编号 {{ pair.analysisId }} ｜ 输入签名 {{ analysis.inputSignature }} ｜ 推演时间 {{ new Date(analysis.generatedAt).toLocaleString() }}
    </p>
  </section>
</template>
