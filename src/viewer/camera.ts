/**
 * The camera: where the viewer looks, how zoomed in it is, and how big the drawing area is.
 */
import {
  LEVEL_HEIGHT,
  screenDeltaToWorld,
  worldToIso,
  type ScreenPoint,
  type Viewport,
  type WorldPoint,
} from './projection';

/** Smallest zoom factor: the world appears at a tenth of its size. */
export const MIN_ZOOM = 0.1;
/** Largest zoom factor. */
export const MAX_ZOOM = 2.5;

/** Camera state with the operations the input handlers need. */
export class Camera {
  /** Block X the camera looks at. */
  x = 0;
  /** Block Z the camera looks at. */
  z = 0;
  /** Zoom factor between {@link MIN_ZOOM} and {@link MAX_ZOOM}. */
  zoom = 1;
  /** Size of the drawing area in pixels. */
  viewport: Viewport = { width: 1, height: 1 };
  /** Increases on every change, so callers can tell cheaply whether anything moved. */
  version = 0;

  /**
   * Moves the camera to a world position.
   *
   * @param x - Block X.
   * @param z - Block Z.
   */
  moveTo(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.version++;
  }

  /**
   * Moves the camera by a world offset.
   *
   * @param dx - Blocks along X.
   * @param dz - Blocks along Z.
   */
  moveBy(dx: number, dz: number): void {
    this.moveTo(this.x + dx, this.z + dz);
  }

  /**
   * Moves the camera as a drag of the world under the pointer would.
   *
   * @param dx - Pointer movement in screen pixels, horizontally.
   * @param dy - Pointer movement in screen pixels, vertically.
   */
  dragBy(dx: number, dy: number): void {
    const delta = screenDeltaToWorld(dx, dy, this.zoom);
    // The world follows the pointer, so the camera moves the opposite way.
    this.moveBy(-delta.x, -delta.z);
  }

  /**
   * Multiplies the zoom, keeping it within bounds.
   *
   * @param factor - Above 1 zooms in, below 1 zooms out.
   */
  zoomBy(factor: number): void {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    if (next !== this.zoom) {
      this.zoom = next;
      this.version++;
    }
  }

  /**
   * Sets the zoom, keeping it within bounds.
   *
   * @param zoom - The wanted zoom factor.
   */
  setZoom(zoom: number): void {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    if (next !== this.zoom) {
      this.zoom = next;
      this.version++;
    }
  }

  /**
   * Records a new drawing area size.
   *
   * @param width - Width in pixels.
   * @param height - Height in pixels.
   */
  resize(width: number, height: number): void {
    this.viewport = { width: Math.max(1, width), height: Math.max(1, height) };
    this.version++;
  }

  /**
   * The camera's block position.
   *
   * @returns A world point.
   */
  get position(): WorldPoint {
    return { x: this.x, z: this.z };
  }

  /**
   * Computes where the layer that holds all chunks must sit on screen.
   *
   * The layer is scaled by {@link zoom}, so this is the position of its origin: the screen
   * centre, minus the camera's isometric position. The API normalises chunk heights to
   * the lowest surface it found, so terrain is shifted down by `surfaceY` levels to keep it
   * vertically centred.
   *
   * @param surfaceY - Surface height of the chunk under the camera.
   * @returns Position in screen pixels.
   */
  layerPosition(surfaceY: number): ScreenPoint {
    const iso = worldToIso(this.position);
    return {
      x: this.viewport.width / 2 - iso.x * this.zoom,
      y: this.viewport.height / 2 + (-iso.y + surfaceY * LEVEL_HEIGHT) * this.zoom,
    };
  }
}
