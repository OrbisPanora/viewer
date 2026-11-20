/**
 * Lets the benchmark script (`benchmarks/run.ts`) drive the viewer and read its numbers.
 *
 * It is only installed by `npm run dev` (see `ViewerView.vue`); the production build
 * contains none of it.
 */
import type { FrameLog, ViewerController, ViewerStats } from './viewerController';

/** What the benchmark script can call on `window.__orbisBench`. */
export interface BenchApi {
  /** Moves the camera to a block position. */
  moveTo(x: number, z: number): void;
  /** Sets the zoom factor. */
  setZoom(zoom: number): void;
  /** Current statistics. */
  stats(): ViewerStats;
  /** `true` when every chunk on screen is drawn or absent and no request runs. */
  settled(): boolean;
  /** Starts recording frames with an empty log. */
  startRecording(): void;
  /** Stops recording and returns what was recorded. */
  stopRecording(): FrameLog;
}

/** Where the hook is placed. */
export interface BenchTarget {
  __orbisBench?: BenchApi;
}

/**
 * Makes a viewer drivable from outside the page.
 *
 * @param viewer - The running viewer.
 * @param target - Object that receives `__orbisBench`; the window by default.
 */
export function installBenchHook(
  viewer: ViewerController,
  target: BenchTarget = window as unknown as BenchTarget,
): void {
  target.__orbisBench = {
    moveTo: (x, z) => viewer.moveCameraTo(x, z),
    setZoom: (zoom) => viewer.setCameraZoom(zoom),
    stats: () => viewer.stats(),
    settled: () => viewer.isSettled(),
    startRecording: () => viewer.recordFrames(true),
    stopRecording: () => {
      const log = viewer.takeFrameLog();
      viewer.recordFrames(false);
      return log;
    },
  };
}
