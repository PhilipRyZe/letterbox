const form = document.getElementById("create-form");
const msgEl = document.getElementById("create-msg");
const listEl = document.getElementById("admin-list");

let currentItems = [];

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const body = {
    type: fd.get("type"),
    title: fd.get("title"),
    year: fd.get("year") ? Number(fd.get("year")) : null,
    cover_url: fd.get("cover_url") || null,
    description: fd.get("description") || null,
    host_rating: fd.get("host_rating") ? Number(fd.get("host_rating")) : null,
    host_note: fd.get("host_note") || null,
  };

  setMsg("Speichere…");
  const res = await fetch("/admin/api/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    form.reset();
    setMsg("Angelegt.", "ok");
    loadList();
  } else {
    const data = await res.json().catch(() => ({}));
    setMsg(data.error || "Fehler beim Anlegen.", "error");
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
        <div class="thumb">
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
    panel.querySelector("form").addEventListener("submit", (e) => saveEdit(e, id));
    panel.querySelector("[data-cancel-edit]").addEventListener("click", () => {
      panel.hidden = true;
    });
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
        </select>
        <input name="year" type="number" placeholder="Jahr" min="1900" max="2100" value="${item.year ?? ""}" />
      </div>
      <input name="title" type="text" placeholder="Titel" required value="${escapeAttr(item.title)}" />
      <input name="cover_url" type="url" placeholder="Cover-Bild-URL (optional)" value="${escapeAttr(item.cover_url || "")}" />
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

async function saveEdit(e, id) {
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

  msgEl.textContent = "Speichere…";
  msgEl.className = "msg";
  const res = await fetch(`/admin/api/items/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    await loadList();
  } else {
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
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

loadList();
