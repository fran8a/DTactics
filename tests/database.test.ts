import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
// PostgreSQL real embebido. Solo se sustituyen los servicios externos Auth y
// Realtime: estas pruebas no equivalen a verificar WebSockets en Supabase.
const db = new PGlite({ extensions: { pgcrypto } });
const a = randomUUID(),
  b = randomUUID(),
  intruder = randomUUID();
let board: string, token: string, pid: string;
let legacy: { id: string; token: string; players: any[] };
async function user<T>(id: string, action: () => Promise<T>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
  try {
    return await action();
  } finally {
    await db.exec("reset role");
  }
}
async function call<T = unknown>(name: string, args: unknown[] = []) {
  const result = await db.query<{ value: T }>(
    `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`,
    args,
  );
  return result.rows[0].value;
}
const change = (
  action: string,
  id: string,
  data: unknown = {},
  version: number | null = null,
  lease: string | null = null,
) =>
  call<any>("change_player", [
    board,
    action,
    id,
    JSON.stringify(data),
    version,
    lease,
  ]);
async function extended() {
  const created = await user(a, () => call<any>("create_board"));
  await user(b, () => call("join_board", [created.id, created.token]));
  const s = await user(a, () => call<any>("board_snapshot", [created.id]));
  return { board: created.id, formation: s.formation.id };
}
const editV2 = (
  actor: string,
  c: { board: string; formation: string },
  action: string,
  id: string,
  data: unknown = {},
  version: number | null = null,
  lease: string | null = null,
  op = randomUUID(),
) =>
  user(actor, () =>
    call<any>("change_player_v2", [
      c.board,
      c.formation,
      action,
      id,
      JSON.stringify(data),
      version,
      lease,
      op,
    ]),
  );
const quickV2 = (
  actor: string,
  c: { board: string; formation: string },
  id = randomUUID(),
  team = "A",
  placement = "field",
) =>
  user(actor, () =>
    call<any>("quick_add_v2", [
      c.board,
      c.formation,
      id,
      team,
      0.3,
      0.6,
      placement,
    ]),
  );
const reverseV2 = (
  actor: string,
  c: { board: string; formation: string },
  op: string,
  direction = "undo",
) =>
  user(actor, () =>
    call<any>("reverse_operation", [c.board, c.formation, op, direction]),
  );
