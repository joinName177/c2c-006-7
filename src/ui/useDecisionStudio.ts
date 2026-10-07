import { reactive, ref } from 'vue';
import { analyzeDecision, signatureFor } from '../core/analysis-service';
import { createSampleDraft } from '../core/sample-data';
import { validateDraft } from '../core/validation';
import type {
  DecisionAnalysis,
  DecisionDraft,
  DecisionOption,
  SavedCase,
  SavedComparisonRef,
  ValueWeights,
} from '../core/models';
import type { CaseRepository } from '../ports/case-repository.port';
import type { PrintPort } from '../ports/print.port';

export function useDecisionStudio(repository: CaseRepository, printer: PrintPort) {
  const draft = reactive<DecisionDraft>(createSampleDraft());
  const analysis = ref<DecisionAnalysis>();
  const errors = ref<string[]>([]);
  const stale = ref(false);
  const cases = ref<SavedCase[]>(repository.list());
  /** 比较只存引用；真实差额一律由 compareOptions 从所绑定的那次 analysis 派生 */
  const comparison = ref<SavedComparisonRef>();

  const touch = () => {
    stale.value = Boolean(analysis.value);
    draft.updatedAt = new Date().toISOString();
  };

  function setWeights(weights: ValueWeights) {
    draft.weights = { ...weights };
    touch();
  }

  function addOption() {
    if (draft.options.length >= 4) return;
    draft.options.push({
      id: `option-${Date.now()}`,
      name: '新选项',
      description: '',
      impacts: { stability: 0, growth: 0, freedom: 0, money: 0 },
      reversibility: 70,
    });
    touch();
  }

  /** 删除比较中的方案：失效比较立即结束，不留半截状态 */
  function endComparisonIfInvolves(id: string) {
    if (comparison.value && (comparison.value.baseId === id || comparison.value.otherId === id)) {
      comparison.value = undefined;
    }
  }

  function removeOption(id: string) {
    if (draft.options.length <= 2) return;
    endComparisonIfInvolves(id);
    draft.options = draft.options.filter((o) => o.id !== id);
    touch();
  }

  function updateOption(id: string, patch: Partial<DecisionOption>) {
    const target = draft.options.find((o) => o.id === id);
    if (target) Object.assign(target, patch);
    touch();
  }

  /** 同一毫秒内连续推演也要区分成不同的“次”：单调序号保证分析 id 唯一 */
  let runSeq = 0;

  function analyze() {
    errors.value = validateDraft(draft);
    if (errors.value.length) return;
    const generatedAt = new Date().toISOString();
    runSeq += 1;
    const next = analyzeDecision(draft, {
      generatedAt,
      id: `analysis-${signatureFor(draft)}-${runSeq.toString(36)}`,
    });
    analysis.value = next;
    stale.value = false;
    // 比较必须明确对应哪次分析：重新推演后只在两个方案仍存在时续绑到新分析
    if (comparison.value) {
      const exists = (id: string) => next.options.some((o) => o.option.id === id);
      comparison.value = exists(comparison.value.baseId) && exists(comparison.value.otherId)
        ? { ...comparison.value, analysisId: next.id, savedAt: generatedAt }
        : undefined;
    }
  }

  function selectComparison(baseId: string, otherId: string) {
    if (!analysis.value) return;
    if (baseId === otherId) {
      comparison.value = undefined;
      return;
    }
    const exists = (id: string) => analysis.value!.options.some((o) => o.option.id === id);
    if (!exists(baseId) || !exists(otherId)) return;
    comparison.value = {
      baseId,
      otherId,
      analysisId: analysis.value.id,
      savedAt: analysis.value.generatedAt,
    };
  }

  function swapComparison() {
    if (!comparison.value) return;
    const { baseId, otherId } = comparison.value;
    // 方向反转只交换两端；差额符号由核心纯函数负责，UI 不另写一套理由
    selectComparison(otherId, baseId);
  }

  function clearComparison() {
    comparison.value = undefined;
  }

  /** 保存的报告保留比较对象及其当时依据（分析快照随案例一起持久化） */
  function save() {
    repository.save({
      draft: JSON.parse(JSON.stringify(draft)),
      analysis: analysis.value,
      comparison: comparison.value
        ? JSON.parse(JSON.stringify(comparison.value))
        : undefined,
    });
    cases.value = repository.list();
  }

  function load(item: SavedCase) {
    Object.assign(draft, JSON.parse(JSON.stringify(item.draft)));
    analysis.value = item.analysis;
    stale.value = false;
    // 只恢复能在所保存分析中对得上的比较；旧版本案例（无 comparison）自然为空
    comparison.value =
      item.comparison &&
      item.analysis &&
      item.comparison.analysisId === item.analysis.id &&
      item.analysis.options.some((o) => o.option.id === item.comparison!.baseId) &&
      item.analysis.options.some((o) => o.option.id === item.comparison!.otherId)
        ? { ...item.comparison }
        : undefined;
  }

  function remove(id: string) {
    repository.delete(id);
    cases.value = repository.list();
  }

  return {
    draft,
    analysis,
    errors,
    stale,
    cases,
    comparison,
    touch,
    setWeights,
    addOption,
    removeOption,
    updateOption,
    analyze,
    selectComparison,
    swapComparison,
    clearComparison,
    save,
    load,
    remove,
    print: () => printer.print(),
  };
}
