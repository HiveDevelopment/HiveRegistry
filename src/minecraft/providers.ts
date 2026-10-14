import { json, approvedURL } from "./cache.js";
export type Provider = "modrinth" | "curseforge";
export type Selection = {
  provider: Provider;
  project: string;
  version?: string;
};
export type Release = {
  provider: Provider;
  project: string;
  id: string;
  name: string;
  filename: string;
  url: string | null;
  size: number;
  hashes: Record<string, string>;
  gameVersions: string[];
  loaders: string[];
  dependencies: Array<{
    project: string | null;
    version: string | null;
    type: string;
  }>;
  server: string;
  client: string;
  kind: string;
};
export function compatiblePlatforms(loader: string) {
  return loader === "paper"
    ? ["paper", "spigot", "bukkit"]
    : loader === "purpur"
      ? ["purpur", "paper", "spigot", "bukkit"]
      : loader === "spigot"
        ? ["spigot", "bukkit"]
        : [loader];
}
const cfLoaders: Record<string, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
};
function cfHeaders() {
  if (!process.env.CURSEFORGE_API_KEY)
    throw new Error("CurseForge is not configured in HiveRegistry");
  return { "x-api-key": process.env.CURSEFORGE_API_KEY };
}
function id(value: string) {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(value))
    throw new Error("Invalid provider ID");
  return encodeURIComponent(value);
}
async function modrinth(path: string) {
  return json(
    "https://api.modrinth.com/v2/" + path,
    process.env.MODRINTH_TOKEN
      ? { Authorization: process.env.MODRINTH_TOKEN }
      : {},
  );
}
async function curseforge(path: string) {
  return json("https://api.curseforge.com/v1/" + path, cfHeaders());
}
export async function search(
  provider: Provider,
  query: string,
  kind: string,
  minecraft: string,
  loader: string,
  offset: number,
) {
  if (provider === "modrinth") {
    const facets = [[`project_type:${kind === "plugin" ? "mod" : kind}`]];
    if (minecraft) facets.push([`versions:${minecraft}`]);
    if (loader)
      facets.push(
        (kind === "plugin" ? compatiblePlatforms(loader) : [loader]).map(
          (value) => `categories:${value}`,
        ),
      );
    const data = await modrinth(
      "search?" +
        new URLSearchParams({
          query,
          facets: JSON.stringify(facets),
          limit: "20",
          offset: String(offset),
        }),
    );
    return {
      total: data.total_hits,
      offset,
      hits: data.hits.map((hit: any) => ({
        provider,
        project: hit.project_id,
        name: hit.title,
        summary: hit.description,
        icon: hit.icon_url,
        downloads: hit.downloads,
        kind,
        server: hit.server_side,
      })),
    };
  }
  const params = new URLSearchParams({
    gameId: "432",
    classId: kind === "modpack" ? "4471" : kind === "plugin" ? "5" : "6",
    searchFilter: query,
    gameVersion: minecraft,
    pageSize: "20",
    index: String(offset),
    sortField: "2",
    sortOrder: "desc",
  });
  if (cfLoaders[loader]) params.set("modLoaderType", String(cfLoaders[loader]));
  const data = await curseforge("mods/search?" + params);
  return {
    total: data.pagination.totalCount,
    offset,
    hits: data.data.map((hit: any) => ({
      provider,
      project: String(hit.id),
      name: hit.name,
      summary: hit.summary,
      icon: hit.logo?.thumbnailUrl,
      downloads: hit.downloadCount,
      kind,
      server: "unknown",
    })),
  };
}
export async function versions(
  provider: Provider,
  project: string,
  minecraft: string,
  loader: string,
  offset = 0,
) {
  if (provider === "modrinth") {
    const params = new URLSearchParams();
    if (minecraft) params.set("game_versions", JSON.stringify([minecraft]));
    if (loader)
      params.set("loaders", JSON.stringify(compatiblePlatforms(loader)));
    const all = await modrinth(`project/${id(project)}/version?${params}`);
    return {
      total: all.length,
      offset,
      versions: all
        .slice(offset, offset + 100)
        .map((v: any) => ({
          id: v.id,
          name: v.name,
          number: v.version_number,
          published: v.date_published,
          loaders: v.loaders,
          gameVersions: v.game_versions,
        })),
    };
  }
  const params = new URLSearchParams({
    gameVersion: minecraft,
    pageSize: "100",
    index: String(offset),
  });
  if (cfLoaders[loader]) params.set("modLoaderType", String(cfLoaders[loader]));
  const data = await curseforge(`mods/${id(project)}/files?${params}`);
  return {
    total: data.pagination.totalCount,
    offset,
    versions: data.data.map((v: any) => ({
      id: String(v.id),
      name: v.displayName,
      number: v.fileName,
      published: v.fileDate,
      gameVersions: v.gameVersions,
    })),
  };
}
export async function release(selection: Selection): Promise<Release> {
  const { provider, project } = selection;
  if (!selection.version) throw new Error("A pinned version is required");
  if (provider === "modrinth") {
    const [v, p] = await Promise.all([
      modrinth(`version/${id(selection.version)}`),
      modrinth(`project/${id(project)}`),
    ]);
    if (v.project_id !== p.id)
      throw new Error("Version belongs to another project");
    const file = v.files.find((f: any) => f.primary) ?? v.files[0];
    if (!file) throw new Error("Version has no file");
    approvedURL(file.url);
    return {
      provider,
      project: p.id,
      id: v.id,
      name: p.title,
      filename: file.filename,
      url: file.url,
      size: file.size,
      hashes: file.hashes,
      gameVersions: v.game_versions,
      loaders: v.loaders,
      dependencies: v.dependencies.map((d: any) => ({
        project: d.project_id,
        version: d.version_id,
        type: d.dependency_type,
      })),
      server: p.server_side,
      client: p.client_side ?? "unknown",
      kind: p.project_type,
    };
  }
  const [data, projectData] = await Promise.all([
    curseforge(`mods/${id(project)}/files/${id(selection.version)}`),
    curseforge(`mods/${id(project)}`),
  ]);
  const v = data.data,
    p = projectData.data;
  if (String(v.modId) !== String(p.id))
    throw new Error("Version belongs to another project");
  let url = v.downloadUrl as string | null;
  if (p.allowModDistribution === false) url = null;
  if (url) approvedURL(url);
  const hashes: Record<string, string> = {};
  for (const h of v.hashes ?? []) if (h.algo === 1) hashes.sha1 = h.value;
  return {
    provider,
    project: String(p.id),
    id: String(v.id),
    name: p.name,
    filename: v.fileName,
    url,
    size: v.fileLength,
    hashes,
    gameVersions: v.gameVersions,
    loaders:
      p.classId === 5
        ? ["paper", "spigot", "bukkit", "purpur"]
        : v.gameVersions
            .map((s: string) => s.toLowerCase())
            .filter((s: string) =>
              ["forge", "fabric", "neoforge", "quilt"].includes(s),
            ),
    dependencies: (v.dependencies ?? []).map((d: any) => ({
      project: String(d.modId),
      version: null,
      type:
        d.relationType === 3
          ? "required"
          : d.relationType === 5
            ? "incompatible"
            : "optional",
    })),
    server: "unknown",
    client: "unknown",
    kind: p.classId === 4471 ? "modpack" : p.classId === 5 ? "plugin" : "mod",
  };
}
