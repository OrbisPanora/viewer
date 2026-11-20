// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import { createAppRouter } from '@/router';
import AppNav from './AppNav.vue';
import DebugOverlay from './DebugOverlay.vue';
import ErrorDialog from './ErrorDialog.vue';
import UploadProgress from './UploadProgress.vue';

describe('ErrorDialog', () => {
  it('opens as a modal and shows the title and message as text', () => {
    const showModal = vi.fn();
    HTMLDialogElement.prototype.showModal = showModal;
    const wrapper = mount(ErrorDialog, {
      props: { title: 'Upload failed', message: '<b>not html</b>' },
    });
    expect(showModal).toHaveBeenCalled();
    expect(wrapper.find('h2').text()).toBe('Upload failed');
    expect(wrapper.find('p').text()).toBe('<b>not html</b>');
    expect(wrapper.find('p b').exists()).toBe(false);
  });

  it('labels the button and emits close when the dialog closes', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    const wrapper = mount(ErrorDialog, {
      props: { title: 't', message: 'm', actionLabel: 'Back' },
    });
    expect(wrapper.find('button').text()).toBe('Back');
    await wrapper.find('dialog').trigger('close');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('labels the button Close by default', () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    expect(
      mount(ErrorDialog, { props: { title: 't', message: 'm' } })
        .find('button')
        .text(),
    ).toBe('Close');
  });
});

describe('UploadProgress', () => {
  it('shows a percentage bar', () => {
    const wrapper = mount(UploadProgress, { props: { label: 'Sending', sent: 25, total: 100 } });
    expect(wrapper.find('progress').attributes('value')).toBe('25');
    expect(wrapper.find('p').text()).toBe('Sending');
  });

  it('caps the percentage at 100', () => {
    const wrapper = mount(UploadProgress, { props: { label: 'x', sent: 500, total: 100 } });
    expect(wrapper.find('progress').attributes('value')).toBe('100');
  });

  it.each([
    [null, null],
    [10, null],
    [10, 0],
  ])('is indeterminate for sent=%s total=%s', (sent, total) => {
    const wrapper = mount(UploadProgress, { props: { label: 'x', sent, total } });
    expect(wrapper.find('progress').attributes('value')).toBeUndefined();
  });

  it('emits cancel', async () => {
    const wrapper = mount(UploadProgress, { props: { label: 'x', sent: 1, total: 2 } });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
});

describe('DebugOverlay', () => {
  it('shows nothing before the first report', () => {
    expect(
      mount(DebugOverlay, { props: { stats: null } })
        .find('dl')
        .exists(),
    ).toBe(false);
  });

  it('shows every number', () => {
    const wrapper = mount(DebugOverlay, {
      props: {
        stats: {
          cameraX: 1.234,
          cameraZ: -5,
          zoom: 1.5,
          visibleChunks: 12,
          cachedChunks: 30,
          loadingChunks: 2,
          missingChunks: 1,
        },
      },
    });
    const text = wrapper.text();
    expect(text).toContain('1.2, -5.0');
    expect(text).toContain('1.50');
    for (const value of ['12', '30', '2', '1']) expect(text).toContain(value);
  });
});

describe('AppNav', () => {
  it('links to every page', async () => {
    const router = createAppRouter(createMemoryHistory());
    router.push('/');
    await router.isReady();
    const wrapper = mount(AppNav, { global: { plugins: [router] } });
    expect(wrapper.findAll('a').map((a) => a.attributes('href'))).toEqual([
      '/',
      '/viewer',
      '/api-docs',
      '/about',
    ]);
  });
});
