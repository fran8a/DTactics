import { useSyncExternalStore } from "react";

export const mobileQuery =
  "(max-width: 760px), (max-width: 1024px) and (pointer: coarse)";
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
export function useMobileLayout() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(mobileQuery).matches,
    () => false,
  );
}
