// Instagram long-lived tokens last 60 days. This extends the token and prints the new one.
// The GitHub workflow stores it back into the IG_ACCESS_TOKEN secret automatically.
import { refreshToken } from "../lib/instagram.js";

const r = await refreshToken();
console.log(`::add-mask::${r.access_token}`);
process.stdout.write(`NEW_TOKEN=${r.access_token}\n`);
console.error(`Token refreshed; valid for ${Math.round(r.expires_in / 86400)} more days.`);
