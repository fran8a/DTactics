import type { Page } from "@playwright/test";

/** Exercise the real board UI with isolated state; theme tests never write to a shared database. */
export async function themeBoardFixture(
  page: Page,
  dragPermissionDelay = 0,
  allowDrags = false,
  additionDelay = 0,
  deletionDelay = 0,
  failDeletion = false,
) {
  const id = "00000000-0000-4000-8000-000000000001";
  const formation = {
    id,
    board_id: id,
    name: "Original",
    orientation: "vertical",
    players_per_team: 7,
    version: 1,
  };
  const player = (
    number: number,
    team: string,
    placement: string,
    x: number,
    y: number,
  ) => ({
    id: `player-${number}`,
    board_id: id,
    formation_id: id,
    name: placement === "bench" ? "Suplente" : `Jugador ${number}`,
    number,
    team,
    placement,
    x,
    y,
    version: 1,
  });
  const snapshot = {
    board: { ...formation, name: "Prueba de temas" },
    formation,
    formations: [formation],
    locks: [],
    players: [
      player(1, "A", "field", 0.3, 0.65),
      player(2, "B", "field", 0.6, 0.3),
      player(3, "A", "bench", 0.4, 0.5),
    ],
    tactics: {
      speeds: {},
      routes: { "player-1": [{ x: 0.5, y: 0.55 }] },
      duration_ms: 5000,
      version: 1,
    },
  };
  await page.route("**/src/pages/BoardGate.tsx*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `import React from '/node_modules/.vite/deps/react.js'; const { createElement } = React;
      import BoardPage from '/src/pages/BoardPage.tsx';
      export default function Gate() { return createElement(BoardPage, {
        id: '${id}', token: 'tttttttttttttttttttttttttttttttt', name: 'QA', initialFormation: '${id}'
      }); }`,
    }),
  );
  await page.route("**/src/features/useBoard.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `import React from '/node_modules/.vite/deps/react.js'; const { useState } = React;
      export function useBoard() {
        const [data, setData] = useState(${JSON.stringify(snapshot)});
        const [error, setError] = useState('Un aviso de prueba para revisar el contraste.');
        return {
          data, error, status: 'Conectado', connected: true, fatal: false,
          selection: '${id}', previews: {}, people: [{user_id:'qa', tab:'qa', name:'QA', color:'#569cfa'}], now: Date.now(),
          busy: false, dragging: false, canUndo: false, canRedo: false,
          refresh: async () => {}, dismissError: () => setError(''),
          change: async (action, pid, values) => {
            if (action === 'delete') {
              await new Promise(resolve => setTimeout(resolve, ${deletionDelay}));
              if (${failDeletion}) throw new Error('No se pudo guardar');
            }
            setData(old => ({...old, players: action === 'delete'
            ? old.players.filter(p => p.id !== pid)
            : old.players.map(p => p.id === pid ? {...p, ...values, version:p.version+1} : p)})); },
          quickAdd: async (team, pid, x, y) => {
            await new Promise(resolve => setTimeout(resolve, ${additionDelay}));
            setData(old => ({...old, players: [...old.players, {
            id:pid, board_id:'${id}', formation_id:'${id}', name:'Nuevo', number:9, team, placement:'field', x, y, version:1
          }]})); },
          saveTactics: async config => setData(old => ({...old, tactics:{...config, version:old.tactics.version+1}})),
          updateBoard: async name => setData(old => ({...old, board:{...old.board, name}})),
          changeFormat: async players_per_team => setData(old => ({...old, board:{...old.board, players_per_team}})),
          begin: async pid => {
            await new Promise(resolve => setTimeout(resolve, ${dragPermissionDelay}));
            if (${allowDrags}) setData(old => ({...old, locks:[{player_id:pid, user_id:'qa', lease_id:'qa-drag', expires_at:new Date(Date.now()+12000).toISOString()}]}));
            return ${allowDrags};
          },
          moving: () => {},
          end: async (pid, x, y, placement) => {
            if (${allowDrags}) setData(old => ({...old, locks:[], players:old.players.map(p => p.id===pid && x!==undefined ? {...p,x,y,placement,version:p.version+1} : p)}));
          },
          selectFormation: () => {}, manageFormation: async () => {}, undo: async () => {}, redo: async () => {}
        };
      }`,
    }),
  );
}
