// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '@/router';
import { envelope, jsonResponse, stubFetch } from '@/test-utils';

const viewer = vi.hoisted(() => ({
  create: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('@/viewer/viewerController', () => ({
  ViewerController: { create: viewer.create },
}));

const prepare = vi.hoisted(() => ({ prepareAtlas: vi.fn() }));
vi.mock('@/viewer/pack/prepare', () => prepare);

/** Stands in for the built atlas. */
const ATLAS = { image: new Blob([]), frames: {} };

import AboutView from './AboutView.vue';
import ApiDocsView from './ApiDocsView.vue';
import HomeView from './HomeView.vue';
import ViewerView from './ViewerView.vue';

/**
 * Mounts a view with a router and a store.
 *
 * @param view - The component.
 * @returns The wrapper and the router.
 */
async function mountView(view: Parameters<typeof mount>[0]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createAppRouter(createMemoryHistory());
  router.push('/');
  await router.isReady();
  const wrapper = mount(view, { global: { plugins: [pinia, router] }, attachTo: document.body });
  return { wrapper, router };
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  viewer.create.mockReset();
  viewer.destroy.mockReset();
  viewer.create.mockResolvedValue({ destroy: viewer.destroy });
  prepare.prepareAtlas.mockReset();
  prepare.prepareAtlas.mockResolvedValue(ATLAS);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('AboutView', () => {
  it('names the three parts', () => {
    const { wrapper } = { wrapper: mount(AboutView) };
    expect(wrapper.text()).toContain('lib');
    expect(wrapper.text()).toContain('api');
    expect(wrapper.text()).toContain('web');
  });
});

describe('ApiDocsView', () => {
  it('opens the API pages in a new tab without giving them the opener', () => {
    const links = mount(ApiDocsView).findAll('a');
    expect(links).toHaveLength(3);
    expect(links.map((a) => a.attributes('href'))).toEqual([
      expect.stringMatching(/\/docs$/),
      expect.stringMatching(/\/redoc$/),
      expect.stringMatching(/\/openapi\.json$/),
    ]);
    for (const link of links) {
      expect(link.attributes('target')).toBe('_blank');
      expect(link.attributes('rel')).toBe('noopener noreferrer');
    }
  });
});

describe('HomeView', () => {
  it('shows the drop zone and the size limit', async () => {
    const { wrapper } = await mountView(HomeView);
    expect(wrapper.find('input[type="file"]').exists()).toBe(true);
    expect(wrapper.text()).toMatch(/Maximum size/);
  });

  it('uploads a chosen file and opens the viewer', async () => {
    stubFetch(() => jsonResponse(envelope({})));
    const { wrapper, router } = await mountView(HomeView);
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1])], 'world.zip');
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/viewer');
  });

  it('shows the error and resets when the upload fails', async () => {
    stubFetch(() => jsonResponse({ detail: 'No level.dat' }, 400));
    const { wrapper } = await mountView(HomeView);
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1])], 'world.zip');
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    await flushPromises();
    expect(wrapper.find('dialog').text()).toContain('No level.dat');
    await wrapper.find('dialog').trigger('close');
    await flushPromises();
    expect(wrapper.find('dialog').exists()).toBe(false);
  });
});

