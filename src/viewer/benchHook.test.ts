import { describe, expect, it, vi } from 'vitest';
import { installBenchHook, type BenchTarget } from './benchHook';
import type { ViewerController } from './viewerController';

describe('installBenchHook', () => {
  it('passes every call to the viewer', () => {
    const log = { frames: [1], work: [], wanted: [], builds: [] };
    const viewer = {
      moveCameraTo: vi.fn(),
      setCameraZoom: vi.fn(),
      stats: vi.fn(() => ({ zoom: 1 })),
      isSettled: vi.fn(() => true),
      recordFrames: vi.fn(),
      takeFrameLog: vi.fn(() => log),
    } as unknown as ViewerController;
    const target: BenchTarget = {};
    installBenchHook(viewer, target);
    const hook = target.__orbisBench;
    expect(hook).toBeDefined();
    hook?.moveTo(3, 4);
    hook?.setZoom(0.5);
    expect(viewer.moveCameraTo).toHaveBeenCalledWith(3, 4);
    expect(viewer.setCameraZoom).toHaveBeenCalledWith(0.5);
    expect(hook?.stats()).toEqual({ zoom: 1 });
    expect(hook?.settled()).toBe(true);
    hook?.startRecording();
    expect(viewer.recordFrames).toHaveBeenLastCalledWith(true);
    expect(hook?.stopRecording()).toBe(log);
    expect(viewer.recordFrames).toHaveBeenLastCalledWith(false);
  });
});
