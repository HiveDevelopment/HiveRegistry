import { createHash } from "node:crypto";
import { config } from "../config.js";
import {
  release,
  versions,
  type Selection,
  type Release,
} from "./providers.js";
import { registerArtifact, artifact } from "./artifacts.js";
import { runtime } from "./runtime.js";
import { unzip, zip, safePath } from "./archive.js";
import { approvedURL } from "./cache.js";
export type PlanRequest = {
  kind: "mod" | "plugin" | "jar" | "builder" | "modpack";
  minecraft: string;
  loader: string;
  loaderVersion?: string;
  selections: Selection[];
  name?: string;
  side?: "server" | "client";
};
export type PlanFile = {
  path: string;
  artifact: string;
  hashes: Record<string, string>;
  size: number;
  source?: string;
  provider?: string;
  project?: string;
  version?: string;
  client?: string;
  server?: string;
};
const downloadURL = (id: string) =>
  config.app.url.replace(/\/$/, "") + "/api/v1/minecraft/artifacts/" + id;
export async function resolve(input: PlanRequest) {
  if (
    !["mod", "plugin", "jar", "builder", "modpack"].includes(input.kind) ||
    !/^[A-Za-z0-9_.-]{1,60}$/.test(input.minecraft) ||
    ![
      "vanilla",
      "paper",
      "spigot",
      "purpur",
      "bukkit",
      "fabric",
      "forge",
      "neoforge",
      "quilt",
    ].includes(input.loader) ||
    !Array.isArray(input.selections) ||
    input.selections.length > 200 ||
    (["mod", "plugin"].includes(input.kind) && input.selections.length === 0)
  )
    throw new Error("Invalid install selection");
  const files: PlanFile[] = [],
    warnings: string[] = [],
    releases: Release[] = [],
    errors: string[] = [],
    selected = new Map<string, Release>();
  const visiting = new Set<string>();
  let minecraft = input.minecraft,
    loader = input.loader,
    loaderVersion = input.loaderVersion,
    overrideFolder = "overrides";
  const server = input.side !== "client";
  async function addFile(
    info: {
      path: string;
      url: string | null;
      hashes: Record<string, string>;
      size: number;
    },
    extra: Partial<PlanFile> = {},
  ) {
    const path = safePath(info.path);
    if (!info.url)
      throw new Error(
        "Provider does not permit this file to be downloaded automatically",
      );
    approvedURL(info.url);
    const id = await registerArtifact({
      url: info.url,
      hashes: info.hashes,
      size: info.size,
      filename: path,
    });
    files.push({
      path,
      artifact: id,
      hashes: info.hashes,
      size: info.size,
      source: info.url,
      ...extra,
    });
  }
  async function add(selection: Selection, depth = 0) {
    if (depth > 20 || selected.size > 300)
      throw new Error("Dependency graph is too large");
    const key = selection.provider + ":" + selection.project;
    const previous = selected.get(key);
    if (previous) {
      if (selection.version && selection.version !== previous.id)
        throw new Error(`Conflicting versions for ${previous.name}`);
      return;
    }
    if (visiting.has(key)) return;
    visiting.add(key);
    const choices = selection.version
      ? null
      : await versions(
          selection.provider,
          selection.project,
          minecraft,
          loader,
        );
    const pin = selection.version ?? choices?.versions[0]?.id;
    if (!pin) throw new Error(`No compatible release for ${selection.project}`);
    const item = await release({ ...selection, version: pin });
    if (
      item.kind === "modpack" ||
      (input.kind !== "plugin" && item.kind !== "mod")
    )
      throw new Error(`${item.name} is not a compatible content type`);
    const canonical = item.provider + ":" + item.project;
    const existing = selected.get(canonical);
    if (existing) {
      if (existing.id !== item.id)
        throw new Error(`Conflicting versions for ${item.name}`);
      visiting.delete(key);
      return;
    }
    if (
      !item.gameVersions.includes(minecraft) ||
      !item.loaders.includes(loader)
    )
      throw new Error(
        `${item.name} is incompatible with ${minecraft} / ${loader}`,
      );
    if (server && item.server === "unsupported")
      throw new Error(`${item.name} is client-only`);
    if (item.server === "unknown")
      warnings.push(
        `${item.name}: provider does not declare server compatibility.`,
      );
    selected.set(canonical, item);
    releases.push(item);
    for (const dependency of item.dependencies)
      if (dependency.type === "required") {
        if (dependency.project)
          await add(
            {
              provider: item.provider,
              project: dependency.project,
              ...(dependency.version ? { version: dependency.version } : {}),
            },
            depth + 1,
          );
        else if (dependency.version && item.provider === "modrinth") {
          const v = await import("./cache.js").then(({ json }) =>
            json(
              "https://api.modrinth.com/v2/version/" +
                encodeURIComponent(dependency.version!),
            ),
          );
          await add(
            {
              provider: item.provider,
              project: v.project_id,
              version: dependency.version,
            },
            depth + 1,
          );
        } else
          throw new Error(`${item.name} has an unresolved required dependency`);
      }
    await addFile(
      {
        path: (input.kind === "plugin" ? "plugins/" : "mods/") + item.filename,
        url: item.url,
        hashes: item.hashes,
        size: item.size,
      },
      {
        provider: item.provider,
        project: item.project,
        version: item.id,
        client: item.client === "unsupported" ? "unsupported" : "required",
        server: item.server === "unsupported" ? "unsupported" : "required",
      },
    );
    visiting.delete(key);
  }
  if (input.kind === "modpack") {
    if (input.selections.length !== 1)
      throw new Error("Choose one modpack version");
    const selectedPack = await release(input.selections[0]!);
    if (selectedPack.kind !== "modpack" || !selectedPack.url)
      throw new Error("Modpack download is unavailable");
    const packId = await registerArtifact({
      url: selectedPack.url,
      hashes: selectedPack.hashes,
      size: selectedPack.size,
      filename: selectedPack.filename,
    });
    const content = unzip(await artifact(packId));
    if (content["modrinth.index.json"]) {
      const index = JSON.parse(content["modrinth.index.json"].toString());
      if (index.game !== "minecraft" || index.formatVersion !== 1)
        throw new Error("Unsupported Modrinth manifest");
      minecraft = index.dependencies?.minecraft;
      const loaders = ["fabric", "forge", "neoforge", "quilt"].filter(
        (value) =>
          index.dependencies?.[
            value === "fabric"
              ? "fabric-loader"
              : value === "quilt"
                ? "quilt-loader"
                : value
          ],
      );
      if (loaders.length !== 1)
        throw new Error("Modpack must declare one supported mod loader");
      loader = loaders[0]!;
      loaderVersion =
        index.dependencies[
          loader === "fabric"
            ? "fabric-loader"
            : loader === "quilt"
              ? "quilt-loader"
              : loader
        ];
      if (!Array.isArray(index.files) || index.files.length > 500)
        throw new Error("Invalid modpack file index");
      for (const file of index.files) {
        if (
          (server && file.env?.server === "unsupported") ||
          (!server && file.env?.client === "unsupported")
        )
          continue;
        if (!file.hashes?.sha1 || !file.hashes?.sha512)
          throw new Error("Modpack file is missing required hashes");
        await addFile(
          {
            path: file.path,
            url: file.downloads?.[0],
            hashes: file.hashes,
            size: file.fileSize,
          },
          {
            client: file.env?.client ?? "required",
            server: file.env?.server ?? "required",
          },
        );
      }
    } else if (content["manifest.json"]) {
      const manifest = JSON.parse(content["manifest.json"].toString());
      if (
        manifest.manifestType !== "minecraftModpack" ||
        manifest.manifestVersion !== 1
      )
        throw new Error("Unsupported CurseForge manifest");
      overrideFolder = safePath(String(manifest.overrides ?? "overrides"));
      minecraft = manifest.minecraft?.version;
      const declared =
        manifest.minecraft?.modLoaders?.find((entry: any) => entry.primary) ??
        manifest.minecraft?.modLoaders?.[0];
      const match = String(declared?.id ?? "").match(
        /^(forge|fabric|neoforge|quilt)-(.+)$/,
      );
      if (!match) throw new Error("Unsupported modpack loader");
      loader = match[1]!;
      loaderVersion = match[2]!;
      if (!Array.isArray(manifest.files) || manifest.files.length > 300)
        throw new Error("Invalid CurseForge manifest");
      for (const file of manifest.files)
        if (file.required !== false)
          await add({
            provider: "curseforge",
            project: String(file.projectID),
            version: String(file.fileID),
          });
      if (server)
        warnings.push(
          "CurseForge manifests do not declare each mod’s server side. Compatibility requires a test launch.",
        );
    } else
      throw new Error(
        "Pack contains neither a Modrinth nor CurseForge manifest",
      );
    for (const folder of [
      overrideFolder,
      server ? "server-overrides" : "client-overrides",
    ])
      for (const [name, bytes] of Object.entries(content)) {
        const prefix = name.startsWith(folder + "/") ? folder + "/" : "";
        if (!prefix) continue;
        const path = safePath(name.slice(prefix.length));
        const hashes = {
          sha1: createHash("sha1").update(bytes).digest("hex"),
          sha512: createHash("sha512").update(bytes).digest("hex"),
        };
        const id = await registerArtifact(
          { url: "", hashes, size: bytes.length, filename: path },
          bytes,
        );
        const old = files.findIndex((file) => file.path === path);
        if (old >= 0) files.splice(old, 1);
        files.push({ path, artifact: id, hashes, size: bytes.length });
      }
  } else for (const selection of input.selections) await add(selection);
  for (const item of releases)
    for (const dependency of item.dependencies)
      if (dependency.type === "incompatible") {
        const conflict = releases.find(
          (other) =>
            other.provider === item.provider &&
            (dependency.version
              ? other.id === dependency.version
              : other.project === dependency.project),
        );
        if (conflict)
          errors.push(`${item.name} conflicts with ${conflict.name}`);
      }
  if (errors.length) throw new Error(errors.join("; "));
  if (["builder", "modpack", "jar"].includes(input.kind)) {
    if (
      loader === "forge" &&
      loaderVersion &&
      !loaderVersion.startsWith(minecraft + "-")
    )
      loaderVersion = minecraft + "-" + loaderVersion;
    const resolved = await runtime(loader, minecraft, loaderVersion);
    loaderVersion = resolved.version;
    files.unshift(resolved.file);
  }
  const paths = new Set<string>();
  for (const file of files) {
    if (paths.has(file.path.toLowerCase()))
      throw new Error(`Duplicate destination ${file.path}`);
    paths.add(file.path.toLowerCase());
  }
  if (
    files.length > 600 ||
    files.reduce((sum, file) => sum + file.size, 0) > 4 * 1024 ** 3
  )
    throw new Error("Install is too large");
  const plan = {
    format: 1,
    name: input.name?.slice(0, 100) || "Custom modpack",
    kind: input.kind,
    minecraft,
    loader,
    loaderVersion: loaderVersion ?? "",
    replaceMods: input.kind === "builder" || input.kind === "modpack",
    files: files.map((file) => ({ ...file, url: downloadURL(file.artifact) })),
    warnings: [...new Set(warnings)],
    projects: releases.map((item) => ({
      provider: item.provider,
      project: item.project,
      version: item.id,
      name: item.name,
    })),
  };
  return {
    ...plan,
    id: createHash("sha256").update(JSON.stringify(plan)).digest("hex"),
  };
}
export async function exportPack(input: PlanRequest, format: string) {
  const plan = await resolve({
    ...input,
    kind: "builder",
    side: input.side ?? "client",
  });
  if (format === "curseforge") {
    if (plan.projects.some((item) => item.provider !== "curseforge"))
      throw new Error(
        "CurseForge export only supports CurseForge projects; use Modrinth export for mixed packs",
      );
    return zip({
      "manifest.json": Buffer.from(
        JSON.stringify(
          {
            minecraft: {
              version: plan.minecraft,
              modLoaders: [
                {
                  id: `${plan.loader}-${plan.loaderVersion.replace(plan.minecraft + "-", "")}`,
                  primary: true,
                },
              ],
            },
            manifestType: "minecraftModpack",
            manifestVersion: 1,
            name: plan.name,
            version: "1.0.0",
            author: "HivePanel",
            files: plan.projects.map((item) => ({
              projectID: Number(item.project),
              fileID: Number(item.version),
              required: true,
            })),
            overrides: "overrides",
          },
          null,
          2,
        ),
      ),
    });
  }
  const files = [];
  for (const file of plan.files.filter((file) =>
    file.path.startsWith("mods/"),
  )) {
    const bytes = await artifact(file.artifact);
    files.push({
      path: file.path,
      hashes: {
        sha1: createHash("sha1").update(bytes).digest("hex"),
        sha512: createHash("sha512").update(bytes).digest("hex"),
      },
      env: {
        client: file.client ?? "required",
        server: file.server ?? "required",
      },
      downloads: [file.source ?? file.url],
      fileSize: bytes.length,
    });
  }
  return zip({
    "modrinth.index.json": Buffer.from(
      JSON.stringify(
        {
          formatVersion: 1,
          game: "minecraft",
          versionId: "1.0.0",
          name: plan.name,
          files,
          dependencies: {
            minecraft: plan.minecraft,
            [plan.loader === "fabric"
              ? "fabric-loader"
              : plan.loader === "quilt"
                ? "quilt-loader"
                : plan.loader]: plan.loaderVersion.replace(
              plan.minecraft + "-",
              "",
            ),
          },
        },
        null,
        2,
      ),
    ),
  });
}
