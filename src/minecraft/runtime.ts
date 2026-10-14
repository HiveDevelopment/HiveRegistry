import { json, upstream } from "./cache.js";
import { registerArtifact, artifact } from "./artifacts.js";
import { createHash } from "node:crypto";
export const runtimes = ["vanilla", "paper", "fabric", "forge", "neoforge"];
export async function minecraftVersions() {
  const data = await json(
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
  );
  return data.versions.map((v: any) => ({ id: v.id, type: v.type }));
}
export async function loaderVersions(
  type: string,
  minecraft: string,
): Promise<string[]> {
  if (type === "fabric")
    return (
      await json(
        `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(minecraft)}`,
      )
    ).map((entry: any) => entry.loader.version);
  if (type === "paper")
    return (
      await json(
        `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(minecraft)}/builds`,
      )
    )
      .filter((build: any) => String(build.channel).toUpperCase() === "STABLE")
      .sort((a: any, b: any) => b.id - a.id)
      .map((build: any) => String(build.id));
  if (type === "forge" || type === "neoforge") {
    const url =
      type === "forge"
        ? "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml"
        : "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
    const xml = (await upstream(url)).toString("utf8"),
      all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(
        (match) => match[1]!,
      );
    const prefix =
      type === "forge" ? minecraft + "-" : minecraft.replace(/^1\./, "") + ".";
    return all
      .filter(
        (version) =>
          version.startsWith(prefix) && !/alpha|beta|snapshot/i.test(version),
      )
      .reverse();
  }
  return [];
}
export async function runtime(
  type: string,
  minecraft: string,
  requested?: string,
) {
  if (!runtimes.includes(type)) throw new Error("Unsupported runtime");
  let url = "",
    hashes: Record<string, string> = {},
    size = 0,
    loader = requested ?? "",
    path = "server.jar";
  if (type === "vanilla") {
    const manifest = await json(
      "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
    );
    const version = manifest.versions.find((v: any) => v.id === minecraft);
    if (!version) throw new Error("Unknown Minecraft version");
    const info = (await json(version.url)).downloads?.server;
    if (!info) throw new Error("Version has no server artifact");
    url = info.url;
    hashes.sha1 = info.sha1;
    size = info.size;
  } else {
    const available = await loaderVersions(type, minecraft);
    loader = requested || available[0] || "";
    if (!available.includes(loader))
      throw new Error("Runtime build does not match Minecraft version");
    if (type === "fabric") {
      const installers = await json(
        "https://meta.fabricmc.net/v2/versions/installer",
      );
      url = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(minecraft)}/${encodeURIComponent(loader)}/${encodeURIComponent(installers[0].version)}/server/jar`;
    }
    if (type === "paper") {
      const builds = await json(
        `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(minecraft)}/builds`,
      );
      const file = builds.find((build: any) => String(build.id) === loader)
        ?.downloads?.["server:default"];
      if (!file) throw new Error("Paper artifact unavailable");
      url = file.url;
      if (file.checksums?.sha256) hashes.sha256 = file.checksums.sha256;
    }
    if (type === "forge") {
      path = "installer.jar";
      url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${loader}/forge-${loader}-installer.jar`;
    }
    if (type === "neoforge") {
      path = "installer.jar";
      url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loader}/neoforge-${loader}-installer.jar`;
    }
  }
  const artifactId = await registerArtifact({
    url,
    hashes,
    size,
    filename: path,
  });
  // Hash loader artifacts even when their upstream index does not publish a digest.
  const bytes = await artifact(artifactId);
  hashes.sha512 = createHash("sha512").update(bytes).digest("hex");
  size = bytes.length;
  return {
    type,
    minecraft,
    version: loader,
    file: { path, artifact: artifactId, hashes, size },
  };
}
