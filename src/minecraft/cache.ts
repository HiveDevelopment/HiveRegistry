import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(
  process.env.MINECRAFT_CACHE_DIR ?? "data/minecraft-cache",
);
const pending = new Map<string, Promise<unknown>>();
export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  ttl = 900000,
): Promise<T> {
  const file = path.join(
    root,
    createHash("sha256").update(key).digest("hex") + ".json",
  );
  try {
    const entry = JSON.parse(await fs.readFile(file, "utf8"));
    if (Date.now() - entry.time < ttl) return entry.value;
  } catch {}
  if (pending.has(key)) return pending.get(key) as Promise<T>;
  const task = (async () => {
    const value = await load();
    await fs.mkdir(root, { recursive: true });
    const temporary = file + "." + crypto.randomUUID() + ".tmp";
    await fs.writeFile(temporary, JSON.stringify({ time: Date.now(), value }), {
      mode: 0o600,
    });
    await fs.rename(temporary, file);
    return value;
  })().finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
export const upstreamHosts = new Set([
  "api.modrinth.com",
  "cdn.modrinth.com",
  "api.curseforge.com",
  "edge.forgecdn.net",
  "mediafilez.forgecdn.net",
  "media.forgecdn.net",
  "piston-meta.mojang.com",
  "piston-data.mojang.com",
  "launchermeta.mojang.com",
  "launcher.mojang.com",
  "meta.fabricmc.net",
  "maven.fabricmc.net",
  "fill.papermc.io",
  "fill-data.papermc.io",
  "api.papermc.io",
  "maven.minecraftforge.net",
  "files.minecraftforge.net",
  "maven.neoforged.net",
]);
export function approvedURL(raw: string) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !upstreamHosts.has(url.hostname)
  )
    throw new Error("Unapproved provider download host");
  return url;
}
export async function upstream(
  raw: string,
  headers: Record<string, string> = {},
  maximum = 16 * 1024 * 1024,
): Promise<Buffer> {
  let url = approvedURL(raw);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          process.env.PROVIDER_USER_AGENT ??
          "HiveRegistry/1.0 (https://registry.hivepanel.dev)",
        ...headers,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Provider redirect missing location");
      const next = approvedURL(new URL(location, url).href);
      if (next.origin !== url.origin) headers = {};
      url = next;
      continue;
    }
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    if (Number(response.headers.get("content-length") ?? 0) > maximum)
      throw new Error("Provider response too large");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty provider response");
    const chunks: Buffer[] = [];
    let size = 0;
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("Provider response too large");
      }
      chunks.push(Buffer.from(item.value));
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Too many provider redirects");
}
export async function json<T = any>(
  url: string,
  headers: Record<string, string> = {},
): Promise<T> {
  return cached(url, async () =>
    JSON.parse((await upstream(url, headers)).toString("utf8")),
  );
}
