import { Route, Routes, Link } from "react-router-dom";
import Home from "./pages/HomePage";
import { lazy, Suspense } from "react";
const BoardGate = lazy(() => import("./pages/BoardGate"));
import { Logo } from "./components/Identity";
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/p/:code"
        element={
          <Suspense
            fallback={
              <div className="status-page">
                <div className="spinner" />
                <p>Preparando la cancha…</p>
              </div>
            }
          >
            <BoardGate />
          </Suspense>
        }
      />
      <Route
        path="/board/:id"
        element={
          <Suspense
            fallback={
              <div className="status-page">
                <div className="spinner" />
                <p>Preparando la cancha…</p>
              </div>
            }
          >
            <BoardGate />
          </Suspense>
        }
      />
      <Route
        path="*"
        element={
          <div className="status-page">
            <Logo />
            <h1>La pelota se fue afuera.</h1>
            <Link to="/">Volver al inicio</Link>
          </div>
        }
      />
    </Routes>
  );
}
