// ResumeHub Instagram connector: a remote MCP server for Claude custom connectors.
// Add it in Claude: Settings → Connectors → Add custom connector → https://<your-host>/mcp/<CONNECTOR_SECRET>
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import * as ig from "./lib/instagram.js";
import { loadQueue, saveQueue } from "./lib/queue.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SECRET = process.env.CONNECTOR_SECRET;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL || `${PUBLIC_BASE_URL}/media`).replace(/\/$/, "");
if (!SECRET || SECRET.length < 16) {
  console.error("Set CONNECTOR_SECRET to a random string of at least 16 characters.");
  process.exit(1);
}

const text = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: String(e.message || e) }] });
const mediaUrl = (f) => (/^https?:\/\//.test(f) ? f : `${MEDIA_BASE_URL}/${encodeURIComponent(f)}`);
const wrap = (fn) => async (args) => { try { return text(await fn(args)); } catch (e) { return fail(e); } };

function buildServer() {
  const s = new McpServer({ name: "resumehub-instagram", version: "1.0.0" });

  s.registerTool("ig_account", {
    title: "Instagram account info",
    description: "Show the connected Instagram account: username, followers, post count.",
    inputSchema: {},
  }, wrap(() => ig.me()));

  s.registerTool("ig_list_media_files", {
    title: "List media files",
    description: "List the video and image files hosted with the connector that can be posted (file names to pass to the publish tools).",
    inputSchema: {},
  }, wrap(() => fs.readdirSync(path.join(HERE, "media")).filter((f) => /\.(mp4|jpe?g)$/i.test(f)).map((f) => ({ file: f, url: mediaUrl(f) }))));

  s.registerTool("ig_publish_reel", {
    title: "Publish a Reel",
    description: "PUBLICLY posts a Reel to Instagram right away. Only call after the user has approved the exact video and caption. Video: MP4 (H.264/AAC), 9:16.",
    inputSchema: {
      file: z.string().describe("Media file name from ig_list_media_files, or a public https URL to an MP4"),
      caption: z.string().max(2200),
      cover_file: z.string().optional().describe("Optional JPEG cover image file name or URL"),
    },
  }, wrap(({ file, caption, cover_file }) => ig.publishReel({ videoUrl: mediaUrl(file), caption, coverUrl: cover_file ? mediaUrl(cover_file) : undefined })));

  s.registerTool("ig_publish_image", {
    title: "Publish an image post",
    description: "PUBLICLY posts a single JPEG image to Instagram right away. Only call after the user has approved it.",
    inputSchema: { file: z.string().describe("JPEG file name or public https URL"), caption: z.string().max(2200) },
  }, wrap(({ file, caption }) => ig.publishImage({ imageUrl: mediaUrl(file), caption })));

  s.registerTool("ig_publish_carousel", {
    title: "Publish a carousel",
    description: "PUBLICLY posts a carousel of 2–10 JPEG images to Instagram right away. Only call after the user has approved it.",
    inputSchema: { files: z.array(z.string()).min(2).max(10), caption: z.string().max(2200) },
  }, wrap(({ files, caption }) => ig.publishCarousel({ imageUrls: files.map(mediaUrl), caption })));

  s.registerTool("ig_recent_posts", {
    title: "Recent posts",
    description: "List recent Instagram posts with likes, comments and links.",
    inputSchema: { limit: z.number().int().min(1).max(50).default(10) },
  }, wrap(({ limit }) => ig.recentMedia(limit)));

  s.registerTool("ig_post_insights", {
    title: "Post insights",
    description: "Reach, likes, comments, shares and saves for one post.",
    inputSchema: { media_id: z.string() },
  }, wrap(({ media_id }) => ig.mediaInsights(media_id)));

  s.registerTool("ig_comments", {
    title: "Read comments",
    description: "Read comments on a post (to find enquiries like RESUME, ATS, LINKEDIN).",
    inputSchema: { media_id: z.string() },
  }, wrap(({ media_id }) => ig.comments(media_id)));

  s.registerTool("ig_reply_comment", {
    title: "Reply to a comment",
    description: "PUBLICLY replies to a comment. Only call after the user approved the reply text.",
    inputSchema: { comment_id: z.string(), message: z.string().max(2200) },
  }, wrap(({ comment_id, message }) => ig.replyToComment(comment_id, message)));

  s.registerTool("ig_publishing_limit", {
    title: "Publishing limit",
    description: "How many API posts have been used in the last 24 hours.",
    inputSchema: {},
  }, wrap(() => ig.publishingLimit()));

  s.registerTool("queue_list", {
    title: "List scheduled posts",
    description: "Show the posting schedule (content/queue.json): what posts when, and what has been posted.",
    inputSchema: {},
  }, wrap(() => loadQueue()));

  s.registerTool("queue_add", {
    title: "Schedule a post",
    description: "Add a post to the schedule. The scheduler publishes it at the given time (IST if no offset). Note: on hosts without a persistent disk, queue changes made here are lost on restart; edit content/queue.json in the repo for permanent changes.",
    inputSchema: {
      when: z.string().describe("ISO date-time, e.g. 2026-11-10T19:30:00+05:30"),
      type: z.enum(["reel", "image", "carousel"]),
      files: z.array(z.string()).min(1).max(10),
      caption: z.string().max(2200),
    },
  }, wrap(({ when, type, files, caption }) => {
    const q = loadQueue();
    const item = { id: `p${Date.now()}`, when, type, files, caption, status: "pending" };
    q.push(item); saveQueue(q); return item;
  }));

  return s;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/media", express.static(path.join(HERE, "media"), { maxAge: "1h" }));
app.get("/", (_req, res) => res.send("ResumeHub Instagram connector is running."));

app.post(`/mcp/${SECRET}`, async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  }
});
app.all(`/mcp/${SECRET}`, (_req, res) => res.status(405).set("Allow", "POST").send("Method not allowed"));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Listening on :${port}`));
