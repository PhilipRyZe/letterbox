const form = document.getElementById("create-form");
const msgEl = document.getElementById("create-msg");
const listEl = document.getElementById("admin-list");
const submitBtn = document.getElementById("create-submit");
const videoField = document.getElementById("video-field");
const videoFileInput = document.getElementById("video-file");
const usageNote = document.getElementById("usage-note");
const uploadProgress = document.getElementById("upload-progress");
const uploadBar = document.getElementById("upload-bar");

const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB pro Teil (R2 verlangt mindestens 5 MB)

let currentItems = [];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

// ---------- Frame-Auswahl für das Vorschaubild ----------

function framePickerHtml() {
  return `
    <span class="field-label">Vorschaubild: Bild im Video auswählen</span>
    <video data-pick-video muted playsinline></video>
    <input type="range" data-pick-slider min="0" max="0" step="0.01" value="0" />
    <div class="picker-row">
      <div class="picker-steps">
        <button type="button" class="btn-ghost" data-pick-prev>◀ 0,1 s</button>
        <button type="button" class="btn-ghost" data-pick-next>0,1 s ▶</button>
        <span class="picker-time" data-pick-time>0:00,00</span>
      </div>
      <canvas class="picker-preview" data-pick-preview width="240" height="240"></canvas>
    </div>
    <p class="field-hint" data-pick-msg>Das angezeigte Bild wird als Vorschau genutzt. Rechts siehst du den quadratischen Ausschnitt (1:1), wie er auf der Karte erscheint.</p>
  `;
}

// Steuert Video + Schieberegler + Vorschau innerhalb von `root`.
// capture() liefert das aktuell angezeigte Bild als JPEG-Blob (oder null).
function createFramePicker(root) {
  const video = root.querySelector("[data-pick-video]");
  const slider = root.querySelector("[data-pick-slider]");
  const prevBtn = root.querySelector("[data-pick-prev]");
  const nextBtn = root.querySelector("[data-pick-next]");
  const timeEl = root.querySelector("[data-pick-time]");
  const previewEl = root.querySelector("[data-pick-preview]");
  const msgEl = root.querySelector("[data-pick-msg]");
  const defaultMsg = msgEl.textContent;

  let ready = false;
  let objectUrl = null;

  function fmt(t) {
    const m = Math.floor(t / 60);
    const s = (t - m * 60).toFixed(2).replace(".", ",").padStart(5, "0");
    return `${m}:${s}`;
  }

  function drawPreview() {
    if (!video.videoWidth) return;
    const s = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - s) / 2;
    const sy = (video.videoHeight - s) / 2;
    previewEl.getContext("2d").drawImage(video, sx, sy, s, s, 0, 0, previewEl.width, previewEl.height);
  }

  function seekTo(t) {
    const max = video.duration || 0;
    const clamped = Math.max(0, Math.min(max, t));
    video.currentTime = clamped;
    slider.value = clamped;
    timeEl.textContent = fmt(clamped);
  }

  video.addEventListener("loadedmetadata", () => {
    slider.max = video.duration || 0;
    seekTo(Math.min(1, (video.duration || 1) / 2));
  });
  video.addEventListener("seeked", () => {
    ready = true;
    drawPreview();
  });
  video.addEventListener("error", () => {
    if (!video.getAttribute("src")) return;
    ready = false;
    msgEl.textContent =
      "Video konnte nicht geladen werden. (Bei bestehenden Edits: Im R2-Bucket muss CORS für diese Seite erlaubt sein.)";
    msgEl.classList.add("is-error");
  });
  slider.addEventListener("input", () => seekTo(Number(slider.value)));
  prevBtn.addEventListener("click", () => seekTo(video.currentTime - 0.1));
  nextBtn.addEventListener("click", () => seekTo(video.currentTime + 0.1));

  function load(src, opts = {}) {
    ready = false;
    msgEl.textContent = defaultMsg;
    msgEl.classList.remove("is-error");
    if (opts.crossOrigin) video.crossOrigin = "anonymous";
    else video.removeAttribute("crossorigin");
    video.preload = opts.preload || "auto";
    video.src = src;
    video.load();
  }

  function releaseObjectUrl() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  return {
    loadFile(file) {
      releaseObjectUrl();
      objectUrl = URL.createObjectURL(file);
      load(objectUrl);
    },
    load,
    clear() {
      ready = false;
      releaseObjectUrl();
      video.removeAttribute("src");
      video.load();
      slider.value = 0;
      previewEl.getContext("2d").clearRect(0, 0, previewEl.width, previewEl.height);
    },
    async capture() {
      if (!ready || !video.videoWidth) return null;
      if (video.seeking) {
        await new Promise((r) => video.addEventListener("seeked", r, { once: true }));
      }
      try {
        const scale = Math.min(1, 1280 / video.videoWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85));
      } catch {
        return null; // z. B. CORS fehlt -> Canvas ist gesperrt
      }
    },
  };
}

