// Publishes every queued post whose time has come. Run on a schedule (GitHub Actions, every 30 min).
// Usage: node scripts/post-due.js            (posts)
//        node scripts/post-due.js --dry-run  (only lists what would post)
import { loadQueue, saveQueue } from "../lib/queue.js";
import * as ig from "../lib/instagram.js";

const DRY = process.argv.includes("--dry-run");
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL || "").replace(/\/$/, "");
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 1);
const url = (f) => (/^https?:\/\//.test(f) ? f : `${MEDIA_BASE_URL}/${encodeURIComponent(f)}`);

const q = loadQueue();
const now = Date.now();
const due = q.filter((p) => p.status === "pending" && Date.parse(p.when) <= now).slice(0, MAX_PER_RUN);
if (!due.length) { console.log("Nothing due."); process.exit(0); }
if (!DRY && !MEDIA_BASE_URL) { console.error("Set MEDIA_BASE_URL (public folder holding the media files)."); process.exit(1); }

let failed = 0;
for (const p of due) {
  console.log(`${DRY ? "[dry-run] " : ""}Posting ${p.id} (${p.type}) scheduled ${p.when}`);
  if (DRY) continue;
  try {
    let r;
    if (p.type === "reel") r = await ig.publishReel({ videoUrl: url(p.files[0]), caption: p.caption });
    else if (p.type === "image") r = await ig.publishImage({ imageUrl: url(p.files[0]), caption: p.caption });
    else if (p.type === "carousel") r = await ig.publishCarousel({ imageUrls: p.files.map(url), caption: p.caption });
    else throw new Error(`Unknown type ${p.type}`);
    Object.assign(p, { status: "posted", posted_at: new Date().toISOString(), media_id: r.id, permalink: r.permalink });
    console.log(`  posted: ${r.permalink || r.id}`);
  } catch (e) {
    failed++;
    p.attempts = (p.attempts || 0) + 1;
    p.last_error = String(e.message || e);
    if (p.attempts >= 3) p.status = "failed";
    console.error(`  failed: ${p.last_error}`);
  }
}
if (!DRY) saveQueue(q);
process.exit(failed ? 1 : 0);
