import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Plus, Users, Radio, Move } from "lucide-react";
import { configured, createBoard } from "../lib/api";
import { Logo, Nickname } from "../components/Identity";
import LandingPitch from "../components/LandingPitch";
export default function Home() {
  const navigate = useNavigate(),
    [ask, setAsk] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      const b = await createBoard();
      navigate(`/board/${b.id}?access=${b.token}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="home">
      <header className="home-header">
        <Logo />
        <span className="header-tag">
          <i className="dot" /> FÚTBOL, ENTRE TODOS.
        </span>
        <a href="#como-funciona" className="nav-link">
          Cómo se juega <ArrowUpRight size={16} />
        </a>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="little-line" /> LA TÁCTICA SE ARMA EN EQUIPO
            </span>
            <h1>
              Mucho potrero.
              <br />
              Un poco de
              <br />
              <em>estrategia.</em>
            </h1>
            <p className="slogan">
              Donde se arman las mejores jugadas
              <br />
              (y las peores también).
            </p>
            <p className="description">
              Armá tu equipo, mové los jugadores y compartí la pizarra con los
              pibes. Todos editan en tiempo real.
            </p>
            <button
              className="primary hero-cta"
              disabled={busy || !configured}
              onClick={() =>
                localStorage.getItem("bizarron.nickname")
                  ? void create()
                  : setAsk(true)
              }
            >
              {busy ? "Preparando la cancha…" : "Crear tablero"}
              <ArrowUpRight size={21} />
            </button>
            <div className="no-registration">
              <Radio size={15} /> Gratis. Sin registro. Sin vueltas.
            </div>
            {!configured && (
              <p className="config-note">
                Falta conectar Supabase para abrir la cancha. Configurá las
                variables de <code>.env.example</code> siguiendo el README.
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
                <button className="text-button" onClick={() => void create()}>
                  Reintentar
                </button>
              </p>
            )}
          </div>
          <LandingPitch />
        </section>
        <section className="how" id="como-funciona">
          <div className="how-intro">
            <span className="eyebrow">DEL GRUPO A LA CANCHA</span>
            <h2>Tres pases y estamos.</h2>
          </div>
          {[
            {
              n: "01",
              icon: Plus,
              title: "Abrí la pizarra",
              text: "Poné tu apodo y creá un tablero. La cancha arranca en blanco.",
            },
            {
              n: "02",
              icon: Users,
              title: "Pasale el enlace a los pibes",
              text: "Un enlace para todos. Se suman desde el celu o la compu.",
            },
            {
              n: "03",
              icon: Move,
              title: "Armá la jugada",
              text: "Agreguen jugadores y muevan el equipo juntos, en tiempo real.",
            },
          ].map((item) => (
            <article className="step" key={item.n}>
              <div className="step-top">
                <item.icon size={22} />
                <span>{item.n}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </section>
      </main>
      <footer>
        <Logo />
        <span>Hecho para discutir el 4-3-3 con fundamento.</span>
        <span>EL FÚTBOL SE COMPARTE. ↗</span>
      </footer>
      {ask && (
        <Nickname
          onDone={() => {
            setAsk(false);
            void create();
          }}
        />
      )}
    </div>
  );
}
