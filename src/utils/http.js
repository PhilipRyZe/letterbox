// Kleine Helfer für konsistente JSON-Antworten in allen Functions.

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export function error(message, status = 400) {
  return json({ error: message }, { status });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Prüft, ob die Anfrage über Cloudflare Access gelaufen ist (Header wird
// von Access nur nach erfolgreicher Anmeldung gesetzt) und – falls
// ADMIN_EMAIL konfiguriert ist – ob die E-Mail-Adresse übereinstimmt.
// Greift nur als zusätzliche Absicherung; der eigentliche Login läuft
// komplett über die Cloudflare-Access-Policy auf /admin/*.
export function requireAdmin(request, env) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!email) {
    return error("Nicht angemeldet.", 401);
  }
  if (env.ADMIN_EMAIL && email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) {
    return error("Kein Zugriff.", 403);
  }
  return null; // null = alles gut, weitermachen
}
