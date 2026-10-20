import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function MobileOptions({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.querySelector<HTMLButtonElement>(
      ".mobile-options-toggle",
    );
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (
        !(event.target instanceof Element) ||
        event.target.closest('[role="dialog"]') !== panel.current
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        panel.current!.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ),
      ).filter((item) => item.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      requestAnimationFrame(() => {
        if (previous?.isConnected && !document.querySelector('[role="dialog"]'))
          previous.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <div
      className="mobile-options-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={panel}
        id="mobile-board-options"
        className="sidebar mobile-options-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Opciones del pizarrón"
      >
        <div className="mobile-options-heading">
          <h2>Opciones</h2>
          <button
            className="icon"
            aria-label="Cerrar opciones"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
