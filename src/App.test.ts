// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { describe, expect, it } from 'vitest';
import App from './App.vue';
import { createAppRouter } from './router';

describe('App', () => {
  it('shows the navigation and the home page', async () => {
    const router = createAppRouter(createMemoryHistory());
    router.push('/');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } });
    await flushPromises();

    const links = wrapper.findAll('nav a').map((a) => a.text().trim());
    expect(links).toEqual(['OrbisPanora', 'Viewer', 'API', 'About']);
    expect(wrapper.find('h1').text()).toBe('OrbisPanora');
    expect(wrapper.find('input[type="file"]').exists()).toBe(true);
  });

  it('sends unknown paths to the home page', async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push('/does-not-exist');
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('does not use the /api path for a page, because the dev proxy owns it', () => {
    const paths = createAppRouter(createMemoryHistory())
      .getRoutes()
      .map((route) => route.path);
    expect(paths).not.toContain('/api');
  });
});
