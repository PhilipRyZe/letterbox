import { json, error, readJson } from "../utils/http.js";
import { listItems, getItem } from "../utils/items.js";

// GET /api/items?type=film|serie|game
export async function handleListItems(request, env, url) {
  const type = url.searchParams.get("type");
  if (type && !["film", "serie", "game"].includes(type)) {
    return error("Ungültiger type-Filter.");
  }
  const items = await listItems(env.DB, { type });
  return json({ items });
}

// GET /api/items/:id
export async function handleGetItem(request, env, id) {
  const visitorId = request.headers.get("X-Visitor-Id");
  const item = await getItem(env.DB, id, visitorId);
  if (!item) return error("Nicht gefunden.", 404);
  return json({ item });
}

// POST /api/items/:id/like   Body: { visitorId }
export async function handleLike(request, env, id) {
  const body = await readJson(request);
  const visitorId = body?.visitorId;
  if (!visitorId) return error("visitorId fehlt.");

  const existing = await env.DB.prepare(
    "SELECT 1 FROM likes WHERE item_id = ? AND visitor_id = ?"
  )
    .bind(id, visitorId)
    .first();

  if (existing) {
    await env.DB.prepare("DELETE FROM likes WHERE item_id = ? AND visitor_id = ?")
      .bind(id, visitorId)
      .run();
  } else {
    await env.DB.prepare("INSERT INTO likes (item_id, visitor_id) VALUES (?, ?)")
      .bind(id, visitorId)
      .run();
  }

  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM likes WHERE item_id = ?"
  )
    .bind(id)
    .first();

  return json({ liked: !existing, like_count: count.n });
}

// POST /api/items/:id/rating   Body: { visitorId, rating }
export async function handleRating(request, env, id) {
  const body = await readJson(request);
  const visitorId = body?.visitorId;
  const rating = Number(body?.rating);

  if (!visitorId) return error("visitorId fehlt.");
  if (!rating || rating < 1 || rating > 10) {
    return error("rating muss zwischen 1 und 10 liegen.");
  }

  await env.DB.prepare(
    `INSERT INTO ratings (item_id, visitor_id, rating)
     VALUES (?, ?, ?)
     ON CONFLICT (item_id, visitor_id) DO UPDATE SET rating = excluded.rating`
  )
    .bind(id, visitorId, rating)
    .run();

  const agg = await env.DB.prepare(
    "SELECT AVG(rating) AS avg_rating, COUNT(*) AS n FROM ratings WHERE item_id = ?"
  )
    .bind(id)
    .first();

  return json({
    my_rating: rating,
    avg_rating: agg.avg_rating ? Math.round(agg.avg_rating * 10) / 10 : null,
    rating_count: agg.n,
  });
}

// GET /api/items/:id/comments
export async function handleListComments(env, id) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, text, created_at FROM comments WHERE item_id = ? ORDER BY created_at ASC"
  )
    .bind(id)
    .all();
  return json({ comments: results });
}

// POST /api/items/:id/comments   Body: { visitorId, name, text }
export async function handleAddComment(request, env, id) {
  const body = await readJson(request);
  const visitorId = body?.visitorId;
  const name = (body?.name || "").trim().slice(0, 40);
  const text = (body?.text || "").trim().slice(0, 1000);

  if (!visitorId) return error("visitorId fehlt.");
  if (!name) return error("Bitte einen Namen angeben.");
  if (!text) return error("Kommentar ist leer.");

  const commentId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO comments (id, item_id, visitor_id, name, text) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(commentId, id, visitorId, name, text)
    .run();

  const comment = await env.DB.prepare(
    "SELECT id, name, text, created_at FROM comments WHERE id = ?"
  )
    .bind(commentId)
    .first();

  return json({ comment }, { status: 201 });
}
