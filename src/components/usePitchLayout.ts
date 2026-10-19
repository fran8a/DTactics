import { useLayoutEffect, useState, type RefObject } from "react";
import { fitPitch } from "../lib/pitchLayout";

export function usePitchLayout(
  container: RefObject<HTMLDivElement | null>,
  ready: boolean,
) {
  const [layout, setLayout] = useState(() => fitPitch(500, 600, false));
  useLayoutEffect(() => {
    const element = container.current;
    if (!element || !ready) return;
    const orientation = window.matchMedia("(orientation: landscape)");
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const next = fitPitch(width, height, orientation.matches);
      setLayout((previous) =>
        previous.canvasWidth === next.canvasWidth &&
        previous.horizontal === next.horizontal
          ? previous
          : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    orientation.addEventListener("change", measure);
    measure();
    return () => {
      observer.disconnect();
      orientation.removeEventListener("change", measure);
    };
  }, [container, ready]);
  return layout;
}
