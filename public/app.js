// Anonyme Besucher-ID: einmal generiert, dauerhaft im Browser gespeichert.
// Kein Login – dient nur dazu, Doppel-Likes/-Bewertungen im selben
// Browser zu verhindern und eigene Kommentare/Bewertungen wiederzuerkennen.
function getVisitorId() {
  let id = localStorage.getItem("letterbox_visitor_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("letterbox_visitor_id", id);
  }
  return id;
}
const VISITOR_ID = getVisitorId();

const TYPE_LABEL = { film: "Film", serie: "Serie", game: "Game" };

const shelfEl = document.getElementById("shelf");
const emptyStateEl = document.getElementById("empty-state");
const searchEl = document.getElementById("search");
const filtersEl = document.getElementById("filters");
const overlayEl = document.getElementById("overlay");
const ticketBodyEl = document.getElementById("ticket-body");

let allItems = [];
let activeType = "";

async function loadItems() {
  const url = activeType ? `/api/items?type=${activeType}` : "/api/items";
  const res = await fetch(url);
  const data = await res.json();
  allItems = data.items || [];
  renderShelf();
}

function renderShelf() {
  const query = searchEl.value.trim().toLowerCase();
  const items = allItems.filter((i) => i.title.toLowerCase().includes(query));

  shelfEl.innerHTML = "";
  emptyStateEl.hidden = items.length > 0;

  for (const item of items) {
    const card = document.createElement("button");
    card.className = "cover-card";
    card.innerHTML = `
      <div class="cover-art">
        ${
          item.cover_url
            ? `<img src="${escapeAttr(item.cover_url)}" alt="" loading="lazy" />`
            : `<div class="placeholder-initial">${escapeHtml(item.title[0] || "?")}</div>`
        }
        <span class="type-tag ${item.type}"></span>
        ${item.host_rating ? `<span class="host-stamp">${item.host_rating}</span>` : ""}
      </div>
      <div class="cover-meta">
        <div class="title">${escapeHtml(item.title)}</div>
        <div class="sub">${item.year || ""} · ${item.like_count} ♥${
      item.avg_rating ? ` · Ø ${item.avg_rating}` : ""
    }</div>
      </div>
    `;
    card.addEventListener("click", () => openTicket(item.id));
    shelfEl.appendChild(card);
  }
}

filtersEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter");
  if (!btn) return;
  filtersEl.querySelectorAll(".filter").forEach((b) => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  activeType = btn.dataset.type;
  loadItems();
});

searchEl.addEventListener("input", renderShelf);

document.getElementById("close-overlay").addEventListener("click", closeTicket);
overlayEl.addEventListener("click", (e) => {
  if (e.target === overlayEl) closeTicket();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeTicket();
});

function closeTicket() {
  overlayEl.hidden = true;
  ticketBodyEl.innerHTML = "";
}

async function openTicket(id) {
  const res = await fetch(`/api/items/${id}`, {
    headers: { "X-Visitor-Id": VISITOR_ID },
  });
  if (!res.ok) return;
  const { item } = await res.json();
  renderTicket(item);
  overlayEl.hidden = false;
  loadComments(id);
}

