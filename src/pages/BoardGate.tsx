import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { enterBoard } from "../lib/api";
import { Logo, Nickname } from "../components/Identity";
import BoardPage from "./BoardPage";
export default function BoardGate() {
  const { id = "" } = useParams(),
    [params] = useSearchParams(),
    token = params.get("access") ?? "";
  const [name, setName] = useState(
      localStorage.getItem("bizarron.nickname") ?? "",
    ),
    [valid, setValid] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setValid(false);
    setError("");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{64}$/i.test(token)) {
      setError(
        "Enlace inválido. Pedí el enlace completo con su token de acceso.",
      );
      return;
    }
    void enterBoard(id, token)
      .then(() => {
        if (active) setValid(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, token, attempt]);
  if (error)
    return (
      <div className="status-page">
        <Logo />
        <AlertCircle size={36} />
        <h1>No pudimos abrir la cancha</h1>
        <p role="alert">{error}</p>
        <button className="secondary" onClick={() => setAttempt((a) => a + 1)}>
          Reintentar
        </button>
        <Link to="/">Volver al inicio</Link>
      </div>
    );
  if (!valid)
    return (
      <div className="status-page">
        <Logo />
        <div className="spinner" />
        <p>Validando el enlace…</p>
      </div>
    );
  if (!name) return <Nickname onDone={setName} />;
  return <BoardPage key={id} id={id} token={token} name={name} />;
}
