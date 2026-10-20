import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "bizarron.theme.v1";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(
  null,
);

function preference(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const selected = useRef(preference());

  function apply(next: Theme) {
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next === "dark" ? "#101814" : "#f5f5ed");
    setTheme(next);
  }

  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const followSystem = () => {
      if (!selected.current) apply(system.matches ? "dark" : "light");
    };
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      selected.current = preference();
      apply(selected.current ?? (system.matches ? "dark" : "light"));
    };
    followSystem();
    system.addEventListener("change", followSystem);
    window.addEventListener("storage", sync);
    return () => {
      system.removeEventListener("change", followSystem);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    selected.current = next;
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The toggle still works for this session when browser storage is unavailable.
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider is required.");
  return value;
}
