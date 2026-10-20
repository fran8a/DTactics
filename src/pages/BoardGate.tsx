import { useEffect, useState } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { enterBoard, openBoardLink } from "../lib/api";
import { Logo, Nickname } from "../components/Identity";
import BoardPage from "./BoardPage";
import ThemeToggle from "../components/ThemeToggle";
export default function BoardGate() {
  const { id = "", code = "" } = useParams(),
    [params] = useSearchParams(),
    token = params.get("access") ?? "";
  const formation = params.get("formation");
  const location = useLocation();
  const [name, setName] = useState(
      localStorage.getItem("bizarron.nickname") ?? "",
    ),
    [resolved, setResolved] = useState<{
      id: string;
      token: string;
      formation: string | null;
    } | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    // Local formation switches have already been authorized. Updating their
    // URL must not tear down the active collaboration connection/history.
    if (
      code &&
      resolved &&
      location.state?.shortBoard === resolved.id &&
      location.state?.shortCode === code
    )
      return;
    setResolved(null);
    setError("");
    if (
      code
        ? !/^[A-Za-z0-9_-]{32}$/.test(code)
        : !/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{64}$/i.test(token)
    ) {
      setError(
        "Enlace inválido. Pedí el enlace completo con su token de acceso.",
      );
      return;
    }
    const authorize = async () => {
      if (code) {
        const link = await openBoardLink(code);
        return { id: link.board_id, token: code, formation: link.formation_id };
      }
      await enterBoard(id, token);
      return { id, token, formation };
    };
    void authorize()
      .then((link) => {
        if (active) setResolved(link);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, token, code, formation, attempt, location.state]);
  if (error)
    return (
      <div className="status-page">
        <ThemeToggle floating />
        <Logo />
        <AlertCircle size={36} />
        <h1>No pudimos abrir la cancha</h1>
        <p role="alert">{error}</p>
        <button className="secondary" onClick={() => setAttempt((a) => a + 1)}>
          Reintentar
        </button>
        <Link to="/">Ir al inicio para crear otra pizarra</Link>
      </div>
    );
  if (!resolved)
    return (
      <div className="status-page">
        <ThemeToggle floating />
        <Logo />
        <div className="spinner" />
        <p>Validando el enlace…</p>
      </div>
    );
  if (!name) return <Nickname onDone={setName} />;
  return (
    <BoardPage
      key={resolved.id}
      id={resolved.id}
      token={resolved.token}
      initialFormation={resolved.formation}
      name={name}
    />
  );
}
