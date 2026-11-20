// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

describe('main', () => {
  it('mounts the app in #app', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    await import('./main');
    await flushPromises();
    expect(document.querySelector('#app nav')).not.toBeNull();
  });
});
