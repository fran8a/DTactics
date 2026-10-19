import { createClient } from "@supabase/supabase-js";
import type { Snapshot } from "./model";
import { errorMessage } from "./errors";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;
export function client() {
  if (!supabase)
    throw new Error("Falta configurar Supabase. Seguí los pasos del README.");
  return supabase;
}
let sessionPromise: Promise<string> | null = null;
export function session() {
  if (!sessionPromise)
    sessionPromise = (async () => {
      const c = client();
      const { data, error } = await c.auth.getSession();
      if (error) throw new Error(errorMessage(error));
      if (data.session) return data.session.user.id;
      const result = await c.auth.signInAnonymously();
      if (result.error) throw new Error(errorMessage(result.error));
      return result.data.user!.id;
    })().catch((e) => {
      sessionPromise = null;
      throw e;
    });
  return sessionPromise;
}
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw new Error(errorMessage(error));
  return data as T;
}
export async function createBoard() {
  await session();
  return rpc<{ id: string; token: string }>("create_board");
}
export async function enterBoard(id: string, token: string) {
  await session();
  return rpc("join_board", { p_board: id, p_token: token });
}
export const snapshot = (id: string, formation: string | null = null) =>
  rpc<Snapshot>("formation_snapshot", { p_board: id, p_formation: formation });
