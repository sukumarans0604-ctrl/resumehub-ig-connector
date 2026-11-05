// Minimal client for the Instagram API with Instagram Login (graph.instagram.com).
// Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing

const API_VERSION = process.env.IG_API_VERSION || "v25.0";
const BASE = process.env.IG_API_BASE || "https://graph.instagram.com";

function token() {
  const t = process.env.IG_ACCESS_TOKEN;
  if (!t) throw new Error("IG_ACCESS_TOKEN is not set");
  return t;
}

async function call(method, path, params = {}) {
  const url = new URL(`${BASE}/${API_VERSION}/${path.replace(/^\//, "")}`);
  const body = new URLSearchParams();
  const all = { ...params, access_token: token() };
  for (const [k, v] of Object.entries(all)) {
    if (v === undefined || v === null) continue;
    (method === "GET" ? url.searchParams : body).set(k, String(v));
  }
  const res = await fetch(url, method === "GET" ? {} : { method, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    throw new Error(`Instagram API ${res.status}: ${e.message || res.statusText} (code ${e.code ?? "?"})`);
  }
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function me() {
  return call("GET", "me", { fields: "user_id,username,name,account_type,followers_count,media_count" });
}

async function igId() {
  if (process.env.IG_USER_ID) return process.env.IG_USER_ID;
  const m = await me();
  return m.user_id || m.id;
}

// Wait until a container is ready to publish (videos need processing time).
export async function waitReady(containerId, { timeoutMs = 10 * 60_000, everyMs = Number(process.env.IG_POLL_MS || 15_000) } = {}) {
  const start = Date.now();
  for (;;) {
    const s = await call("GET", containerId, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") return s;
    if (["ERROR", "EXPIRED"].includes(s.status_code)) throw new Error(`Container ${containerId} ${s.status_code}: ${s.status || ""}`);
    if (Date.now() - start > timeoutMs) throw new Error(`Container ${containerId} still ${s.status_code} after ${timeoutMs / 1000}s`);
    await sleep(everyMs);
  }
}

async function publish(containerId) {
  const id = await igId();
  const r = await call("POST", `${id}/media_publish`, { creation_id: containerId });
  const media = await call("GET", r.id, { fields: "id,permalink,media_type,timestamp" }).catch(() => ({ id: r.id }));
  return media;
}

export async function publishImage({ imageUrl, caption }) {
  const id = await igId();
  const c = await call("POST", `${id}/media`, { image_url: imageUrl, caption });
  await waitReady(c.id, { everyMs: 3000 });
  return publish(c.id);
}

export async function publishReel({ videoUrl, caption, coverUrl, shareToFeed = true }) {
  const id = await igId();
  const c = await call("POST", `${id}/media`, {
    media_type: "REELS", video_url: videoUrl, caption, cover_url: coverUrl, share_to_feed: shareToFeed,
  });
  await waitReady(c.id);
  return publish(c.id);
}

export async function publishCarousel({ imageUrls, caption }) {
  if (imageUrls.length < 2 || imageUrls.length > 10) throw new Error("A carousel needs 2 to 10 images");
  const id = await igId();
  const children = [];
  for (const u of imageUrls) {
    const c = await call("POST", `${id}/media`, { image_url: u, is_carousel_item: true });
    children.push(c.id);
  }
  for (const c of children) await waitReady(c, { everyMs: 3000 });
  const parent = await call("POST", `${id}/media`, { media_type: "CAROUSEL", children: children.join(","), caption });
  await waitReady(parent.id, { everyMs: 3000 });
  return publish(parent.id);
}

export async function publishingLimit() {
  const id = await igId();
  return call("GET", `${id}/content_publishing_limit`, { fields: "config,quota_usage" });
}

export async function recentMedia(limit = 10) {
  const id = await igId();
  return call("GET", `${id}/media`, {
    fields: "id,caption,media_type,permalink,timestamp,like_count,comments_count", limit,
  });
}

export async function mediaInsights(mediaId) {
  return call("GET", `${mediaId}/insights`, { metric: "reach,likes,comments,shares,saved,total_interactions" });
}

export async function comments(mediaId) {
  return call("GET", `${mediaId}/comments`, { fields: "id,text,username,timestamp" });
}

export async function replyToComment(commentId, message) {
  return call("POST", `${commentId}/replies`, { message });
}

export async function refreshToken() {
  const url = new URL(`${BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token());
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Token refresh failed: ${data.error?.message || res.status}`);
  return data; // { access_token, token_type, expires_in }
}
