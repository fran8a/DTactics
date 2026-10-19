import { pitchGeometry } from "./model";

/** Only display geometry: player coordinates always remain in the canonical pitch. */
export function fitPitch(width: number, height: number, landscape: boolean) {
  const fitScale = (horizontal: boolean) =>
    Math.max(
      0.001,
      Math.min(
        (width - 48) / (horizontal ? 1050 : 680),
        (height - 48) / (horizontal ? 680 : 1050),
      ),
    );
  const horizontal = landscape && fitScale(true) >= fitScale(false);
  const canvasWidth = (horizontal ? 1050 : 680) * fitScale(horizontal) + 48;
  return { horizontal, canvasWidth, ...pitchGeometry(canvasWidth, horizontal) };
}

export type PitchLayout = ReturnType<typeof fitPitch>;
