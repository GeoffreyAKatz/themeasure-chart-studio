// netlify/functions/extract.mjs
//
// Server-side proxy for Chart Studio's "From image" extraction.
// The browser sends the Anthropic messages payload (image + prompt) to /api/extract;
// this function adds the secret API key and forwards it to Anthropic, then returns the JSON.
//
// The key lives ONLY here, read from the Netlify environment variable ANTHROPIC_API_KEY.
// It is never exposed to the browser.

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not set on this Netlify site." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text(); // pass through verbatim so the client sees real API errors
    return new Response(text, {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Upstream request failed", detail: String(err) }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
};

// Serve this function at /api/extract (matches EXTRACT_ENDPOINT in the app).
export const config = { path: "/api/extract" };