// Picker im "Neuer Eintrag"-Formular
const pickerSlot = document.getElementById("frame-picker-slot");
pickerSlot.innerHTML = framePickerHtml();
const createPicker = createFramePicker(pickerSlot);

function resetCreatePicker() {
  createPicker.clear();
  pickerSlot.hidden = true;
}

// Bei Typ "Edit" erscheint das Feld für die Video-Datei.
form.elements.type.addEventListener("change", () => {
  const isEdit = form.elements.type.value === "edit";
  videoField.hidden = !isEdit;
  if (isEdit) loadUsage();
  else resetCreatePicker();
});

// Sobald ein Video gewählt ist, erscheint die Frame-Auswahl.
videoFileInput.addEventListener("change", () => {
  const file = videoFileInput.files[0];
  if (file) {
    pickerSlot.hidden = false;
    createPicker.loadFile(file);
  } else {
    resetCreatePicker();
  }
});

async function loadUsage() {
  try {
    const res = await fetch("/admin/api/edits-usage");
    if (!res.ok) throw new Error();
    const { usedBytes, maxBytes } = await res.json();
    usageNote.textContent = `Edits-Speicher: ${formatBytes(usedBytes)} von ${formatBytes(maxBytes)} belegt`;
  } catch {
    usageNote.textContent = "";
  }
}

function setProgress(fraction) {
  uploadProgress.hidden = false;
  uploadBar.style.width = Math.min(100, Math.round(fraction * 100)) + "%";
}

// Erzeugt aus dem Video ein Vorschaubild (JPEG) direkt im Browser.
// Gibt null zurück, wenn das nicht klappt (z. B. Codec nicht abspielbar) –
// dann wird der Edit einfach ohne Vorschaubild angelegt.
function makePoster(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    let finished = false;
    const finish = (blob) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      resolve(blob);
    };
    const timer = setTimeout(() => finish(null), 15000);

    video.addEventListener("error", () => finish(null));
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(1, (video.duration || 1) / 2);
    });
    video.addEventListener("seeked", () => {
      try {
        if (!video.videoWidth || !video.videoHeight) return finish(null);
        const scale = Math.min(1, 1280 / video.videoWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), "image/jpeg", 0.85);
      } catch {
        finish(null);
      }
    });
    video.src = objectUrl;
  });
}

