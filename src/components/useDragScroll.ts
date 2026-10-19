import { useEffect } from "react";
export function useDragScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let y = -1,
      frame = 0;
    const move = (e: PointerEvent) => {
      y = e.clientY;
    };
    const tick = () => {
      if (y >= 0) {
        const step = y < 55 ? -14 : y > innerHeight - 55 ? 14 : 0;
        if (step) window.scrollBy(0, step);
      }
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move);
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
    };
  }, [active]);
}
