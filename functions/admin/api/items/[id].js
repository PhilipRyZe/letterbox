import { json, error, readJson, requireAdmin } from "../../../_utils/http.js";

const FIELDS = [
  "type",
  "title",
  "year",
  "cover_url",
  "description",
  "host_rating",
  "host_note",
];

// PUT /admin/api/items/:id
// Body: beliebige Teilmenge der FIELDS, nur mitgeschickte Felder ändern sich.
export async function onRequestPut({ request, env, params }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return error("Ungültiger Body.");

  const updates = FIELDS.filter((f) => f in body);
  if (updates.length === 0) return error("Keine Felder zum Ändern übergeben.");

  const setClause = updates.map((f) => `${f} = ?`).join(", ");
  const values = updates.map((f) => body[f]);

  const result = await env.DB.prepare(
    `UPDATE items SET ${setClause} WHERE id = ?`
  )
    .bind(...values, params.id)
    .run();

  if (result.meta.changes === 0) return error("Nicht gefunden.", 404);
  return json({ ok: true });
}

// DELETE /admin/api/items/:id
export async function onRequestDelete({ request, env, params }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const result = await env.DB.prepare("DELETE FROM items WHERE id = ?")
    .bind(params.id)
    .run();

  if (result.meta.changes === 0) return error("Nicht gefunden.", 404);
  return json({ ok: true });
}
