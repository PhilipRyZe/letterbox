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

const TYPE_LABEL = { film: "Film", serie: "Serie", game: "Game", edit: "Edit" };

const shelfEl = document.getElementById("shelf");
const emptyStateEl = document.getElementById("empty-state");
const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");
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
  const items = allItems
    .filter((i) => i.title.toLowerCase().includes(query))
    .sort(sortComparator(sortEl.value));

  shelfEl.innerHTML = "";
  emptyStateEl.hidden = items.length > 0;

  for (const item of items) {
    const card = document.createElement("button");
    card.className = "cover-card" + (item.type === "edit" ? " is-edit" : "");
    card.innerHTML = `
      <div class="cover-art">
        ${
          item.cover_url
            ? `<img src="${escapeAttr(item.cover_url)}" alt="" loading="lazy" />`
            : `<div class="placeholder-initial">${escapeHtml(item.title[0] || "?")}</div>`
        }
        <span class="type-tag ${item.type}"></span>
        ${item.type === "edit" ? `<span class="play-badge" aria-hidden="true">▶</span>` : ""}
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
sortEl.addEventListener("change", renderShelf);

function sortComparator(mode) {
  switch (mode) {
    case "oldest":
      return (a, b) => new Date(a.created_at) - new Date(b.created_at);
    case "title-asc":
      return (a, b) => a.title.localeCompare(b.title, "de");
    case "title-desc":
      return (a, b) => b.title.localeCompare(a.title, "de");
    case "year-desc":
      return (a, b) => (b.year || 0) - (a.year || 0);
    case "year-asc":
      return (a, b) => (a.year || 9999) - (b.year || 9999);
    case "rating":
      return (a, b) => (b.avg_rating || 0) - (a.avg_rating || 0);
    case "likes":
      return (a, b) => (b.like_count || 0) - (a.like_count || 0);
    case "newest":
    default:
      return (a, b) => new Date(b.created_at) - new Date(a.created_at);
  }
}

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

// TikTok-Logo (einfarbig, übernimmt die Textfarbe)
const TIKTOK_ICON = `<svg class="tiktok-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`;

function renderTicket(item) {
  // Link zum Original auf TikTok: Logo + kurzer Text + Pfeil, öffnet im neuen Tab.
  const tiktokHtml =
    item.tiktok_url && /^https?:\/\//i.test(item.tiktok_url)
      ? `<div class="ticket-links">
           <a class="tiktok-link" href="${escapeAttr(item.tiktok_url)}"
              target="_blank" rel="noopener noreferrer nofollow"
              title="Original auf TikTok ansehen (öffnet TikTok in neuem Tab)"
              aria-label="Original auf TikTok ansehen (öffnet in neuem Tab)">
             ${TIKTOK_ICON}<span>Auf TikTok ansehen</span><span class="ext" aria-hidden="true">↗</span>
           </a>
         </div>`
      : "";

  // Edits zeigen oben einen Video-Player statt des Poster-Covers.
  const isEdit = item.type === "edit" && !!item.video_url;
  const videoHtml = isEdit
    ? `<div class="ticket-video">
         <video controls playsinline preload="metadata"
           ${item.cover_url ? `poster="${escapeAttr(item.cover_url)}"` : ""}
           src="${escapeAttr(item.video_url)}"></video>
       </div>`
    : "";
  const coverHtml = isEdit
    ? ""
    : `<div class="ticket-cover">
        ${
          item.cover_url
            ? `<img src="${escapeAttr(item.cover_url)}" alt="" />`
            : `<div class="placeholder-initial">${escapeHtml(item.title[0] || "?")}</div>`
        }
      </div>`;

  ticketBodyEl.innerHTML = `
    ${videoHtml}
    <div class="ticket-top${isEdit ? " no-cover" : ""}">
      ${coverHtml}
      <div>
        <h2 class="ticket-title">${escapeHtml(item.title)}</h2>
        <div class="ticket-sub">${TYPE_LABEL[item.type]}${item.year ? " · " + item.year : ""}</div>
        ${item.description ? `<p class="ticket-desc">${linkify(item.description)}</p>` : ""}
        ${tiktokHtml}

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
        ${item.host_note ? `<p class="ticket-desc" style="margin-top:12px">„${linkify(item.host_note)}“ – Philip</p>` : ""}

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

// Macht aus http(s)-Adressen im Text anklickbare Links (öffnen im neuen Tab).
// Der Text wird zuerst maskiert, erst danach werden Links eingesetzt – so
// kann niemand HTML einschleusen.
function linkify(text) {
  return escapeHtml(text).replace(/https?:\/\/[^\s<]+/g, (match) => {
    // Satzzeichen am Ende gehören nicht zum Link
    const trailing = match.match(/(?:[.,;:!?)\]]|&quot;|&#39;|&gt;)+$/);
    const tail = trailing ? trailing[0] : "";
    const url = tail ? match.slice(0, -tail.length) : match;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>${tail}`;
  });
}

function formatDate(iso) {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

loadItems();
