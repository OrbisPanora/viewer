// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DropZone from './DropZone.vue';

describe('DropZone', () => {
  it('emits the file dropped on it', async () => {
    const wrapper = mount(DropZone);
    const file = new File(['x'], 'world.zip');
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
    await wrapper.find('label').element.dispatchEvent(event);
    expect(wrapper.emitted('select')?.[0]).toEqual([file]);
  });

  it('emits only the first of several files', async () => {
    const wrapper = mount(DropZone);
    const first = new File(['a'], 'a.zip');
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [first, new File(['b'], 'b.zip')] },
    });
    wrapper.find('label').element.dispatchEvent(event);
    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('select')?.[0]).toEqual([first]);
  });

  it('ignores a drop while disabled', () => {
    const wrapper = mount(DropZone, { props: { disabled: true } });
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', { value: { files: [new File(['x'], 'w.zip')] } });
    wrapper.find('label').element.dispatchEvent(event);
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('keeps the file input in the page and accepts zip files', () => {
    const input = mount(DropZone).find('input[type="file"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes('accept')).toContain('.zip');
  });
});
