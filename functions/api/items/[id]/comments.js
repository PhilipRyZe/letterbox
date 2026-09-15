import { json, error, readJson } from "../../../_utils/http.js";

// GET /api/items/:id/comments
export async function onRequestGet({ env, params }) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, text, created_at FROM comments WHERE item_id = ? ORDER BY created_at ASC"
  )
    .bind(params.id)
    .all();
  return json({ comments: results });
}

// POST /api/items/:id/comments   Body: { visitorId, name, text }
export async function onRequestPost({ request, env, params }) {
  const body = await readJson(request);
  const visitorId = body?.visitorId;
  const name = (body?.name || "").trim().slice(0, 40);
  const text = (body?.text || "").trim().slice(0, 1000);

  if (!visitorId) return error("visitorId fehlt.");
  if (!name) return error("Bitte einen Namen angeben.");
  if (!text) return error("Kommentar ist leer.");

  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO comments (id, item_id, visitor_id, name, text) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, params.id, visitorId, name, text)
    .run();

  const comment = await env.DB.prepare(
    "SELECT id, name, text, created_at FROM comments WHERE id = ?"
  )
    .bind(id)
    .first();

  return json({ comment }, { status: 201 });
}
