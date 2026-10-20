import { Moon, Sun } from "lucide-react";
import { useTheme } from "../features/ThemeProvider";

export default function ThemeToggle({
  floating = false,
}: {
  floating?: boolean;
}) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Modo nocturno"
      title={dark ? "Activar modo claro" : "Activar modo nocturno"}
      className={`theme-toggle${floating ? " theme-toggle-floating" : ""}`}
      onClick={toggle}
    >
      {dark ? (
        <Sun size={17} aria-hidden="true" />
      ) : (
        <Moon size={17} aria-hidden="true" />
      )}
    </button>
  );
}
