import { json, error } from "../_utils/http.js";
import { listItems } from "../_utils/items.js";

// GET /api/items?type=film|serie|game
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  if (type && !["film", "serie", "game"].includes(type)) {
    return error("Ungültiger type-Filter.");
  }
  const items = await listItems(env.DB, { type });
  return json({ items });
}