function renderTicket(item) {
  ticketBodyEl.innerHTML = `
    <div class="ticket-top">
      <div class="ticket-cover">
        ${
          item.cover_url
            ? `<img src="${escapeAttr(item.cover_url)}" alt="" />`
            : `<div class="placeholder-initial">${escapeHtml(item.title[0] || "?")}</div>`
        }
      </div>
      <div>
        <h2 class="ticket-title">${escapeHtml(item.title)}</h2>
        <div class="ticket-sub">${TYPE_LABEL[item.type]}${item.year ? " · " + item.year : ""}</div>
        ${item.description ? `<p class="ticket-desc">${escapeHtml(item.description)}</p>` : ""}

        <hr class="tear-line" />

        <div class="verdicts">
          <div class="verdict host">
            <div class="label">Philip</div>
            <div class="value">${item.host_rating ? item.host_rating + "/10" : "–"}</div>
          </div>
          <div class="verdict">
            <div class="label">Besucher-Ø (${item.rating_count})</div>
            <div class="value">${item.avg_rating ? item.avg_rating + "/10" : "–"}</div>
          </div>
        </div>
        ${item.host_note ? `<p class="ticket-desc" style="margin-top:12px">„${escapeHtml(item.host_note)}“ – Philip</p>` : ""}

        <div class="actions">
          <button class="like-btn ${item.liked_by_me ? "is-liked" : ""}" id="like-btn" data-id="${item.id}">
            ${item.liked_by_me ? "♥ Gefällt dir" : "♡ Gefällt mir"}
          </button>
          <div class="rate-row">
            Deine Bewertung
            <select id="rate-select" data-id="${item.id}">
              <option value="">–</option>
              ${Array.from({ length: 10 }, (_, i) => i + 1)
                .map(
                  (n) =>
                    `<option value="${n}" ${item.my_rating === n ? "selected" : ""}>${n}</option>`
                )
                .join("")}
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="comments">
      <h3>Kommentare</h3>
      <div id="comment-list"></div>
      <form class="comment-form" id="comment-form" data-id="${item.id}">
        <input type="text" name="name" placeholder="Dein Name" maxlength="40" required />
        <textarea name="text" rows="2" placeholder="Was denkst du?" maxlength="1000" required></textarea>
        <button type="submit">Kommentieren</button>
      </form>
    </div>
  `;

  document.getElementById("like-btn").addEventListener("click", toggleLike);
  document.getElementById("rate-select").addEventListener("change", submitRating);
  document.getElementById("comment-form").addEventListener("submit", submitComment);
}

async function toggleLike(e) {
  // Wichtig: e.currentTarget VOR dem await sichern. Der Browser setzt
  // currentTarget zurück, sobald der Event-Handler synchron durchgelaufen
  // ist – bei async-Funktionen also schon nach dem ersten await. Danach
  // ist e.currentTarget null, ein Zugriff darauf wirft einen (bisher
  // unbemerkten) Fehler und die UI aktualisiert sich nicht mehr, obwohl
  // der Like serverseitig längst gespeichert wurde.
  const btn = e.currentTarget;
  const id = btn.dataset.id;

  const res = await fetch(`/api/items/${id}/like`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ visitorId: VISITOR_ID }),
  });
  const data = await res.json();
  btn.classList.toggle("is-liked", data.liked);
  btn.textContent = data.liked ? "♥ Gefällt dir" : "♡ Gefällt mir";
}

async function submitRating(e) {
  const select = e.currentTarget; // vor dem await sichern, siehe toggleLike
  const id = select.dataset.id;
  const rawValue = select.value; // "" wenn "–" gewählt wurde

  const res = rawValue
    ? await fetch(`/api/items/${id}/rating`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visitorId: VISITOR_ID, rating: Number(rawValue) }),
      })
    : await fetch(`/api/items/${id}/rating`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visitorId: VISITOR_ID }),
      });

  const data = await res.json();
  const valueEl = document.querySelectorAll(".verdict .value")[1];
  if (valueEl) valueEl.textContent = data.avg_rating ? data.avg_rating + "/10" : "–";
  const labelEl = document.querySelectorAll(".verdict .label")[1];
  if (labelEl) labelEl.textContent = `Besucher-Ø (${data.rating_count})`;
}

async function loadComments(id) {
  const res = await fetch(`/api/items/${id}/comments`);
  const data = await res.json();
  renderComments(data.comments || []);
}

function renderComments(comments) {
  const listEl = document.getElementById("comment-list");
  if (!listEl) return;
  listEl.innerHTML = comments.length
    ? comments
        .map(
          (c) => `
      <div class="comment">
        <span class="who">${escapeHtml(c.name)}</span>
        <span class="when">${formatDate(c.created_at)}</span>
        <p>${escapeHtml(c.text)}</p>
      </div>`
        )
        .join("")
    : `<p style="color:var(--muted);font-size:14px;">Noch keine Kommentare – sei der/die Erste.</p>`;
}

async function submitComment(e) {
  e.preventDefault();
  const form = e.currentTarget; // wird vor dem await genutzt/gesichert, ok
  const id = form.dataset.id;
  const name = form.elements.name.value.trim();
  const text = form.elements.text.value.trim();
  if (!name || !text) return;

  const res = await fetch(`/api/items/${id}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ visitorId: VISITOR_ID, name, text }),
  });
  if (res.ok) {
    form.elements.text.value = "";
    loadComments(id);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

function formatDate(iso) {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

loadItems();
