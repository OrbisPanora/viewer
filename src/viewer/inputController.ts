/**
 * Turns pointer, wheel and keyboard events on the canvas into camera commands.
 *
 * Every listener is registered with one `AbortSignal`, so removing all of them is a single
 * `abort()` and none can be left behind by a mismatch between add and remove.
 */

/** Commands the controller issues. */
export interface InputHandlers {
  /** The world moved by this many screen pixels (a pointer drag, or a key press). */
  drag: (dx: number, dy: number) => void;
  /** The user asked to zoom by this factor. */
  zoom: (factor: number) => void;
}

/** Zoom factor of one wheel notch or key press. */
const ZOOM_STEP = 1.1;
/** Screen pixels the view moves per key press. */
const KEY_PAN_PIXELS = 64;
/** Zoom factor of the + and - keys. */
const KEY_ZOOM_STEP = 1.2;

/**
 * Direction the view moves for each key, as `[right, down]` on screen. Both QWERTY (WASD)
 * and AZERTY (ZQSD) layouts work.
 */
const MOVE_KEYS: Readonly<Record<string, readonly [number, number]>> = {
  arrowup: [0, -1],
  w: [0, -1],
  z: [0, -1],
  arrowdown: [0, 1],
  s: [0, 1],
  arrowleft: [-1, 0],
  a: [-1, 0],
  q: [-1, 0],
  arrowright: [1, 0],
  d: [1, 0],
};

/**
 * Attaches input listeners to an element.
 *
 * @param element - The element that receives the events. It must be focusable so that
 *   keyboard events reach it, and it gets the focus when the user clicks it.
 * @param handlers - What to do for each kind of input.
 * @param signal - Removes every listener when aborted.
 */
export function attachInput(
  element: HTMLElement,
  handlers: InputHandlers,
  signal: AbortSignal,
): void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  element.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0) return;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      element.setPointerCapture(event.pointerId);
      element.focus({ preventScroll: true });
      element.style.cursor = 'grabbing';
    },
    { signal },
  );

  element.addEventListener(
    'pointermove',
    (event) => {
      if (!dragging) return;
      handlers.drag(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
    },
    { signal },
  );

  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    element.style.cursor = 'grab';
  };
  element.addEventListener('pointerup', endDrag, { signal });
  element.addEventListener('pointercancel', endDrag, { signal });

  // Not passive: the page must not scroll while the user zooms.
  element.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      handlers.zoom(event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP);
    },
    { signal, passive: false },
  );

  element.addEventListener(
    'keydown',
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const direction = MOVE_KEYS[key];
      if (direction) {
        event.preventDefault();
        // Moving the view right means the world slides left, hence the minus signs.
        handlers.drag(-direction[0] * KEY_PAN_PIXELS, -direction[1] * KEY_PAN_PIXELS);
      } else if (key === '+' || key === '=') {
        event.preventDefault();
        handlers.zoom(KEY_ZOOM_STEP);
      } else if (key === '-') {
        event.preventDefault();
        handlers.zoom(1 / KEY_ZOOM_STEP);
      }
    },
    { signal },
  );

  element.style.cursor = 'grab';
}
