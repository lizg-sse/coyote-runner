import type { InputCommand } from "./model";

/**
 * Keyboard and touch input. Swipes fire as soon as the finger travels the
 * threshold distance, not when it lifts, so phones feel as immediate as keys.
 */
const SWIPE_THRESHOLD_PX = 18;
const TAP_TOLERANCE_PX = 12;

const KEY_COMMANDS: Record<string, InputCommand> = {
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
  ArrowUp: "jump",
  w: "jump",
  W: "jump",
  " ": "jump",
  ArrowDown: "slide",
  s: "slide",
  S: "slide",
};

export function attachInput(target: HTMLElement, onCommand: (command: InputCommand) => void): () => void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let fired = false;

  function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    const command = KEY_COMMANDS[event.key];
    if (!command) return;
    event.preventDefault();
    onCommand(command);
  }

  function swipeCommand(dx: number, dy: number): InputCommand {
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
    return dy < 0 ? "jump" : "slide";
  }

  function onPointerDown(event: PointerEvent): void {
    if (pointerId !== null) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    fired = false;
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== pointerId || fired) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) return;
    fired = true;
    onCommand(swipeCommand(dx, dy));
  }

  function onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;
    if (!fired) {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= TAP_TOLERANCE_PX) onCommand(swipeCommand(dx, dy));
    }
    pointerId = null;
    fired = false;
  }

  function blockScroll(event: TouchEvent): void {
    event.preventDefault();
  }

  window.addEventListener("keydown", onKeyDown);
  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointerup", onPointerEnd);
  target.addEventListener("pointercancel", onPointerEnd);
  target.addEventListener("touchmove", blockScroll, { passive: false });

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("pointerdown", onPointerDown);
    target.removeEventListener("pointermove", onPointerMove);
    target.removeEventListener("pointerup", onPointerEnd);
    target.removeEventListener("pointercancel", onPointerEnd);
    target.removeEventListener("touchmove", blockScroll);
  };
}
