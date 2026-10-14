import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { approvedURL } from "./cache.js";
export type Artifact = {
  url: string;
  hashes: Record<string, string>;
  size: number;
  filename: string;
};
const root = path.resolve(
  process.env.MINECRAFT_CACHE_DIR ?? "data/minecraft-cache",
  "artifacts",
);
const pending = new Map<string, Promise<string>>();
export async function registerArtifact(artifact: Artifact, data?: Buffer) {
  if (!data) approvedURL(artifact.url);
  const id = createHash("sha256")
    .update(JSON.stringify(artifact))
    .digest("hex");
  await fs.mkdir(root, { recursive: true });
  const descriptor = path.join(root, id + "." + randomUUID() + ".json");
  await fs.writeFile(descriptor, JSON.stringify(artifact), { mode: 0o600 });
  await fs.rename(descriptor, path.join(root, id + ".json"));
  if (data) {
    const temp = path.join(root, id + "." + randomUUID());
    await fs.writeFile(temp, data, { mode: 0o600 });
    await fs.rename(temp, path.join(root, id + ".bin"));
  }
  return id;
}
async function download(info: Artifact, destination: string) {
  let url = approvedURL(info.url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          process.env.PROVIDER_USER_AGENT ??
          "HiveRegistry/1.0 (https://registry.hivepanel.dev)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(300000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Provider redirect missing location");
      url = approvedURL(new URL(location, url).href);
      await response.body?.cancel();
      continue;
    }
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    if (Number(response.headers.get("content-length") ?? 0) > 512 * 1024 * 1024)
      throw new Error("Artifact too large");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty artifact");
    const output = await fs.open(destination, "wx", 0o600),
      hashes = Object.fromEntries(
        ["sha1", "sha256", "sha512"].map((algo) => [algo, createHash(algo)]),
      );
    let size = 0;
    try {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.length;
        if (size > 512 * 1024 * 1024) throw new Error("Artifact too large");
        for (const hash of Object.values(hashes)) hash.update(item.value);
        await output.writeFile(item.value);
      }
      if (info.size && info.size !== size)
        throw new Error("Artifact size mismatch");
      for (const [algo, hash] of Object.entries(hashes))
        if (
          info.hashes[algo] &&
          hash.digest("hex") !== info.hashes[algo].toLowerCase()
        )
          throw new Error("Artifact checksum mismatch");
      await output.sync();
    } finally {
      await reader.cancel().catch(() => {});
      await output.close();
    }
    return;
  }
  throw new Error("Too many provider redirects");
}
export async function artifactPath(id: string): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid artifact ID");
  const destination = path.join(root, id + ".bin");
  try {
    await fs.access(destination);
    return destination;
  } catch {}
  if (pending.has(id)) return pending.get(id)!;
  const task = (async () => {
    const info: Artifact = JSON.parse(
      await fs.readFile(path.join(root, id + ".json"), "utf8"),
    );
    if (!info.url) throw new Error("Artifact is unavailable");
    const temporary = path.join(root, id + "." + randomUUID());
    try {
      await download(info, temporary);
      await fs.rename(temporary, destination);
      return destination;
    } finally {
      await fs.rm(temporary, { force: true });
    }
  })().finally(() => pending.delete(id));
  pending.set(id, task);
  return task;
}
export async function artifact(id: string): Promise<Buffer> {
  return fs.readFile(await artifactPath(id));
}
