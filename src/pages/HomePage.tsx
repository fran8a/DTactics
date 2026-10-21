import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Plus, Users, Radio, Move } from "lucide-react";
import { configured, createBoard } from "../lib/api";
import { SocialLinks, Logo, Nickname } from "../components/Identity";
import LandingPitch from "../components/LandingPitch";
import ThemeToggle from "../components/ThemeToggle";
import GuideBalls from "../components/GuideBalls";
export default function Home() {
  const layout = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const resize = () => {
      layout.current?.style.setProperty(
        "--pitch-scale",
        String(
          Math.min(
            1,
            window.innerWidth / 1400,
            Math.max(0.15, (window.innerHeight - 230) / 735),
          ),
        ),
      );
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const navigate = useNavigate(),
    [ask, setAsk] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [guideClick, setGuideClick] = useState(0);
  const [guideArrival, setGuideArrival] = useState(0);
  const [activeStep, setActiveStep] = useState(-1);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const b = await createBoard();
      navigate(`/p/${b.code}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="home">
      <div className="home-layout" ref={layout}>
        <header className="home-header">
          <Logo />
          <span className="header-tag">
            <i className="dot" /> FÚTBOL, ENTRE TODOS.
          </span>
          <div className="home-header-actions">
            <button
              type="button"
              className="nav-link"
              aria-controls="como-funciona"
              onClick={() => setGuideClick((click) => click + 1)}
            >
              Cómo se juega <ArrowUpRight size={16} />
            </button>
            <ThemeToggle />
          </div>
        </header>
        <main>
          <section className="hero">
            <div className="hero-copy">
              <h1>
                Mucho potrero.
                <br />
                Un poco de
                <br />
                <em>estrategia.</em>
              </h1>
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
              <div className="hero-social-links">
                <SocialLinks />
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
              <span
                className="guide-announcement"
                role="status"
                aria-live="polite"
              >
                {activeStep >= 0 ? `Paso ${activeStep + 1} de 3` : ""}
              </span>
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
            ].map((item, index) => (
              <article
                className={`step ${activeStep === index ? "step-active" : ""}`}
                key={
                  activeStep === index ? `${item.n}-${guideArrival}` : item.n
                }
                aria-current={activeStep === index ? "step" : undefined}
              >
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
      </div>
      {guideClick > 0 && (
        <GuideBalls
          launches={guideClick}
          onArrival={(step) => {
            setActiveStep(step);
            setGuideArrival((count) => count + 1);
          }}
        />
      )}
      {ask && (
        <Nickname
          onClose={() => setAsk(false)}
          onDone={() => {
            setAsk(false);
            void create();
          }}
        />
      )}
    </div>
  );
}
