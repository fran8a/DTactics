import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useModalFocus } from "./useModalFocus";
export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Bizarrón, inicio">
      bizarrón<span>®</span>
    </Link>
  );
}
export function Nickname({ onDone }: { onDone: (name: string) => void }) {
  const modalRef = useModalFocus();
  const [name, setName] = useState("");
  return (
    <div className="overlay">
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
