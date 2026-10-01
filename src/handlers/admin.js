import { json, error, readJson, requireAdmin } from "../utils/http.js";
import { ITEM_TYPES } from "../utils/items.js";
import { keyFromUrl } from "../utils/media.js";

const FIELDS = [
  "type",
  "title",
  "year",
  "cover_url",
  "video_url",
  "tiktok_url",
  "description",
  "host_rating",
  "host_note",
];

function isHttpsUrl(value) {
  return typeof value === "string" && /^https:\/\/\S+$/i.test(value);
}

// POST /admin/api/items
export async function handleCreateItem(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const { type, title } = body || {};
  if (!ITEM_TYPES.includes(type)) {
    return error("type muss film, serie, game oder edit sein.");
  }
  if (!title || !title.trim()) {
    return error("Titel fehlt.");
  }
  if (type === "edit" && !isHttpsUrl(body.video_url)) {
    return error("Für einen Edit wird eine Video-URL (https://…) benötigt.");
  }
  if (body.video_url && !isHttpsUrl(body.video_url)) {
    return error("Ungültige Video-URL.");
  }
  if (body.tiktok_url && !isHttpsUrl(body.tiktok_url)) {
    return error("Ungültiger TikTok-Link (muss mit https:// beginnen).");
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO items (id, type, title, year, cover_url, video_url, tiktok_url, description, host_rating, host_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      type,
      title.trim(),
      body.year || null,
      body.cover_url || null,
      body.video_url || null,
      body.tiktok_url || null,
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

  if ("type" in body && !ITEM_TYPES.includes(body.type)) {
    return error("Ungültiger type.");
  }
  if (body.video_url && !isHttpsUrl(body.video_url)) {
    return error("Ungültige Video-URL.");
  }
  if (body.tiktok_url && !isHttpsUrl(body.tiktok_url)) {
    return error("Ungültiger TikTok-Link (muss mit https:// beginnen).");
  }

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
// Löscht den Eintrag UND – falls die Dateien aus dem Edits-Bucket stammen –
// auch Video und Vorschaubild dort, damit der Speicher wieder frei wird.
export async function handleDeleteItem(request, env, id) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const row = await env.DB.prepare("SELECT video_url, cover_url FROM items WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return error("Nicht gefunden.", 404);

  await env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();

  if (env.EDITS) {
    const keys = [keyFromUrl(env, row.video_url), keyFromUrl(env, row.cover_url)].filter(Boolean);
    if (keys.length) {
      try {
        await env.EDITS.delete(keys);
      } catch {
        // Eintrag ist schon weg; eine übrig gebliebene Datei ist kein Drama
      }
    }
  }

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
