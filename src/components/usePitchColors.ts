import { useMemo } from "react";
import { useTheme } from "../features/ThemeProvider";

const tokens = {
  grass: "--pitch-grass",
  line: "--pitch-line",
  name: "--pitch-name",
  benchName: "--bench-name",
  lockName: "--lock-name",
  teamA: "--team-a",
  teamB: "--team-b",
  mutedA: "--team-a-muted",
  mutedB: "--team-b-muted",
  inkA: "--team-a-ink",
  inkB: "--team-b-ink",
  ball: "--ball-paper",
  ballInk: "--ball-ink",
} as const;
export type PitchColors = Record<keyof typeof tokens, string>;

/** Canvas needs resolved CSS values; update its palette when the shared theme changes. */
export function usePitchColors(): PitchColors {
  const { theme } = useTheme();
  return useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      Object.entries(tokens).map(([key, token]) => [
        key,
        styles.getPropertyValue(token).trim(),
      ]),
    ) as PitchColors;
  }, [theme]);
}
