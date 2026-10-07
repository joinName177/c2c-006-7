import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import App from '../App.vue';

function mountApp() {
  return mount(App, { attachTo: document.body });
}

vi.stubGlobal('print', vi.fn());

describe('App 比较交互', () => {
  it('在结果页选两个方案后出现差距拆解，按年展示', async () => {
    const wrapper = mountApp();
    await wrapper.findAll('button').find((b) => b.text().includes('生成后悔预演'))!.trigger('click');
    await wrapper.vm.$nextTick();

    const selects = wrapper.findAll('.compare-picker select');
    expect(selects).toHaveLength(2);

    const selectable = (index: number) =>
      selects[index].findAll('option').filter((o) => {
        const value = o.attributes('value');
        return value && value !== '';
      });
    const first = selectable(0)[0].attributes('value');
    const second = selectable(1)[1].attributes('value');
    await selects[0].setValue(first);
    await selects[1].setValue(second);
    await wrapper.find('.compare-selects button').trigger('click');
    await wrapper.vm.$nextTick();

    const panel = wrapper.find('.compare-panel');
    expect(panel.exists()).toBe(true);
    const horizonHeaders = wrapper.findAll('.compare-horizons article > header h4');
    expect(horizonHeaders.map((h) => h.text())).toEqual(['1 年后', '5 年后', '10 年后']);
    const firstTable = wrapper.find('.compare-horizons article table');
    expect(firstTable.text()).toContain('不可逆成本');
    expect(firstTable.text()).toContain('舍入 / 截断余量');
    // 面板标注它绑定的分析编号，与结果页建议处一致
    const metaId = wrapper.find('.analysis-meta').text().match(/分析编号 (\S+)/)![1];
    expect(wrapper.find('.compare-foot').text()).toContain(metaId);
  });

  it('反转方向后差额符号精确反转', async () => {
    const wrapper = mountApp();
    await wrapper.findAll('button').find((b) => b.text().includes('生成后悔预演'))!.trigger('click');
    await wrapper.vm.$nextTick();

    const selects = wrapper.findAll('.compare-picker select');
    const selectable = (index: number) =>
      selects[index].findAll('option').filter((o) => {
        const value = o.attributes('value');
        return value && value !== '';
      });
    await selects[0].setValue(selectable(0)[0].attributes('value'));
    await selects[1].setValue(selectable(1)[1].attributes('value'));
    await wrapper.find('.compare-selects button').trigger('click');
    await wrapper.vm.$nextTick();

    const readDelta = () => {
      const text = wrapper.find('.compare-verdict b.favor-base, .compare-verdict b.favor-other').text();
      return Number.parseFloat(text);
    };
    const before = readDelta();
    await wrapper.findAll('.compare-controls button').find((b) => b.text().includes('反转'))!.trigger('click');
    await wrapper.vm.$nextTick();
    expect(readDelta()).toBeCloseTo(-before, 10);
  });

  it('同一方案提示无法比较，且不显示拆解面板', async () => {
    const wrapper = mountApp();
    await wrapper.findAll('button').find((b) => b.text().includes('生成后悔预演'))!.trigger('click');
    await wrapper.vm.$nextTick();
    const selects = wrapper.findAll('.compare-picker select');
    const value = selects[0].findAll('option').filter((o) => {
      const v = o.attributes('value');
      return v && v !== '';
    })[0].attributes('value');
    await selects[0].setValue(value);
    await selects[1].setValue(value);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.picker-hint').exists()).toBe(true);
    expect(wrapper.find('.compare-panel').exists()).toBe(false);
  });
});

