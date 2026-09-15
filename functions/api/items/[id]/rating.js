import { json, error, readJson } from "../../../_utils/http.js";

// POST /api/items/:id/rating   Body: { visitorId, rating }  (1–10)
// Upsert: jeder Besucher hat immer nur EINE Bewertung pro Item, ein
// erneutes Abschicken überschreibt seine alte Zahl.
export async function onRequestPost({ request, env, params }) {
  const body = await readJson(request);
  const visitorId = body?.visitorId;
  const rating = Number(body?.rating);

  if (!visitorId) return error("visitorId fehlt.");
  if (!rating || rating < 1 || rating > 10) {
    return error("rating muss zwischen 1 und 10 liegen.");
  }

  const itemId = params.id;
  await env.DB.prepare(
    `INSERT INTO ratings (item_id, visitor_id, rating)
     VALUES (?, ?, ?)
     ON CONFLICT (item_id, visitor_id) DO UPDATE SET rating = excluded.rating`
  )
    .bind(itemId, visitorId, rating)
    .run();

  const agg = await env.DB.prepare(
    "SELECT AVG(rating) AS avg_rating, COUNT(*) AS n FROM ratings WHERE item_id = ?"
  )
    .bind(itemId)
    .first();

  return json({
    my_rating: rating,
    avg_rating: agg.avg_rating ? Math.round(agg.avg_rating * 10) / 10 : null,
    rating_count: agg.n,
  });
}
