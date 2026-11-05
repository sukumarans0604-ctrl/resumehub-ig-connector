import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content", "queue.json");

export function loadQueue() {
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

export function saveQueue(q) {
  fs.writeFileSync(FILE, JSON.stringify(q, null, 2) + "\n");
}