describe("migración PostgreSQL, autorización y concurrencia", () => {
  beforeAll(async () => {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
      create schema realtime;create table realtime.messages(extension text);
      alter table realtime.messages enable row level security;
      grant usage on schema realtime to authenticated;grant select,insert on realtime.messages to authenticated;
      create function realtime.topic() returns text language sql stable as $$select current_setting('test.topic',true)$$;
      create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;`);
    await db.query("insert into auth.users values ($1),($2),($3)", [
      a,
      b,
      intruder,
    ]);
    for (const migration of readdirSync("supabase/migrations")
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (migration.endsWith("_formations_bench_history.sql")) {
        const created = await user(a, () => call<any>("create_board"));
        const p = randomUUID();
        await user(a, () =>
          call("quick_add_player", [created.id, p, "A", 0.23, 0.67]),
        );
        await user(a, () =>
          call("change_player", [
            created.id,
            "update",
            p,
            JSON.stringify({ name: "Jugador anterior", number: 8, team: "A" }),
            1,
            null,
          ]),
        );
        const old = await user(a, () =>
          call<any>("board_snapshot", [created.id]),
        );
        legacy = { ...created, players: old.players };
      }
      await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
    }
  }, 30000);
  afterAll(async () => {
    await db.close();
  });
  it("crea tablero vacío y almacena exclusivamente el hash del token", async () => {
    const created = await user(a, () => call<any>("create_board"));
    board = created.id;
    token = created.token;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const stored = await db.query<{ hash: string }>(
      "select encode(token_hash,'hex') as hash from private.board_access where board_id=$1",
      [board],
    );
    expect(stored.rows[0].hash).not.toBe(token);
    const s = await user(a, () => call<any>("board_snapshot", [board]));
    expect(s.players).toEqual([]);
  });
  it("impide lectura y edición con solo el UUID", async () => {
    expect(
      await user(intruder, () => call("board_snapshot", [board])),
    ).toBeNull();
    const rows = await user(intruder, () =>
      db.query("select * from public.boards where id=$1", [board]),
    );
    expect(rows.rows).toHaveLength(0);
    await expect(
      user(intruder, () => call("join_board", [board, "0".repeat(64)])),
    ).rejects.toThrow(/Enlace inválido/);
    await expect(
      user(intruder, () =>
        change("add", randomUUID(), {
          name: "Intruso",
          number: 1,
          team: "A",
          x: 0.5,
          y: 0.5,
        }),
      ),
    ).rejects.toThrow(/acceso/);
    await expect(
      user(a, () =>
        db.query("update public.boards set name='X' where id=$1", [board]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      user(a, () => db.query("select * from private.board_access")),
    ).rejects.toThrow(/permission denied/);
  });
  it("autoriza invitación y canal privado únicamente para miembros", async () => {
    await user(b, () => call("join_board", [board, token]));
    await db.query("select set_config('test.topic',$1,false)", [
      `board:${board}`,
    ]);
    await user(b, () =>
      db.exec(
        "insert into realtime.messages values ('broadcast'),('presence')",
      ),
    );
    await expect(
      user(intruder, () =>
        db.exec("insert into realtime.messages values ('broadcast')"),
      ),
    ).rejects.toThrow(/row-level security/);
    expect(
      (await user(intruder, () => db.query("select * from realtime.messages")))
        .rows,
    ).toHaveLength(0);
  });
  it("agrega jugadores independientes e ignora reintentos duplicados", async () => {
    pid = randomUUID();
    const data = { name: "Ochoa", number: 9, team: "A", x: 0.4, y: 0.8 };
    await user(a, () => change("add", pid, data));
    await user(a, () => change("add", pid, data));
    const s = await user(b, () =>
      change("add", randomUUID(), { ...data, team: "B" }),
    );
    expect(s.players).toHaveLength(2);
    expect(s.players.filter((p: any) => p.number === 9)).toHaveLength(2);
  });
  it("rechaza datos fuera de límites", async () => {
    await expect(
      user(a, () =>
        change("add", randomUUID(), {
          name: "X",
          number: 100,
          team: "A",
          x: 0.4,
          y: 0.8,
        }),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      user(a, () =>
        change("add", randomUUID(), {
          name: "X",
          number: 9,
          team: "A",
          x: 1.5,
          y: 0.8,
        }),
      ),
    ).rejects.toThrow(/check constraint/);
  });
  it("permite un único bloqueo y rechaza editar durante un arrastre", async () => {
    const lease = randomUUID();
    await user(a, () => change("acquire", pid, {}, null, lease));
    await expect(
      user(b, () => change("acquire", pid, {}, null, randomUUID())),
    ).rejects.toThrow(/Otro participante/);
    await expect(
      user(b, () =>
        change("update", pid, { name: "Ochoa", number: 10, team: "A" }, 1),
      ),
    ).rejects.toThrow(/arrastre/);
    await expect(
      user(b, () => change("move", pid, { x: 0.1, y: 0.1 }, null, lease)),
    ).rejects.toThrow(/bloqueo/);
    const renewed = await user(a, () => change("renew", pid, {}, null, lease));
    expect(renewed.locks).toHaveLength(1);
    const s = await user(a, () =>
      change("move", pid, { x: 0.2, y: 0.3 }, null, lease),
    );
    expect(s.locks).toHaveLength(0);
    expect(s.players.find((p: any) => p.id === pid)).toMatchObject({
      x: 0.2,
      y: 0.3,
      version: 2,
    });
  });
  it("expira bloqueos abandonados y permite adquirirlos de nuevo", async () => {
    await user(a, () => change("acquire", pid, {}, null, randomUUID()));
    await db.query(
      "update private.player_locks set expires_at=now()-interval '1 second' where player_id=$1",
      [pid],
    );
    const lease = randomUUID();
    await user(b, () => change("acquire", pid, {}, null, lease));
    await user(b, () => change("release", pid, {}, null, lease));
  });
  it("edita con control de versiones y no pierde cambios recientes", async () => {
    const updated = await user(b, () =>
      change("update", pid, { name: "Ochoa", number: 10, team: "A" }, 2),
    );
    expect(updated.players.find((p: any) => p.id === pid).number).toBe(10);
    await expect(
      user(a, () =>
        change("update", pid, { name: "Viejo", number: 9, team: "A" }, 2),
      ),
    ).rejects.toThrow(/jugador cambió/);
    await expect(
      user(intruder, () =>
        call("change_board", [
          board,
          "Ajeno",
          "horizontal",
          updated.board.version,
        ]),
      ),
    ).rejects.toThrow(/acceso/);
    const rotated = await user(a, () =>
      call<any>("change_board", [
        board,
        "Partidito",
        "horizontal",
        updated.board.version,
      ]),
    );
    expect(rotated.board.orientation).toBe("horizontal");
    await expect(
      user(b, () =>
        call("change_board", [
          board,
          "Viejo",
          "vertical",
          updated.board.version,
        ]),
      ),
    ).rejects.toThrow(/tablero cambió/);
  });
  it("elimina un jugador y acepta reintentar la eliminación", async () => {
    const s = await user(a, () => change("delete", pid, {}, 3));
    expect(s.players.some((p: any) => p.id === pid)).toBe(false);
    await user(a, () => change("delete", pid, {}, 3));
  });
  it("numera cada equipo de forma independiente, sin consumir números por reintentos ni reciclar bajas", async () => {
    const fresh = await user(a, () => call<any>("create_board"));
    const quick = (id: string, team: string) =>
      call<any>("quick_add_player", [fresh.id, id, team, 0.3, 0.7]);
    const id = randomUUID();
    let s = await user(a, () => quick(id, "A"));
    expect(s.players.find((p: any) => p.id === id)).toMatchObject({
      name: "Jugador 1",
      number: 1,
      team: "A",
      x: 0.3,
      y: 0.7,
    });
    await user(a, () => quick(id, "A"));
    s = await user(a, () => quick(randomUUID(), "B"));
    expect(s.players.find((p: any) => p.team === "B").number).toBe(1);
    const second = randomUUID();
    s = await user(a, () => quick(second, "A"));
    expect(s.players.find((p: any) => p.id === second).number).toBe(2);
    await user(a, () =>
      call("change_player", [fresh.id, "delete", second, "{}", 1, null]),
    );
    const third = randomUUID();
    s = await user(a, () => quick(third, "A"));
    expect(s.players.find((p: any) => p.id === third).number).toBe(3);
    await expect(
      user(intruder, () => quick(randomUUID(), "A")),
    ).rejects.toThrow(/acceso/);
    await expect(user(a, () => quick(randomUUID(), "C"))).rejects.toThrow(
      /equipo válido/,
    );
    await expect(
      user(a, () =>
        call("quick_add_player", [fresh.id, randomUUID(), "B", 2, 0.5]),
      ),
    ).rejects.toThrow(/check constraint/);
    s = await user(a, () => quick(randomUUID(), "B"));
    expect(
      s.players.filter((p: any) => p.team === "B").map((p: any) => p.number),
    ).toEqual([1, 2]);
  });
  it("reinicia la numeración desde 1 al vaciar cada equipo, incluso con contadores anteriores", async () => {
    const fresh = await user(a, () => call<any>("create_board"));
    await db.query(
      "insert into private.team_numbers(board_id,team,last_number,formation_id) select $1,t,n,f.id from public.formations f cross join (values('A',88),('B',50)) v(t,n) where f.board_id=$1",
      [fresh.id],
    );
    const ids = [randomUUID(), randomUUID()];
    for (const [i, team] of ["A", "B"].entries()) {
      const s = await user(a, () =>
        call<any>("quick_add_player", [fresh.id, ids[i], team, 0.5, 0.5]),
      );
      expect(s.players.find((p: any) => p.id === ids[i]).number).toBe(1);
    }
    await user(a, () =>
      call("change_player", [fresh.id, "delete", ids[0], "{}", 1, null]),
    );
    const replacement = randomUUID();
    const s = await user(a, () =>
      call<any>("quick_add_player", [fresh.id, replacement, "A", 0.5, 0.5]),
    );
    expect(s.players.find((p: any) => p.id === replacement).number).toBe(1);
    expect(s.players.find((p: any) => p.id === ids[1]).number).toBe(1);
  });
  it("valida fútbol 7 y 11 por equipo, bloquea cambios con jugadores y rechaza atajos por RPC", async () => {
    const fresh = await user(a, () => call<any>("create_board"));
    let s = await user(a, () => call<any>("change_format", [fresh.id, 7, 1]));
    expect(s.board.players_per_team).toBe(7);
    const quick = (team: string) =>
      user(a, () =>
        call<any>("quick_add_player", [fresh.id, randomUUID(), team, 0.5, 0.5]),
      );
    for (const team of ["A", "B"])
      for (let i = 0; i < 7; i++) s = await quick(team);
    for (const team of ["A", "B"])
      expect(
        s.players.filter((p: any) => p.team === team).map((p: any) => p.number),
      ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await expect(quick("A")).rejects.toThrow(/7 jugadores/);
    await expect(quick("B")).rejects.toThrow(/7 jugadores/);
    await expect(
      user(a, () =>
        call("change_player", [
          fresh.id,
          "add",
          randomUUID(),
          JSON.stringify({
            name: "Atajo",
            number: 8,
            team: "A",
            x: 0.5,
            y: 0.5,
          }),
          null,
          null,
        ]),
      ),
    ).rejects.toThrow(/7 jugadores/);
    const blue = s.players.find((p: any) => p.team === "B");
    await expect(
      user(a, () =>
        call("change_player", [
          fresh.id,
          "update",
          blue.id,
          JSON.stringify({ name: blue.name, number: blue.number, team: "A" }),
          blue.version,
          null,
        ]),
      ),
    ).rejects.toThrow(/7 jugadores/);
    await expect(
      user(a, () => call("change_format", [fresh.id, 11, s.board.version])),
    ).rejects.toThrow(/formación pendiente/);
    await expect(
      user(intruder, () =>
        call("change_format", [fresh.id, 11, s.board.version]),
      ),
    ).rejects.toThrow(/acceso/);
    await expect(
      user(a, () => call("change_format", [fresh.id, 5, s.board.version])),
    ).rejects.toThrow(/fútbol 7 o fútbol 11/);
    for (const p of s.players)
      s = await user(a, () =>
        call<any>("change_player", [
          fresh.id,
          "delete",
          p.id,
          "{}",
          p.version,
          null,
        ]),
      );
    s = await user(a, () =>
      call<any>("change_format", [fresh.id, 11, s.board.version]),
    );
    expect(s.board.players_per_team).toBe(11);
    for (let i = 0; i < 11; i++) s = await quick("A");
    expect(s.players.map((p: any) => p.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    await expect(quick("A")).rejects.toThrow(/11 jugadores/);
  });
  it("migra los tableros anteriores a Original sin alterar los datos de sus jugadores", async () => {
    const migrated = await user(a, () =>
      call<any>("board_snapshot", [legacy.id]),
    );
    expect(migrated.formations).toHaveLength(1);
    expect(migrated.formation.name).toBe("Original");
    expect(migrated.players[0]).toMatchObject({
      ...legacy.players[0],
      placement: "field",
      formation_id: migrated.formation.id,
    });
  });
  it("duplica y administra formaciones independientes, con RLS y un mínimo de una formación", async () => {
    const c = await extended();
    const p = randomUUID();
    await quickV2(a, c, p, "A", "bench");
    const copyId = randomUUID();
    let copied = await user(a, () =>
      call<any>("manage_formation", [
        c.board,
        "duplicate",
        copyId,
        null,
        c.formation,
        null,
      ]),
    );
    expect(copied.formation.name).toBe("Copia de Original");
    expect(copied.players[0]).toMatchObject({
      name: "Jugador 1",
      number: 1,
      placement: "bench",
      x: 0.3,
      y: 0.6,
    });
    expect(copied.players[0].id).not.toBe(p);
    await editV2(
      a,
      { board: c.board, formation: copyId },
      "update",
      copied.players[0].id,
      { name: "Copia editada", number: 10, team: "B" },
      1,
    );
    const original = await user(a, () =>
      call<any>("formation_snapshot", [c.board, c.formation]),
    );
    expect(original.players[0].name).toBe("Jugador 1");
    const foreign = await extended();
    await expect(
      quickV2(a, { board: c.board, formation: foreign.formation }),
    ).rejects.toThrow();
    expect(
      (
        await user(intruder, () =>
          db.query("select * from public.formations where board_id=$1", [
            c.board,
          ]),
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      user(intruder, () =>
        call("manage_formation", [
          c.board,
          "duplicate",
          randomUUID(),
          null,
          c.formation,
          null,
        ]),
      ),
    ).rejects.toThrow(/acceso/);
    let s = await user(a, () =>
      call<any>("formation_snapshot", [c.board, copyId]),
    );
    s = await user(a, () =>
      call<any>("manage_formation", [
        c.board,
        "rename",
        copyId,
        "Ofensiva",
        null,
        s.formation.version,
      ]),
    );
    expect(s.formation.name).toBe("Ofensiva");
    const blank = randomUUID();
    s = await user(a, () =>
      call<any>("manage_formation", [
        c.board,
        "create",
        blank,
        null,
        c.formation,
        null,
      ]),
    );
    expect(s.players).toEqual([]);
    await user(a, () =>
      call("manage_formation", [
        c.board,
        "delete",
        blank,
        null,
        null,
        s.formation.version,
      ]),
    );
    s = await user(a, () => call<any>("formation_snapshot", [c.board, copyId]));
    await user(a, () =>
      call("manage_formation", [
        c.board,
        "delete",
        copyId,
        null,
        null,
        s.formation.version,
      ]),
    );
    const fallback = await user(a, () =>
      call<any>("formation_snapshot", [c.board, copyId]),
    );
    expect(fallback.formation.id).toBe(c.formation);
    await expect(
      user(a, () =>
        call("manage_formation", [
          c.board,
          "delete",
          c.formation,
          null,
          null,
          fallback.formation.version,
        ]),
      ),
    ).rejects.toThrow(/última formación/);
  });
  it("limita a cinco formaciones al crear y duplicar, conservando los reintentos", async () => {
    const c = await extended();
    const ids = Array.from({ length: 4 }, () => randomUUID());
    for (const id of ids) {
      await user(a, () =>
        call("manage_formation", [c.board, "create", id, null, c.formation]),
      );
    }
    for (const action of ["create", "duplicate"]) {
      await expect(
        user(a, () =>
          call("manage_formation", [
            c.board,
            action,
            randomUUID(),
            null,
            c.formation,
          ]),
        ),
      ).rejects.toThrow("5 formaciones");
    }
    const retry = await user(a, () =>
      call<any>("manage_formation", [
        c.board,
        "create",
        ids[0],
        null,
        c.formation,
      ]),
    );
    expect(retry.formations).toHaveLength(5);
    expect(retry.formation.id).toBe(ids[0]);
  });
  it("conserva los datos del banco y permite editar, reincorporar, eliminar y restaurar suplentes", async () => {
    const c = await extended(),
      p = randomUUID();
    let s = await quickV2(a, c, p);
    s = await editV2(a, c, "placement", p, { placement: "bench" }, 1);
    expect(s.players[0]).toMatchObject({
      placement: "bench",
      x: 0.3,
      y: 0.6,
      number: 1,
    });
    const benchOp = s.operation.id;
    s = await reverseV2(a, c, benchOp);
    expect(s.players[0].placement).toBe("field");
    s = await reverseV2(a, c, benchOp, "redo");
    expect(s.players[0].placement).toBe("bench");
    s = await editV2(
      b,
      c,
      "update",
      p,
      { name: "Suplente editado", number: 5, team: "B" },
      s.players[0].version,
    );
    s = await editV2(
      b,
      c,
      "placement",
      p,
      { placement: "field", x: 0.7, y: 0.2 },
      s.players[0].version,
    );
    expect(s.players[0]).toMatchObject({
      name: "Suplente editado",
      team: "B",
      number: 5,
      placement: "field",
      x: 0.7,
      y: 0.2,
    });
    s = await editV2(
      b,
      c,
      "placement",
      p,
      { placement: "bench" },
      s.players[0].version,
    );
    s = await editV2(b, c, "delete", p, {}, s.players[0].version);
    const deleted = s.operation.id;
    expect(s.players).toEqual([]);
    s = await reverseV2(b, c, deleted);
    expect(s.players[0]).toMatchObject({
      name: "Suplente editado",
      placement: "bench",
      x: 0.7,
      y: 0.2,
    });
  });
  it("deshace y rehace cadenas propias del mismo jugador con versiones monotónicas", async () => {
    const c = await extended(),
      p = randomUUID();
    let s = await quickV2(a, c, p);
    const added = s.operation.id;
    s = await editV2(
      a,
      c,
      "update",
      p,
      { name: "Ochoa", number: 9, team: "B" },
      1,
    );
    const edited = s.operation.id;
    s = await reverseV2(a, c, edited);
    expect(s.players[0]).toMatchObject({ name: "Jugador 1", version: 3 });
    s = await reverseV2(a, c, added);
    expect(s.players).toHaveLength(0);
    s = await reverseV2(a, c, added, "redo");
    expect(s.players[0]).toMatchObject({ name: "Jugador 1", version: 5 });
    s = await reverseV2(a, c, edited, "redo");
    expect(s.players[0]).toMatchObject({
      name: "Ochoa",
      number: 9,
      team: "B",
      version: 6,
    });
    const lease = randomUUID();
    await editV2(a, c, "acquire", p, {}, null, lease);
    await editV2(a, c, "renew", p, {}, null, lease);
    s = await editV2(a, c, "move", p, { x: 0.8, y: 0.1 }, null, lease);
    const moved = s.operation.id;
    s = await reverseV2(a, c, moved);
    expect(s.players[0]).toMatchObject({ x: 0.3, y: 0.6 });
    s = await reverseV2(a, c, moved, "redo");
    expect(s.players[0]).toMatchObject({ x: 0.8, y: 0.1 });
    const count = await db.query<{ n: number }>(
      "select count(*)::int n from private.player_operations where formation_id=$1",
      [c.formation],
    );
    expect(count.rows[0].n).toBe(3);
  });
  it("no revierte cambios de otro usuario ni revive un jugador eliminado por otro", async () => {
    const c = await extended(),
      p = randomUUID(),
      other = randomUUID();
    let s = await quickV2(a, c, p);
    const mine = s.operation.id;
    await quickV2(b, c, other);
    s = await reverseV2(a, c, mine);
    expect(s.players.map((p: any) => p.id)).toEqual([other]);
    s = await reverseV2(a, c, mine, "redo");
    const row = s.players.find((r: any) => r.id === p);
    s = await editV2(
      b,
      c,
      "update",
      p,
      { name: "Cambio de Guido", number: 5, team: "B" },
      row.version,
    );
    const theirs = s.operation.id;
    await expect(reverseV2(a, c, mine)).rejects.toThrow(/cambios posteriores/);
    await expect(reverseV2(a, c, theirs)).rejects.toThrow(/historial/);
    s = await editV2(
      b,
      c,
      "delete",
      p,
      {},
      s.players.find((r: any) => r.id === p).version,
    );
    await expect(reverseV2(a, c, mine)).rejects.toThrow(/cambios posteriores/);
    s = await user(a, () =>
      call<any>("formation_snapshot", [c.board, c.formation]),
    );
    expect(s.players.some((r: any) => r.id === p)).toBe(false);
  });
  it("invalida la rama redo y respeta el cupo al deshacer un envío al banco", async () => {
    const c = await extended();
    let s = await user(a, () => call<any>("change_format", [c.board, 7, 1]));
    for (let i = 0; i < 7; i++) s = await quickV2(a, c);
    const p = s.players[0];
    s = await editV2(
      a,
      c,
      "placement",
      p.id,
      { placement: "bench" },
      p.version,
    );
    const benched = s.operation.id;
    await quickV2(b, c);
    await expect(reverseV2(a, c, benched)).rejects.toThrow(/7 jugadores/);
    s = await quickV2(a, c, randomUUID(), "B", "bench");
    const op = s.operation.id;
    await reverseV2(a, c, op);
    await quickV2(a, c, randomUUID(), "B", "bench");
    await expect(reverseV2(a, c, op, "redo")).rejects.toThrow(
      /rama de rehacer/,
    );
  });
  it("conserva la posición exterior al mover, duplicar y deshacer sin perder la última posición en cancha", async () => {
    const c = await extended(),
      p = randomUUID();
    let s = await quickV2(a, c, p);
    const lease = randomUUID();
    await editV2(a, c, "acquire", p, {}, null, lease);
    s = await editV2(
      a,
      c,
      "move",
      p,
      { x: 0.3, y: 0.6, placement: "bench", outside_x: -0.12, outside_y: 0.4 },
      null,
      lease,
    );
    const op = s.operation.id;
    expect(s.players[0]).toMatchObject({
      x: 0.3,
      y: 0.6,
      placement: "bench",
      outside_x: -0.12,
      outside_y: 0.4,
    });
    const copy = await user(a, () =>
      call<any>("manage_formation", [
        c.board,
        "duplicate",
        randomUUID(),
        null,
        c.formation,
      ]),
    );
    expect(copy.players[0]).toMatchObject({
      outside_x: -0.12,
      outside_y: 0.4,
      placement: "bench",
    });
    s = await reverseV2(a, c, op);
    expect(s.players[0]).toMatchObject({
      placement: "field",
      outside_x: null,
      outside_y: null,
    });
    s = await reverseV2(a, c, op, "redo");
    expect(s.players[0]).toMatchObject({
      placement: "bench",
      outside_x: -0.12,
      outside_y: 0.4,
    });
    s = await editV2(a, c, "delete", p, {}, s.players[0].version);
    s = await reverseV2(a, c, s.operation.id);
    expect(s.players[0]).toMatchObject({
      placement: "bench",
      outside_x: -0.12,
      outside_y: 0.4,
    });
    await expect(
      editV2(
        a,
        c,
        "placement",
        p,
        { placement: "bench", outside_x: 0.5, outside_y: 0.5 },
        s.players[0].version,
      ),
    ).rejects.toThrow(/players_outside_position/);
  });
  it("limita los comandos a 50 por usuario y formación", async () => {
    const c = await extended(),
      p = randomUUID();
    let s = await quickV2(a, c, p);
    for (let i = 0; i < 55; i++)
      s = await editV2(
        a,
        c,
        "update",
        p,
        { name: "Jugador " + i, number: i, team: "A" },
        s.players[0].version,
      );
    const count = await db.query<{ n: number }>(
      "select count(*)::int n from private.player_operations where formation_id=$1 and actor_id=$2",
      [c.formation, a],
    );
    expect(count.rows[0].n).toBe(50);
  });
});
