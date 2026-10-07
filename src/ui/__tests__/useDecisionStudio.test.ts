import { describe, expect, it, vi } from 'vitest';
import { useDecisionStudio } from '../useDecisionStudio';
import type { SavedCase } from '../../core/models';

function memoryRepository() {
  let store: SavedCase[] = [];
  return {
    list: vi.fn(() => store),
    save: vi.fn((value: SavedCase) => {
      store = [value, ...store.filter((c) => c.draft.id !== value.draft.id)];
    }),
    delete: vi.fn((id: string) => {
      store = store.filter((c) => c.draft.id !== id);
    }),
    _peek: () => store,
  };
}

function setup() {
  const repository = memoryRepository();
  const printer = { print: vi.fn() };
  const studio = useDecisionStudio(repository, printer);
  return { studio, repository, printer };
}

describe('useDecisionStudio 比较生命周期', () => {
  it('分析前不允许建立比较', () => {
    const { studio } = setup();
    studio.selectComparison(studio.draft.options[0].id, studio.draft.options[1].id);
    expect(studio.comparison.value).toBeUndefined();
  });

  it('推演后选择两个方案即建立比较，并绑定本次分析 id', () => {
    const { studio } = setup();
    studio.analyze();
    const [a, b] = studio.draft.options;
    studio.selectComparison(a.id, b.id);
    expect(studio.comparison.value).toMatchObject({ baseId: a.id, otherId: b.id });
    expect(studio.comparison.value!.analysisId).toBe(studio.analysis.value!.id);
  });

  it('反转方向只是交换两端，不产生第二种状态语义', () => {
    const { studio } = setup();
    studio.analyze();
    const [a, b] = studio.draft.options;
    studio.selectComparison(a.id, b.id);
    studio.swapComparison();
    expect(studio.comparison.value).toMatchObject({ baseId: b.id, otherId: a.id });
    expect(studio.comparison.value!.analysisId).toBe(studio.analysis.value!.id);
  });

  it('选择同一方案会结束比较', () => {
    const { studio } = setup();
    studio.analyze();
    const [a, b] = studio.draft.options;
    studio.selectComparison(a.id, b.id);
    studio.selectComparison(a.id, a.id);
    expect(studio.comparison.value).toBeUndefined();
  });

  it('删除比较中的方案立即结束失效比较', () => {
    const { studio } = setup();
    studio.analyze();
    const [a, b, c] = studio.draft.options;
    studio.selectComparison(a.id, b.id);
    studio.removeOption(b.id);
    expect(studio.comparison.value).toBeUndefined();
    // 不相关的删除不影响比较
    studio.selectComparison(a.id, c.id);
    studio.removeOption(b.id);
    expect(studio.comparison.value).toMatchObject({ baseId: a.id, otherId: c.id });
  });

  it('重新推演后续绑到新分析 id；若比较中的方案已不存在则结束比较', () => {
    const { studio } = setup();
    studio.analyze();
    const firstId = studio.analysis.value!.id;
    const [a, b] = studio.draft.options;
    studio.selectComparison(a.id, b.id);

    studio.touch();
    studio.analyze();
    expect(studio.comparison.value!.analysisId).not.toBe(firstId);
    expect(studio.comparison.value!.analysisId).toBe(studio.analysis.value!.id);

    const removedId = b.id;
    studio.removeOption(removedId);
    studio.analyze();
    expect(studio.comparison.value).toBeUndefined();
  });

  it('输入变化后标记过期，但比较仍指向上一次分析', () => {
    const { studio } = setup();
    studio.analyze();
    const [a, b] = studio.draft.options;
    studio.selectComparison(a.id, b.id);
    const boundId = studio.comparison.value!.analysisId;
    studio.updateOption(a.id, { reversibility: 30 });
    expect(studio.stale.value).toBe(true);
    expect(studio.comparison.value!.analysisId).toBe(boundId);
  });

  it('保存案例时保留比较对象及其分析依据，不只保存文字', () => {
    const { studio, repository } = setup();
    studio.analyze();
    const [a, b] = studio.draft.options;
    studio.selectComparison(a.id, b.id);
    studio.save();
    const saved = repository._peek()[0];
    expect(saved.comparison).toMatchObject({ baseId: a.id, otherId: b.id });
    expect(saved.analysis).toBeDefined();
    expect(saved.analysis!.id).toBe(saved.comparison!.analysisId);
  });

  it('加载含比较的案例时恢复比较；分析对不上时不恢复', () => {
    const { studio: one, repository } = setup();
    one.analyze();
    one.selectComparison(one.draft.options[0].id, one.draft.options[1].id);
    one.save();
    const item: SavedCase = JSON.parse(JSON.stringify(repository._peek()[0]));

    const { studio: two } = setup();
    two.load(item);
    expect(two.comparison.value).toBeDefined();
    expect(two.comparison.value!.baseId).toBe(item.comparison!.baseId);

    // 篡改绑定关系：比较引用了不存在的分析
    const broken: SavedCase = JSON.parse(JSON.stringify(item));
    broken.comparison!.analysisId = 'analysis-does-not-exist';
    two.load(broken);
    expect(two.comparison.value).toBeUndefined();
  });

  it('没有比较时保存的案例 comparison 缺省', () => {
    const { studio, repository } = setup();
    studio.analyze();
    studio.save();
    expect(repository._peek()[0].comparison).toBeUndefined();
  });

  it('结束比较后清除状态', () => {
    const { studio } = setup();
    studio.analyze();
    studio.selectComparison(studio.draft.options[0].id, studio.draft.options[1].id);
    studio.clearComparison();
    expect(studio.comparison.value).toBeUndefined();
  });
});
