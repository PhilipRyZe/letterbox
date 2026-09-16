import { json, error, readJson, requireAdmin } from "../utils/http.js";

const FIELDS = [
  "type",
  "title",
  "year",
  "cover_url",
  "description",
  "host_rating",
  "host_note",
];

// POST /admin/api/items
export async function handleCreateItem(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const { type, title } = body || {};
  if (!["film", "serie", "game"].includes(type)) {
    return error("type muss film, serie oder game sein.");
  }
  if (!title || !title.trim()) {
    return error("Titel fehlt.");
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO items (id, type, title, year, cover_url, description, host_rating, host_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      type,
      title.trim(),
      body.year || null,
      body.cover_url || null,
      body.description || null,
      body.host_rating ?? null,
      body.host_note || null
    )
    .run();

  return json({ id }, { status: 201 });
}

// PUT /admin/api/items/:id
export async function handleUpdateItem(request, env, id) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return error("Ungültiger Body.");

  const updates = FIELDS.filter((f) => f in body);
  if (updates.length === 0) return error("Keine Felder zum Ändern übergeben.");

  const setClause = updates.map((f) => `${f} = ?`).join(", ");
  const values = updates.map((f) => body[f]);

  const result = await env.DB.prepare(`UPDATE items SET ${setClause} WHERE id = ?`)
    .bind(...values, id)
    .run();

  if (result.meta.changes === 0) return error("Nicht gefunden.", 404);
  return json({ ok: true });
}

// DELETE /admin/api/items/:id
export async function handleDeleteItem(request, env, id) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const result = await env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
  if (result.meta.changes === 0) return error("Nicht gefunden.", 404);
  return json({ ok: true });
}

// DELETE /admin/api/comments/:id
export async function handleDeleteComment(request, env, id) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const result = await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
  if (result.meta.changes === 0) return error("Nicht gefunden.", 404);
  return json({ ok: true });
}
