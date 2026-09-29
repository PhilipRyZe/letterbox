// Helfer rund um die Dateien (Videos + Vorschaubilder) im R2-Bucket der Edits.

// Erlaubte Schlüssel im Bucket: nur videos/… und posters/… mit einfachem Dateinamen.
export const KEY_PATTERN = /^(videos|posters)\/[A-Za-z0-9._-]+$/;

// Öffentliche URL einer Datei im Bucket (über die Custom Domain).
export function mediaUrl(env, key) {
  const base = (env.MEDIA_BASE_URL || "").replace(/\/+$/, "");
  return `${base}/${key}`;
}

// Gegenstück: aus einer URL wieder den R2-Schlüssel machen. Gibt null zurück,
// wenn die URL nicht aus unserem Bucket stammt (z. B. ein externes Cover-Bild).
// Solche Dateien werden beim Löschen bewusst nie angefasst.
export function keyFromUrl(env, url) {
  const base = (env.MEDIA_BASE_URL || "").replace(/\/+$/, "");
  if (!url || !base || !url.startsWith(base + "/")) return null;
  let key;
  try {
    key = decodeURIComponent(url.slice(base.length + 1).split("?")[0]);
  } catch {
    return null;
  }
  return KEY_PATTERN.test(key) ? key : null;
}
