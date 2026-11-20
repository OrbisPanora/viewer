// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { attachInput } from './inputController';

let element: HTMLElement;
let controller: AbortController;
let drag: Mock<(dx: number, dy: number) => void>;
let zoom: Mock<(factor: number) => void>;

/**
 * Dispatches a pointer event with the given fields.
 *
 * @param type - Event name.
 * @param fields - Extra properties of the event.
 */
function pointer(type: string, fields: Record<string, unknown> = {}): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { button: 0, pointerId: 1, clientX: 0, clientY: 0, ...fields });
  element.dispatchEvent(event);
}

/**
 * Dispatches a key press and reports whether the default action was prevented.
 *
 * @param key - The key value.
 * @param modifiers - Modifier flags.
 * @returns `true` if the handler called `preventDefault`.
 */
function press(key: string, modifiers: Record<string, boolean> = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...modifiers });
  element.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  element = document.createElement('div');
  Object.assign(element, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    focus: vi.fn(),
  });
  controller = new AbortController();
  drag = vi.fn<(dx: number, dy: number) => void>();
  zoom = vi.fn<(factor: number) => void>();
  attachInput(element, { drag, zoom }, controller.signal);
});

describe('attachInput', () => {
  it('starts with a grab cursor', () => {
    expect(element.style.cursor).toBe('grab');
  });

  it('reports the movement of a drag with the left button', () => {
    pointer('pointerdown', { clientX: 10, clientY: 20 });
    expect(element.style.cursor).toBe('grabbing');
    pointer('pointermove', { clientX: 15, clientY: 18 });
    pointer('pointermove', { clientX: 16, clientY: 30 });
    expect(drag.mock.calls).toEqual([
      [5, -2],
      [1, 12],
    ]);
    pointer('pointerup');
    expect(element.style.cursor).toBe('grab');
    pointer('pointermove', { clientX: 100, clientY: 100 });
    expect(drag).toHaveBeenCalledTimes(2);
  });

  it('captures the pointer and takes the focus', () => {
    pointer('pointerdown');
    expect(element.setPointerCapture).toHaveBeenCalledWith(1);
    expect(element.focus).toHaveBeenCalled();
  });

  it('ignores other buttons and moves without a press', () => {
    pointer('pointerdown', { button: 2 });
    pointer('pointermove', { clientX: 5 });
    pointer('pointerup');
    expect(drag).not.toHaveBeenCalled();
    expect(element.style.cursor).toBe('grab');
  });

  it('stops dragging on pointercancel', () => {
    pointer('pointerdown');
    pointer('pointercancel');
    pointer('pointermove', { clientX: 5 });
    expect(drag).not.toHaveBeenCalled();
    expect(element.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('zooms in on wheel up and out on wheel down, without scrolling the page', () => {
    const up = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    element.dispatchEvent(up);
    const down = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    element.dispatchEvent(down);
    expect(zoom.mock.calls[0]?.[0]).toBeCloseTo(1.1);
    expect(zoom.mock.calls[1]?.[0]).toBeCloseTo(1 / 1.1);
    expect(up.defaultPrevented && down.defaultPrevented).toBe(true);
  });

  it.each([
    ['ArrowUp', 0, 64],
    ['w', 0, 64],
    ['z', 0, 64],
    ['ArrowDown', 0, -64],
    ['s', 0, -64],
    ['ArrowLeft', 64, 0],
    ['q', 64, 0],
    ['a', 64, 0],
    ['ArrowRight', -64, 0],
    ['d', -64, 0],
  ])('moves the view for %s', (key, dx, dy) => {
    expect(press(key)).toBe(true);
    expect(drag).toHaveBeenCalledWith(dx === 0 ? -0 : dx, dy === 0 ? -0 : dy);
  });

  it('zooms with + = and -', () => {
    press('+');
    press('=');
    press('-');
    expect(zoom.mock.calls[0]?.[0]).toBeCloseTo(1.2);
    expect(zoom.mock.calls[1]?.[0]).toBeCloseTo(1.2);
    expect(zoom.mock.calls[2]?.[0]).toBeCloseTo(1 / 1.2);
  });

  it('leaves shortcuts with modifiers and other keys alone', () => {
    expect(press('w', { ctrlKey: true })).toBe(false);
    expect(press('d', { metaKey: true })).toBe(false);
    expect(press('a', { altKey: true })).toBe(false);
    expect(press('x')).toBe(false);
    expect(drag).not.toHaveBeenCalled();
    expect(zoom).not.toHaveBeenCalled();
  });

  it('removes every listener when the signal aborts', () => {
    controller.abort();
    pointer('pointerdown');
    pointer('pointermove', { clientX: 9 });
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }));
    press('w');
    expect(drag).not.toHaveBeenCalled();
    expect(zoom).not.toHaveBeenCalled();
  });
});
