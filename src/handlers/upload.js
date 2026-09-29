import { json, error, readJson, requireAdmin } from "../utils/http.js";
import { KEY_PATTERN, mediaUrl } from "../utils/media.js";

// Speichergrenze für den Edits-Bucket. Vom kostenlosen R2-Speicher (10 GB)
// sind 2 GB für den Datei-Uploader reserviert, 8 GB für die Edits. Hier sind
// 7,5 GB als Puffer eingestellt – zum Ändern einfach die Zahl anpassen.
const MAX_TOTAL_BYTES = 7.5 * 1024 * 1024 * 1024;

const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB pro Video
const MAX_POSTER_BYTES = 2 * 1024 * 1024; // 2 MB pro Vorschaubild
const VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm" };
const CACHE = "public, max-age=31536000, immutable"; // Dateinamen sind einmalig

// Tatsächlich belegter Speicher: direkt aus der R2-Objektliste berechnet
// (immer korrekt, auch wenn Dateien direkt im Dashboard gelöscht wurden).
async function getUsedBytes(env) {
  let total = 0;
  let cursor;
  do {
    const listing = await env.EDITS.list({ cursor });
    for (const obj of listing.objects) total += obj.size;
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
  return total;
}

// GET /admin/api/edits-usage
export async function handleUsage(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const usedBytes = await getUsedBytes(env);
  return json({ usedBytes, maxBytes: MAX_TOTAL_BYTES });
}

// POST /admin/api/upload/init   Body: { contentType, size }
export async function handleUploadInit(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const contentType = String(body?.contentType || "");
  const size = Number(body?.size) || 0;

  const ext = VIDEO_TYPES[contentType];
  if (!ext) return error("Nur MP4- oder WebM-Videos werden unterstützt.");
  if (size <= 0 || size > MAX_VIDEO_BYTES) {
    return error(`Video zu groß (max. ${MAX_VIDEO_BYTES / 1024 / 1024} MB).`);
  }

  const used = await getUsedBytes(env);
  if (used + size > MAX_TOTAL_BYTES) {
    const freeGB = (Math.max(0, MAX_TOTAL_BYTES - used) / 1024 / 1024 / 1024).toFixed(2);
    return error(`Speicherlimit erreicht. Noch frei: ${freeGB} GB.`);
  }

  const key = `videos/${crypto.randomUUID()}.${ext}`;
  const multipart = await env.EDITS.createMultipartUpload(key, {
    httpMetadata: { contentType, cacheControl: CACHE },
  });
  return json({ key, uploadId: multipart.uploadId });
}

// PUT /admin/api/upload/part?key=…&uploadId=…&partNumber=…
export async function handleUploadPart(request, env, url) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const key = url.searchParams.get("key");
  const uploadId = url.searchParams.get("uploadId");
  const partNumber = parseInt(url.searchParams.get("partNumber"), 10);
  if (!key || !KEY_PATTERN.test(key) || !key.startsWith("videos/") || !uploadId || !partNumber) {
    return error("key, uploadId und partNumber erforderlich.");
  }

  const multipart = env.EDITS.resumeMultipartUpload(key, uploadId);
  const part = await multipart.uploadPart(partNumber, request.body);
  return json({ partNumber, etag: part.etag });
}

// POST /admin/api/upload/complete   Body: { key, uploadId, parts }
export async function handleUploadComplete(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const { key, uploadId, parts } = body || {};
  if (!key || !KEY_PATTERN.test(key) || !key.startsWith("videos/") || !uploadId || !Array.isArray(parts)) {
    return error("key, uploadId und parts erforderlich.");
  }

  const multipart = env.EDITS.resumeMultipartUpload(key, uploadId);
  await multipart.complete(parts);
  return json({ key, url: mediaUrl(env, key) });
}

// POST /admin/api/upload/abort   Body: { key, uploadId }
export async function handleUploadAbort(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const { key, uploadId } = body || {};
  if (key && KEY_PATTERN.test(key) && uploadId) {
    try {
      await env.EDITS.resumeMultipartUpload(key, uploadId).abort();
    } catch {
      // Ignorieren – evtl. schon abgebrochen
    }
  }
  return json({ ok: true });
}

// POST /admin/api/upload/poster   Body: JPEG-Bild (Vorschaubild des Videos)
export async function handleUploadPoster(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  if ((request.headers.get("content-type") || "") !== "image/jpeg") {
    return error("Vorschaubild muss ein JPEG sein.");
  }
  const data = await request.arrayBuffer();
  if (data.byteLength === 0 || data.byteLength > MAX_POSTER_BYTES) {
    return error("Vorschaubild ist leer oder größer als 2 MB.");
  }

  const key = `posters/${crypto.randomUUID()}.jpg`;
  await env.EDITS.put(key, data, {
    httpMetadata: { contentType: "image/jpeg", cacheControl: CACHE },
  });
  return json({ key, url: mediaUrl(env, key) });
}

// POST /admin/api/upload/delete   Body: { keys: [...] }
// Räumt Dateien weg, falls nach dem Upload das Anlegen des Eintrags scheitert.
export async function handleUploadDelete(request, env) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const keys = (Array.isArray(body?.keys) ? body.keys : []).filter(
    (k) => typeof k === "string" && KEY_PATTERN.test(k)
  );
  if (keys.length) await env.EDITS.delete(keys);
  return json({ ok: true });
}
