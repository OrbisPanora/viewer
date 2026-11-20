import { describe, expect, it } from 'vitest';
import { Camera, MAX_ZOOM, MIN_ZOOM } from './camera';

describe('Camera', () => {
  it('clamps the zoom to its bounds', () => {
    const camera = new Camera();
    camera.zoomBy(100);
    expect(camera.zoom).toBe(MAX_ZOOM);
    camera.zoomBy(1e-6);
    expect(camera.zoom).toBe(MIN_ZOOM);
  });

  it('changes its version only when something changed', () => {
    const camera = new Camera();
    camera.zoomBy(100);
    const version = camera.version;
    camera.zoomBy(100);
    expect(camera.version).toBe(version);
    camera.moveBy(1, 0);
    expect(camera.version).toBeGreaterThan(version);
  });

  it('moves opposite to a drag', () => {
    const camera = new Camera();
    camera.dragBy(32, 0);
    expect(camera.x).toBeLessThan(0);
    expect(camera.z).toBeGreaterThan(0);
  });

  it('centres the layer on screen when looking at the origin', () => {
    const camera = new Camera();
    camera.resize(800, 600);
    expect(camera.layerPosition(0)).toEqual({ x: 400, y: 300 });
  });

  it('shifts the layer down by the surface height', () => {
    const camera = new Camera();
    camera.resize(800, 600);
    expect(camera.layerPosition(3).y).toBe(300 + 3 * 16);
  });

  it('never has a viewport smaller than one pixel', () => {
    const camera = new Camera();
    camera.resize(0, -5);
    expect(camera.viewport).toEqual({ width: 1, height: 1 });
  });

  it('sets the zoom within its bounds and counts a change only when the zoom moves', () => {
    const camera = new Camera();
    const version = camera.version;
    camera.setZoom(100);
    expect(camera.zoom).toBe(MAX_ZOOM);
    camera.setZoom(0.0001);
    expect(camera.zoom).toBe(MIN_ZOOM);
    const changed = camera.version;
    camera.setZoom(MIN_ZOOM);
    expect(camera.version).toBe(changed);
    expect(changed).toBeGreaterThan(version);
  });
});
