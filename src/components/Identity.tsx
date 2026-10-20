import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useModalFocus } from "./useModalFocus";
export function SocialLinks() {
  return (
    <span className="social-links">
      <a
        className="github-credit"
        href="https://github.com/fran8a"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub de fran8a (abre en una pestaña nueva)"
        title="GitHub · fran8a"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 5 18.3 5.3 18.3 5.3c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z" />
        </svg>
      </a>
      <a
        className="github-credit"
        href="https://www.linkedin.com/in/fran-ochoa"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="LinkedIn de Fran Ochoa (abre en una pesta?a nueva)"
        title="LinkedIn ? Fran Ochoa"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M20.45 2H3.55C2.69 2 2 2.68 2 3.52v16.96c0 .84.69 1.52 1.55 1.52h16.9c.86 0 1.55-.68 1.55-1.52V3.52c0-.84-.69-1.52-1.55-1.52ZM7.93 18.75H4.98V9.2h2.95v9.55ZM6.45 7.9a1.71 1.71 0 1 1 0-3.42 1.71 1.71 0 0 1 0 3.42Zm12.3 10.85H15.8V14.1c0-1.11-.02-2.54-1.55-2.54-1.55 0-1.79 1.21-1.79 2.46v4.73H9.51V9.2h2.83v1.3h.04c.39-.74 1.36-1.52 2.79-1.52 2.98 0 3.58 1.96 3.58 4.51v5.26Z" />
        </svg>
      </a>
    </span>
  );
}
export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Bizarrón, inicio">
      bizarrón<span>®</span>
    </Link>
  );
}
export function Nickname({
  onDone,
  onClose,
}: {
  onDone: (name: string) => void;
  onClose: () => void;
}) {
  const modalRef = useModalFocus();
  const [name, setName] = useState("");
  return (
    <div
      className="overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nickname-title"
      >
        <span className="eyebrow">PRIMERO, LO PRIMERO</span>
        <h2 id="nickname-title">¿Cómo te dicen?</h2>
        <p>Con un apodo alcanza. Acá venimos a jugar.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (n) {
              localStorage.setItem("bizarron.nickname", n);
              onDone(n);
            }
          }}
        >
          <label>
            Tu nombre o apodo
            <input
              autoFocus
              required
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. El Colo"
            />
          </label>
          <button className="primary full">
            Entrar a la cancha <ArrowRight size={18} />
          </button>
        </form>
        <small>Es un nombre visible, sin verificación de identidad.</small>
      </section>
    </div>
  );
}
