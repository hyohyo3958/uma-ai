const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

function validDataKey(key) {
  return typeof key === "string" &&
    key.startsWith("data/") &&
    key.length <= 200 &&
    /^[A-Za-z0-9._/-]+$/.test(key) &&
    !key.includes("..") &&
    !key.includes("//");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/health" && request.method === "GET") {
      return json({ status: "ok", worker: "uma-ai", api: "same-origin" });
    }

    if ((path === "/api/files" || path === "/api/r2-check") && request.method === "GET") {
      const result = await env.BUCKET.list({ prefix: "data/", limit: 1000 });
      return json({
        status: "ok",
        objects: result.objects.map(item => ({
          key: item.key,
          size: item.size,
          uploaded: item.uploaded
        })),
        truncated: result.truncated,
        cursor: result.truncated ? result.cursor : null
      });
    }

    if (path === "/api/data" && request.method === "GET") {
      const key = url.searchParams.get("key") || "";
      if (!validDataKey(key)) return json({ error: "Invalid data key" }, 400);

      const object = await env.BUCKET.get(key);
      if (!object) return json({ error: "Not found" }, 404);

      const headers = new Headers({
        "cache-control": "no-store",
        "content-type": object.httpMetadata?.contentType || "application/octet-stream"
      });
      return new Response(object.body, { headers });
    }

    if (path === "/api/data" && request.method === "POST") {
      const key = url.searchParams.get("key") || "";
      if (!validDataKey(key)) return json({ error: "Invalid data key" }, 400);

      const contentType = request.headers.get("content-type") || "";
      if (!/^(application\/json|text\/csv|text\/plain)(;|$)/i.test(contentType)) {
        return json({ error: "Only JSON, CSV, or plain text is allowed" }, 415);
      }

      const declaredLength = Number(request.headers.get("content-length") || 0);
      if (declaredLength > 10 * 1024 * 1024) {
        return json({ error: "Payload exceeds 10 MB" }, 413);
      }

      const body = await request.arrayBuffer();
      if (body.byteLength > 10 * 1024 * 1024) {
        return json({ error: "Payload exceeds 10 MB" }, 413);
      }

      await env.BUCKET.put(key, body, {
        httpMetadata: { contentType }
      });
      return json({ status: "ok", key, bytes: body.byteLength });
    }

    if (path.startsWith("/api/")) {
      return json({ error: "Not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
