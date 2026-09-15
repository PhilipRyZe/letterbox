import { json, error, readJson, requireAdmin } from "../../_utils/http.js";

// POST /admin/api/items
// Body: { type, title, year, cover_url, description, host_rating, host_note }
export async function onRequestPost({ request, env }) {
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
