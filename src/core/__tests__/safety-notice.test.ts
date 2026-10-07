import { describe, expect, it } from 'vitest';
import { safetyNoticesFor } from '../safety-notice';

describe('safetyNoticesFor', () => {
  it('识别医疗/法律/投资中英文关键词', () => {
    expect(safetyNoticesFor('要不要接受这个治疗方案？').join()).toContain('医疗');
    expect(safetyNoticesFor('medical decision').join()).toContain('医疗');
    expect(safetyNoticesFor('这份合同能不能签？').join()).toContain('法律');
    expect(safetyNoticesFor('legal risk').join()).toContain('法律');
    expect(safetyNoticesFor('这笔理财风险高吗？').join()).toContain('投资');
    expect(safetyNoticesFor('investment plan').join()).toContain('投资');
  });

  it('普通决策不追加提示', () => {
    expect(safetyNoticesFor('要不要搬家去另一个城市？')).toEqual([]);
  });
});
