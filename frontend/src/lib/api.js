const BASE = (import.meta.env?.VITE_API_URL || "").replace(/\/$/, "");

const url = (path) => `${BASE}${path}`;

async function handle(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const msg =
      body?.error ||
      (body && typeof body === "object"
        ? Object.entries(body)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : v}`)
            .join(" · ")
        : null) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body;
}

export async function planTrip(payload) {
  const res = await fetch(url("/api/trips/plan/"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function getTrip(id) {
  return handle(await fetch(url(`/api/trips/${id}/`)));
}

export async function searchPlaces(q, signal) {
  if (!q || q.trim().length < 3) return [];
  try {
    const res = await fetch(url(`/api/geocode/?q=${encodeURIComponent(q)}`), { signal });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}
