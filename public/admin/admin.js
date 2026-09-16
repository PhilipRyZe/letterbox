const form = document.getElementById("create-form");
const msgEl = document.getElementById("create-msg");
const listEl = document.getElementById("admin-list");

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
  const items = data.items || [];

  listEl.innerHTML = items.length
    ? items.map(rowHtml).join("")
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
        <button data-comments="${item.id}">Kommentare (${item.comment_count ?? 0})</button>
        <button data-edit-rating="${item.id}">Bewertung</button>
        <button class="danger" data-delete="${item.id}">Löschen</button>
      </div>
      <div class="admin-comments" id="comments-${item.id}" hidden></div>
    </div>
  `;
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

loadList();
