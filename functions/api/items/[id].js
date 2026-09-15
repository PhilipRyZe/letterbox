import { json, error } from "../../_utils/http.js";
import { getItem } from "../../_utils/items.js";

// GET /api/items/:id
// Optionaler Header X-Visitor-Id, damit die Antwort verrät, ob DIESER
// Besucher das Item schon geliked/bewertet hat.
export async function onRequestGet({ request, env, params }) {
  const visitorId = request.headers.get("X-Visitor-Id");
  const item = await getItem(env.DB, params.id, visitorId);
  if (!item) return error("Nicht gefunden.", 404);
  return json({ item });
}