describe('ViewerView', () => {
  it('starts the viewer over the first region when a world is loaded', async () => {
    stubFetch((request) =>
      request.url.includes('health')
        ? jsonResponse({ world_loaded: true })
        : jsonResponse(envelope({ region_list: [[1, -1]] })),
    );
    await mountView(ViewerView);
    await flushPromises();
    expect(viewer.create).toHaveBeenCalledTimes(1);
    expect(viewer.create.mock.calls[0]?.[0].startAt).toEqual({ x: 768, z: -256 });
  });

  it('prepares the block sprites before it calls the API and gives them to the viewer', async () => {
    const calls: string[] = [];
    prepare.prepareAtlas.mockImplementation(async () => {
      calls.push('atlas');
      return ATLAS;
    });
    stubFetch((request) => {
      calls.push('api');
      return request.url.includes('health')
        ? jsonResponse({ world_loaded: true })
        : jsonResponse(envelope({ region_list: [] }));
    });
    await mountView(ViewerView);
    await flushPromises();
    expect(calls[0]).toBe('atlas');
    expect(prepare.prepareAtlas.mock.calls[0]?.[0]).toBe('26.3');
    expect(viewer.create.mock.calls[0]?.[0].atlas).toBe(ATLAS);
  });

  it('shows the progress of the download while the sprites are prepared', async () => {
    let report: (label: string, done: number, total: number) => void = () => undefined;
    let finish: (value: typeof ATLAS) => void = () => undefined;
    prepare.prepareAtlas.mockImplementation(
      (_version: string, progress: typeof report) =>
        new Promise((done) => {
          report = progress;
          finish = done;
        }),
    );
    stubFetch(() => jsonResponse({ world_loaded: false }));
    const { wrapper } = await mountView(ViewerView);
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    report('Downloading block textures', 50, 200);
    await flushPromises();
    expect(wrapper.find('[role="status"]').text()).toContain('Downloading block textures');
    expect(wrapper.find('progress').attributes('value')).toBe('25');
    finish(ATLAS);
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('reports sprites that cannot be downloaded and does not call the API', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    prepare.prepareAtlas.mockRejectedValue(new Error('offline'));
    const requests = stubFetch(() => jsonResponse({ world_loaded: true }));
    const { wrapper } = await mountView(ViewerView);
    await flushPromises();
    expect(wrapper.find('dialog').text()).toContain('Cannot load the block textures');
    expect(wrapper.find('dialog').text()).toContain('Minecraft 26.3');
    expect(requests).toHaveLength(0);
    expect(viewer.create).not.toHaveBeenCalled();
  });

  it('starts without a start position when the region list is empty or fails', async () => {
    stubFetch((request) =>
      request.url.includes('health')
        ? jsonResponse({ world_loaded: true })
        : jsonResponse({ detail: 'x' }, 500),
    );
    await mountView(ViewerView);
    await flushPromises();
    expect(viewer.create.mock.calls[0]?.[0]).not.toHaveProperty('startAt');
  });

  it('asks for an upload when no world is loaded', async () => {
    stubFetch(() => jsonResponse({ world_loaded: false }));
    const { wrapper, router } = await mountView(ViewerView);
    await flushPromises();
    expect(wrapper.find('dialog').text()).toContain('No world loaded');
    expect(viewer.create).not.toHaveBeenCalled();
    await wrapper.find('dialog').trigger('close');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('says so when the API cannot be reached', async () => {
    vi.useFakeTimers();
    stubFetch(() => {
      throw new TypeError('offline');
    });
    const { wrapper } = await mountView(ViewerView);
    await vi.runAllTimersAsync();
    await flushPromises();
    vi.useRealTimers();
    expect(wrapper.find('dialog').text()).toContain('Cannot reach the API');
  });

  it('reports a viewer that fails to start', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    viewer.create.mockRejectedValue(new Error('no WebGL'));
    stubFetch(() => jsonResponse({ world_loaded: true, data: { region_list: [] } }));
    const { wrapper } = await mountView(ViewerView);
    await flushPromises();
    expect(wrapper.find('dialog').text()).toContain('Cannot start the viewer');
  });

  it('destroys the viewer when the page is left', async () => {
    stubFetch(() => jsonResponse({ world_loaded: true, data: { region_list: [] } }));
    const { wrapper } = await mountView(ViewerView);
    await flushPromises();
    wrapper.unmount();
    expect(viewer.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys a viewer that finished starting after the page was left', async () => {
    let resolve: (value: { destroy: () => void }) => void = () => undefined;
    viewer.create.mockReturnValue(new Promise((done) => (resolve = done)));
    stubFetch(() => jsonResponse({ world_loaded: true, data: { region_list: [] } }));
    const { wrapper } = await mountView(ViewerView);
    await flushPromises();
    wrapper.unmount();
    resolve({ destroy: viewer.destroy });
    await flushPromises();
    expect(viewer.destroy).toHaveBeenCalledTimes(1);
  });

  it('shows the debug numbers only when asked', async () => {
    stubFetch(() => jsonResponse({ world_loaded: true, data: { region_list: [] } }));
    const { wrapper } = await mountView(ViewerView);
    await flushPromises();
    expect(wrapper.find('dl').exists()).toBe(false);
    const onStats = viewer.create.mock.calls[0]?.[0].onStats as (value: unknown) => void;
    await wrapper.find('input[type="checkbox"]').setValue(true);
    onStats({
      cameraX: 0,
      cameraZ: 0,
      zoom: 1,
      visibleChunks: 1,
      cachedChunks: 1,
      loadingChunks: 0,
      missingChunks: 0,
      frameMsP50: 0,
      frameMsP95: 0,
      workMsP50: 0,
      workMsP95: 0,
      wantedMsP95: 0,
      buildMsP50: 0,
      buildMsP95: 0,
      tilemaps: 0,
      visibleTilemaps: 0,
      visibleTiles: 0,
      queuedChunks: 0,
      startedRequests: 0,
      abortedRequests: 0,
      failedRequests: 0,
      waitMsP50: 0,
      waitMsP95: 0,
      requestMsP50: 0,
      requestMsP95: 0,
      unknownBlocks: 0,
    });
    await flushPromises();
    expect(wrapper.find('dl').exists()).toBe(true);
  });
});