async function uploadPoster(blob) {
  const res = await fetch("/admin/api/upload/poster", {
    method: "POST",
    headers: { "content-type": "image/jpeg" },
    body: blob,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Vorschaubild-Upload fehlgeschlagen.");
  return res.json(); // { key, url }
}

// Lädt einen einzelnen Teil hoch (XHR, damit der Fortschritt sichtbar ist).
function uploadPart(key, uploadId, partNumber, chunk, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const partUrl =
      `/admin/api/upload/part?key=${encodeURIComponent(key)}` +
      `&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`;
    xhr.open("PUT", partUrl);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error(`Teil ${partNumber} fehlgeschlagen (Status ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error(`Netzwerkfehler bei Teil ${partNumber}`));
    xhr.send(chunk);
  });
}

async function uploadVideo(file, onProgress) {
  const initRes = await fetch("/admin/api/upload/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(err.error || "Upload konnte nicht gestartet werden.");
  }
  const { key, uploadId } = await initRes.json();

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const parts = [];
  let uploadedBytes = 0;

  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const result = await uploadPart(key, uploadId, i + 1, file.slice(start, end), (loaded) => {
        onProgress((uploadedBytes + loaded) / file.size);
      });
      parts.push({ partNumber: i + 1, etag: result.etag });
      uploadedBytes += end - start;
      onProgress(uploadedBytes / file.size);
    }
  } catch (err) {
    // angefangenen Upload wieder aufräumen
    fetch("/admin/api/upload/abort", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, uploadId }),
    }).catch(() => {});
    throw err;
  }

  const completeRes = await fetch("/admin/api/upload/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, uploadId, parts }),
  });
  if (!completeRes.ok) throw new Error("Upload konnte nicht abgeschlossen werden.");
  return completeRes.json(); // { key, url }
}

// Räumt schon hochgeladene Dateien weg, falls danach etwas schiefgeht.
function discardUploads(keys) {
  if (!keys.length) return;
  fetch("/admin/api/upload/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keys }),
  }).catch(() => {});
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const type = fd.get("type");
  const body = {
    type,
    title: fd.get("title"),
    year: fd.get("year") ? Number(fd.get("year")) : null,
    cover_url: fd.get("cover_url") || null,
    description: fd.get("description") || null,
    host_rating: fd.get("host_rating") ? Number(fd.get("host_rating")) : null,
    host_note: fd.get("host_note") || null,
  };

  const uploadedKeys = [];
  submitBtn.disabled = true;

  try {
    // Bei Edits zuerst das Video (und ein Vorschaubild) hochladen
    if (type === "edit") {
      const file = videoFileInput.files[0];
      if (!file) throw new Error("Bitte eine Video-Datei auswählen.");

      if (!body.cover_url) {
        setMsg("Erzeuge Vorschaubild…");
        // Zuerst der im Picker gewählte Frame, sonst Automatik als Rückfall
        let posterBlob = await createPicker.capture();
        if (!posterBlob) posterBlob = await makePoster(file);
        if (posterBlob) {
          const poster = await uploadPoster(posterBlob);
          body.cover_url = poster.url;
          uploadedKeys.push(poster.key);
        }
      }

      setProgress(0);
      setMsg("Video wird hochgeladen… 0 %");
      const video = await uploadVideo(file, (fraction) => {
        setProgress(fraction);
        setMsg(`Video wird hochgeladen… ${Math.round(fraction * 100)} %`);
      });
      body.video_url = video.url;
      uploadedKeys.push(video.key);
    }

    setMsg("Speichere…");
    const res = await fetch("/admin/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Fehler beim Anlegen.");
    }

    form.reset();
    videoField.hidden = true;
    resetCreatePicker();
    uploadProgress.hidden = true;
    setMsg("Angelegt.", "ok");
    loadList();
  } catch (err) {
    discardUploads(uploadedKeys);
    uploadProgress.hidden = true;
    setMsg(err.message || "Fehler beim Anlegen.", "error");
  } finally {
    submitBtn.disabled = false;
  }
});

function setMsg(text, kind) {
  msgEl.textContent = text;
  msgEl.className = "msg" + (kind ? " is-" + kind : "");
}

async function loadList() {
  const res = await fetch("/api/items");
  const data = await res.json();
  currentItems = data.items || [];

  listEl.innerHTML = currentItems.length
    ? currentItems.map(rowHtml).join("")
    : `<p style="color:var(--muted);font-size:14px;">Noch keine Einträge.</p>`;

  listEl.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteItem(btn.dataset.delete));
  });
  listEl.querySelectorAll("[data-edit-rating]").forEach((btn) => {
    btn.addEventListener("click", () => editHostRating(btn.dataset.editRating));
  });
  listEl.querySelectorAll("[data-comments]").forEach((btn) => {
    btn.addEventListener("click", () => toggleComments(btn.dataset.comments));
  });
  listEl.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => toggleEdit(btn.dataset.edit));
  });
}

function rowHtml(item) {
  return `
    <div class="admin-row-wrap">
      <div class="admin-row">
        <div class="thumb${item.type === "edit" ? " is-edit" : ""}">
          ${item.cover_url ? `<img src="${item.cover_url}" alt="" />` : ""}
        </div>
        <div class="info">
          <div class="title">${escapeHtml(item.title)} ${item.year ? `(${item.year})` : ""}</div>
          <div class="sub">${item.type} · Host: ${item.host_rating ?? "–"} · Besucher-Ø: ${item.avg_rating ?? "–"} (${item.rating_count})</div>
        </div>
        <button data-edit="${item.id}">Bearbeiten</button>
        <button data-comments="${item.id}">Kommentare (${item.comment_count ?? 0})</button>
        <button data-edit-rating="${item.id}">Bewertung</button>
        <button class="danger" data-delete="${item.id}">Löschen</button>
      </div>
      <div class="admin-edit" id="edit-${item.id}" hidden></div>
      <div class="admin-comments" id="comments-${item.id}" hidden></div>
    </div>
  `;
}

function toggleEdit(id) {
  const panel = document.getElementById(`edit-${id}`);
  const wasHidden = panel.hidden;
  panel.hidden = !wasHidden;
  if (wasHidden) {
    const item = currentItems.find((i) => i.id === id);
    panel.innerHTML = editFormHtml(item);
    const ctx = { picker: null };
    panel.querySelector("form").addEventListener("submit", (e) => saveEdit(e, id, item, ctx));
    panel.querySelector("[data-cancel-edit]").addEventListener("click", () => {
      if (ctx.picker) ctx.picker.clear();
      panel.hidden = true;
    });
    const openBtn = panel.querySelector("[data-open-picker]");
    if (openBtn) {
      openBtn.addEventListener("click", () => {
        const root = panel.querySelector("[data-picker]");
        root.hidden = false;
        openBtn.hidden = true;
        ctx.picker = createFramePicker(root);
        ctx.picker.load(item.video_url, { crossOrigin: true, preload: "metadata" });
      });
    }
  }
}

function editFormHtml(item) {
  return `
    <form class="item-form">
      <div class="row">
        <select name="type" required>
          <option value="film" ${item.type === "film" ? "selected" : ""}>Film</option>
          <option value="serie" ${item.type === "serie" ? "selected" : ""}>Serie</option>
          <option value="game" ${item.type === "game" ? "selected" : ""}>Game</option>
          <option value="edit" ${item.type === "edit" ? "selected" : ""}>Edit (Video)</option>
        </select>
        <input name="year" type="number" placeholder="Jahr" min="1900" max="2100" value="${item.year ?? ""}" />
      </div>
      <input name="title" type="text" placeholder="Titel" required value="${escapeAttr(item.title)}" />
      <input name="cover_url" type="url" placeholder="Cover-Bild-URL (optional)" value="${escapeAttr(item.cover_url || "")}" />
      ${
        item.type === "edit"
          ? `<input name="video_url" type="url" placeholder="Video-URL" value="${escapeAttr(item.video_url || "")}" />`
          : ""
      }
      ${
        item.type === "edit" && item.video_url
          ? `<button type="button" class="btn-ghost" data-open-picker>Vorschaubild aus dem Video wählen</button>
             <div class="frame-picker" data-picker hidden>${framePickerHtml()}</div>`
          : ""
      }
      <textarea name="description" rows="2" placeholder="Kurzbeschreibung (optional)">${escapeHtml(item.description || "")}</textarea>
      <div class="row">
        <select name="host_rating">
          <option value="">Deine Bewertung…</option>
          ${Array.from({ length: 10 }, (_, i) => i + 1)
            .map((n) => `<option value="${n}" ${item.host_rating === n ? "selected" : ""}>${n}</option>`)
            .join("")}
        </select>
      </div>
      <textarea name="host_note" rows="2" placeholder="Deine kurze Meinung (optional)">${escapeHtml(item.host_note || "")}</textarea>
      <div class="row" style="gap:10px;">
        <button type="submit">Speichern</button>
        <button type="button" data-cancel-edit style="background:none;border:1px solid var(--line);color:var(--muted);">Abbrechen</button>
      </div>
      <p class="msg" data-edit-msg></p>
    </form>
  `;
}

// Liegt das Vorschaubild in unserem Bucket (gleiche Domain wie das Video,
// Ordner posters/)? Dann gibt es den Schlüssel zurück, sonst null.
function ownPosterKey(coverUrl, videoUrl) {
  try {
    const c = new URL(coverUrl);
    const v = new URL(videoUrl);
    if (c.origin !== v.origin) return null;
    const key = decodeURIComponent(c.pathname.slice(1));
    return /^posters\/[A-Za-z0-9._-]+$/.test(key) ? key : null;
  } catch {
    return null;
  }
}

async function saveEdit(e, id, item, ctx) {
  e.preventDefault();
  const formEl = e.currentTarget;
  const msgEl = formEl.querySelector("[data-edit-msg]");
  const fd = new FormData(formEl);
  const body = {
    type: fd.get("type"),
    title: fd.get("title"),
    year: fd.get("year") ? Number(fd.get("year")) : null,
    cover_url: fd.get("cover_url") || null,
    description: fd.get("description") || null,
    host_rating: fd.get("host_rating") ? Number(fd.get("host_rating")) : null,
    host_note: fd.get("host_note") || null,
  };
  if (fd.has("video_url")) body.video_url = fd.get("video_url") || null;

  // Neues Vorschaubild aus dem gewählten Frame
  let newPosterKey = null;
  if (ctx && ctx.picker) {
    msgEl.textContent = "Erzeuge Vorschaubild…";
    msgEl.className = "msg";
    const blob = await ctx.picker.capture();
    if (!blob) {
      msgEl.textContent =
        "Das Bild konnte nicht aus dem Video gelesen werden (vermutlich fehlt CORS im R2-Bucket).";
      msgEl.className = "msg is-error";
      return;
    }
    try {
      const poster = await uploadPoster(blob);
      body.cover_url = poster.url;
      newPosterKey = poster.key;
    } catch (err) {
      msgEl.textContent = err.message || "Vorschaubild-Upload fehlgeschlagen.";
      msgEl.className = "msg is-error";
      return;
    }
  }

  msgEl.textContent = "Speichere…";
  msgEl.className = "msg";
  const res = await fetch(`/admin/api/items/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    // altes, nicht mehr gebrauchtes Vorschaubild aus dem Bucket entfernen
    if (newPosterKey && item.cover_url && item.video_url) {
      const oldKey = ownPosterKey(item.cover_url, item.video_url);
      if (oldKey && oldKey !== newPosterKey) discardUploads([oldKey]);
    }
    await loadList();
  } else {
    if (newPosterKey) discardUploads([newPosterKey]);
    const data = await res.json().catch(() => ({}));
    msgEl.textContent = data.error || "Fehler beim Speichern.";
    msgEl.className = "msg is-error";
  }
}

async function toggleComments(id) {
  const panel = document.getElementById(`comments-${id}`);
  const wasHidden = panel.hidden;
  panel.hidden = !wasHidden;
  if (wasHidden) {
    await loadComments(id);
  }
}

async function loadComments(id) {
  const panel = document.getElementById(`comments-${id}`);
  panel.innerHTML = `<p style="color:var(--muted);font-size:13px;">Lade…</p>`;

  const res = await fetch(`/api/items/${id}/comments`);
  const data = await res.json();
  const comments = data.comments || [];

  panel.innerHTML = comments.length
    ? comments.map(commentRowHtml).join("")
    : `<p style="color:var(--muted);font-size:13px;">Keine Kommentare.</p>`;

  panel.querySelectorAll("[data-delete-comment]").forEach((btn) => {
    btn.addEventListener("click", () => deleteComment(btn.dataset.deleteComment, id));
  });
}

function commentRowHtml(c) {
  return `
    <div class="admin-comment">
      <div>
        <span class="who">${escapeHtml(c.name)}</span>
        <p>${escapeHtml(c.text)}</p>
      </div>
      <button class="danger" data-delete-comment="${c.id}">Löschen</button>
    </div>
  `;
}

async function deleteComment(commentId, itemId) {
  if (!confirm("Kommentar wirklich löschen?")) return;
  await fetch(`/admin/api/comments/${commentId}`, { method: "DELETE" });
  loadComments(itemId);
}

async function editHostRating(id) {
  const rating = prompt("Deine Bewertung (1–10, leer lassen für keine):");
  if (rating === null) return;
  const note = prompt("Kurze Meinung (optional):") || "";

  await fetch(`/admin/api/items/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      host_rating: rating ? Number(rating) : null,
      host_note: note || null,
    }),
  });
  loadList();
}

async function deleteItem(id) {
  if (!confirm("Diesen Eintrag wirklich löschen?")) return;
  await fetch(`/admin/api/items/${id}`, { method: "DELETE" });
  loadList();
  if (!videoField.hidden) loadUsage();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

loadList();
