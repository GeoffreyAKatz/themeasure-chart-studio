// netlify/functions/charts.mjs
//
// Library persistence for Chart Studio, backed by Netlify Blobs — zero-config object
// storage available to any Netlify function. Exposes CRUD over one named store at
// /api/charts. The app's storage layer calls this; saved charts survive refreshes,
// are shared across devices/users, and need no separate database.

import { getStore } from "@netlify/blobs";

export default async (req) => {
  // "strong" consistency so a chart just saved is immediately visible on the next read
  const store = getStore({ name: "chart-studio", consistency: "strong" });

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const prefix = url.searchParams.get("prefix") || "";
  const full = url.searchParams.get("full");

  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { "content-type": "application/json" },
    });

  try {
    if (req.method === "GET") {
      // single key
      if (key) {
        const value = await store.get(key); // string | null
        return json({ key, value: value ?? null });
      }
      // list keys under a prefix
      const { blobs } = await store.list({ prefix });
      // bulk read: return every value under the prefix in one response
      if (full) {
        const items = await Promise.all(
          blobs.map(async (b) => ({ key: b.key, value: await store.get(b.key) }))
        );
        return json({ items });
      }
      return json({ keys: blobs.map((b) => b.key) });
    }

    if (req.method === "POST") {
      const body = await req.json(); // { key, value } — value is a string
      if (!body || typeof body.key !== "string") return json({ error: "key required" }, 400);
      await store.set(body.key, String(body.value ?? ""));
      return json({ key: body.key, value: body.value });
    }

    if (req.method === "DELETE") {
      if (!key) return json({ error: "key required" }, 400);
      await store.delete(key);
      return json({ key, deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    return json({ error: "Blobs error", detail: String(err) }, 500);
  }
};

// Serve at /api/charts (matches STORE_ENDPOINT in the app)
export const config = { path: "/api/charts" };
