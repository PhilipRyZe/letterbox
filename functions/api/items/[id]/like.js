import { json, error, readJson } from "../../../_utils/http.js";

// POST /api/items/:id/like   Body: { visitorId }
// Liked der Besucher noch nicht -> like setzen. Liked er schon -> entfernen.
// So reicht ein einziger Button zum Liken/Entliken.
export async function onRequestPost({ request, env, params }) {
  const body = await readJson(request);
  const visitorId = body?.visitorId;
  if (!visitorId) return error("visitorId fehlt.");

  const itemId = params.id;
  const existing = await env.DB.prepare(
    "SELECT 1 FROM likes WHERE item_id = ? AND visitor_id = ?"
  )
    .bind(itemId, visitorId)
    .first();

  if (existing) {
    await env.DB.prepare("DELETE FROM likes WHERE item_id = ? AND visitor_id = ?")
      .bind(itemId, visitorId)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO likes (item_id, visitor_id) VALUES (?, ?)"
    )
      .bind(itemId, visitorId)
      .run();
  }

  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM likes WHERE item_id = ?"
  )
    .bind(itemId)
    .first();

  return json({ liked: !existing, like_count: count.n });
}
