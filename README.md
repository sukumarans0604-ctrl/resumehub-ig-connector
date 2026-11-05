# ResumeHub Instagram Connector

Posts Reels, carousels and images to **@resume_hub_in** through Instagram's official API, in two ways:

- **From Claude** (custom connector): "post the Divya reel with this caption", "how did last week's posts do?", "reply to comments asking for RESUME".
- **On a schedule** (GitHub Actions): every 30 minutes it publishes whatever in `content/queue.json` is due. 13 posts are already queued for 8–29 Nov 2026 (Mon/Wed/Fri/Sun at 19:30, 13:00, 19:30 and 11:00 IST).

No password is stored anywhere. It uses an access token from Meta that you can revoke at any time.

## What's inside

| Path | What it is |
| --- | --- |
| `server.js` | The connector (MCP server) Claude talks to; also serves `media/` publicly so Instagram can fetch the files |
| `lib/instagram.js` | Instagram API calls: publish Reel / image / carousel, insights, comments, token refresh |
| `content/queue.json` | The posting schedule. Edit it to add, change or remove posts |
| `media/` | 6 Reels + 24 images (5 carousels, 2 single posts) ready to post |
| `scripts/post-due.js` | Publishes due posts (used by the schedule) |
| `.github/workflows/post.yml` | Runs the scheduler every 30 minutes |
| `.github/workflows/refresh-token.yml` | Renews the Instagram token twice a month (tokens expire after 60 days) |
| `render.yaml` | One-click hosting on Render (free plan) |

## Setup (about 30 minutes, once)

### 1. Make the Instagram account professional
Instagram app → Settings → **Account type and tools** → **Switch to professional account** → Business (category: Career Counselor).

### 2. Get an Instagram access token
1. Go to <https://developers.facebook.com>, log in, and click **My Apps → Create app**.
2. Use case: **Manage messaging & content on Instagram**. Create the app.
3. Open **Instagram → API setup with Instagram login**.
4. Under **Generate access tokens**, click **Add account**, log in as `resume_hub_in` *yourself*, and approve. Approve these permissions: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_insights`.
5. Copy the **access token** and the **Instagram account ID** shown next to the account.

Keep the app in Development mode. That's enough to post to your own account, so no app review is needed.

### 3. Put the code on GitHub
Create a new repository (private is fine), e.g. `resumehub-ig-connector`, and upload this folder (everything except `node_modules`).

### 4. Host the connector (Render, free)
1. <https://render.com> → **New → Blueprint** → pick your repository.
2. Fill in:
   - `IG_ACCESS_TOKEN`: the token from step 2
   - `IG_USER_ID`: the account ID from step 2
   - `PUBLIC_BASE_URL`: your Render address, e.g. `https://resumehub-ig-connector.onrender.com`. You'll see it after the first deploy; set it, then redeploy.
   - `CONNECTOR_SECRET` is generated for you. Copy it from the Environment tab.
3. Open `https://<your-render-address>/`. It should say *"ResumeHub Instagram connector is running."*

### 5. Add it to Claude
Claude → **Settings → Connectors → Add custom connector**:
- Name: `ResumeHub Instagram`
- URL: `https://<your-render-address>/mcp/<CONNECTOR_SECRET>`

Anyone with this URL can post to your account, so keep it private.

### 6. Turn on scheduled posting
In your GitHub repository → **Settings → Secrets and variables → Actions**:
- **Secrets:** `IG_ACCESS_TOKEN` (the token). Optionally add `SECRETS_PAT` (a fine-grained GitHub token with *Secrets: read & write* on this repo) so the token renews itself.
- **Variables:** `IG_USER_ID`, `PUBLIC_BASE_URL` (same values as on Render).

Then open the **Actions** tab and enable workflows. To test right away, run **Post scheduled Instagram content** with *Run workflow*. It only posts items whose time has passed.

## Everyday use

**Change the schedule:** edit `content/queue.json` on GitHub. Each post looks like this:

```json
{ "id": "p14", "when": "2026-12-01T19:30:00+05:30", "type": "reel",
  "files": ["reel-divya-neon.mp4"], "caption": "…", "status": "pending" }
```

`type` is `reel`, `image` or `carousel` (2–10 JPEGs). After posting, the scheduler sets `status` to `posted` and adds the link. After three failed tries it sets `failed` and records the error in `last_error`.

**Add new media:** upload MP4 (9:16, H.264) or JPEG files into `media/`. Render redeploys automatically.

**Ask Claude, once connected:**
- "Show my Instagram account and the last 10 posts with likes."
- "Post reel-divya-neon.mp4 now with this caption: …" (Claude asks you before anything goes public)
- "Get insights for my last 3 posts."
- "Find comments that say RESUME and draft replies."

## Limits to know
- Instagram allows 100 API posts per 24 hours. The scheduler posts at most 1 per run.
- Media must be publicly reachable when it's published. The workflow wakes the free Render server first; if a post still fails, it retries on the next run.
- Instagram allows 5 hashtags per post. The queued captions use exactly 5.
- Pexels footage in the story Reels: keep the "Dramatization" note. Don't present the actors as real clients.
