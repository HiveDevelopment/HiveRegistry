import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), "hive-registry-test-"),
);
process.env.MINECRAFT_CACHE_DIR = temporary;
process.env.MINECRAFT_API_TOKEN = "fixture-private-token";
const oldFetch = globalThis.fetch;
let packBytes;
const bytes = Buffer.from("fixture-jar");
const hash = {
  sha1: createHash("sha1").update(bytes).digest("hex"),
  sha512: createHash("sha512").update(bytes).digest("hex"),
};
const project = (id, server = "required") => ({
  id,
  title: id,
  server_side: server,
  project_type: "mod",
});
const version = (id, p, deps = []) => ({
  id,
  project_id: p,
  name: id,
  version_number: id,
  game_versions: ["1.21.1"],
  loaders: ["fabric"],
  dependencies: deps,
  files: [
    {
      primary: true,
      filename: p + ".jar",
      url: "https://cdn.modrinth.com/" + p + ".jar",
      size: bytes.length,
      hashes: hash,
    },
  ],
});
const fixtures = {
  "/v2/project/root": project("root"),
  "/v2/project/dep": project("dep"),
  "/v2/project/client": project("client", "unsupported"),
  "/v2/project/conflict": project("conflict"),
  "/v2/version/rootv": version("rootv", "root", [
    { project_id: "dep", version_id: "depv", dependency_type: "required" },
  ]),
  "/v2/version/depv": version("depv", "dep"),
  "/v2/version/depv2": version("depv2", "dep"),
  "/v2/version/clientv": version("clientv", "client"),
  "/v2/version/conflictv": version("conflictv", "conflict", [
    { project_id: "root", version_id: null, dependency_type: "incompatible" },
  ]),
  "/v2/versions/loader/1.21.1": [{ loader: { version: "0.16.0" } }],
  "/v2/versions/installer": [{ version: "1.0.1" }],
};
globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (u.pathname === "/pack.mrpack") return new Response(packBytes);
  if (u.hostname === "cdn.modrinth.com" || u.pathname.endsWith("/server/jar"))
    return new Response(bytes);
  if (fixtures[u.pathname]) return Response.json(fixtures[u.pathname]);
  throw new Error("Unmocked provider request: " + u.pathname);
};
const { zip, unzip, safePath } = await import("../dist/minecraft/archive.js");
const { resolve, exportPack } = await import("../dist/minecraft/plans.js");
const { artifact, registerArtifact } =
  await import("../dist/minecraft/artifacts.js");
const { approvedURL, cached } = await import("../dist/minecraft/cache.js");
const selection = (project, version) => ({
  provider: "modrinth",
  project,
  version,
});
const spec = (selections, kind = "mod") => ({
  kind,
  minecraft: "1.21.1",
  loader: "fabric",
  selections,
});
after(async () => {
  globalThis.fetch = oldFetch;
  await fs.rm(temporary, { recursive: true, force: true });
});
test("ZIP round trip preserves manifests and overrides, rejects traversal and damaged files", () => {
  const files = {
    "modrinth.index.json": Buffer.from("{}"),
    "overrides/config/mod.toml": Buffer.from("enabled=true"),
  };
  assert.deepEqual({ ...unzip(zip(files)) }, files);
  for (const bad of [
    "../outside",
    "a/../b",
    "/etc/passwd",
    "C:bad",
    "a\\b",
    ".hivepanel/lock.json",
    "a//b",
  ])
    assert.throws(() => safePath(bad));
  const damaged = zip({ "config.json": Buffer.from("hello") });
  damaged[30 + "config.json".length] ^= 1;
  assert.throws(() => unzip(damaged));
});
test("provider downloads require exact approved HTTPS hosts", () => {
  for (const url of [
    "http://cdn.modrinth.com/a",
    "https://cdn.modrinth.com.evil.test/a",
    "https://localhost/a",
    "https://secret@cdn.modrinth.com/a",
  ])
    assert.throws(() => approvedURL(url));
});
test("cache coalesces independent concurrent requests", async () => {
  let calls = 0;
  const load = async () => {
    calls++;
    return { result: 42 };
  };
  await Promise.all([cached("fixture", load), cached("fixture", load)]);
  assert.equal(calls, 1);
});
test("required dependencies are pinned and downloaded from Registry URLs", async () => {
  const plan = await resolve(spec([selection("root", "rootv")]));
  assert.deepEqual(plan.files.map((f) => f.path).sort(), [
    "mods/dep.jar",
    "mods/root.jar",
  ]);
  assert.equal(plan.projects.length, 2);
  assert.ok(
    plan.files.every((f) => f.url.includes("/api/v1/minecraft/artifacts/")),
  );
  assert.equal(
    (await artifact(plan.files[0].artifact)).toString(),
    bytes.toString(),
  );
});
test("server plans reject client-only mods and conflicting dependencies", async () => {
  await assert.rejects(
    resolve(spec([selection("client", "clientv")])),
    /client-only/,
  );
  await assert.rejects(
    resolve(spec([selection("root", "rootv"), selection("dep", "depv2")])),
    /Conflicting versions/,
  );
  await assert.rejects(
    resolve(
      spec([selection("root", "rootv"), selection("conflict", "conflictv")]),
    ),
    /conflicts/,
  );
});
test("builder exports a pinned launcher manifest with hashes and dependency files", async () => {
  const archive = unzip(
    await exportPack(spec([selection("root", "rootv")], "builder"), "modrinth"),
  );
  const index = JSON.parse(archive["modrinth.index.json"]);
  assert.equal(index.dependencies["fabric-loader"], "0.16.0");
  assert.equal(index.files.length, 2);
  assert.ok(
    index.files.every(
      (f) =>
        f.hashes.sha1 &&
        f.hashes.sha512 &&
        f.downloads[0].startsWith("https://cdn.modrinth.com/"),
    ),
  );
});
test("checksum failures never become cached artifacts", async () => {
  const id = await registerArtifact({
    url: "https://cdn.modrinth.com/bad.jar",
    filename: "bad.jar",
    size: bytes.length,
    hashes: { sha512: "0".repeat(128) },
  });
  await assert.rejects(artifact(id), /checksum/);
  await assert.rejects(fs.stat(path.join(temporary, "artifacts", id + ".bin")));
});
test("API authenticates catalogue operations while permitting immutable artifact downloads", async () => {
  const Fastify = (await import("fastify")).default;
  const { minecraftRoutes } = await import("../dist/routes/minecraft.js");
  const app = Fastify();
  app.register(minecraftRoutes, { prefix: "/api/v1/minecraft" });
  assert.equal((await app.inject("/api/v1/minecraft/search")).statusCode, 401);
  const plan = await resolve(spec([selection("root", "rootv")]));
  const file = await app.inject(
    "/api/v1/minecraft/artifacts/" + plan.files[0].artifact,
  );
  assert.equal(file.statusCode, 200);
  assert.equal(file.rawPayload.toString(), bytes.toString());
  assert.ok(!file.body.includes("fixture-private-token"));
  await app.close();
});

test("published packs select their runtime and apply server overrides after common overrides", async () => {
  fixtures["/v2/project/pack"] = {
    id: "pack",
    title: "Pack",
    server_side: "required",
    project_type: "modpack",
  };
  fixtures["/v2/version/packv"] = {
    ...version("packv", "pack"),
    files: [
      {
        primary: true,
        filename: "pack.mrpack",
        url: "https://cdn.modrinth.com/pack.mrpack",
        size: 0,
        hashes: {},
      },
    ],
  };
  packBytes = zip({
    "server-overrides/config/example.toml": Buffer.from("server"),
    "modrinth.index.json": Buffer.from(
      JSON.stringify({
        formatVersion: 1,
        game: "minecraft",
        dependencies: { minecraft: "1.21.1", "fabric-loader": "0.16.0" },
        files: [
          {
            path: "mods/server.jar",
            downloads: ["https://cdn.modrinth.com/server.jar"],
            hashes: hash,
            fileSize: bytes.length,
            env: { server: "required" },
          },
          {
            path: "mods/client.jar",
            downloads: ["https://cdn.modrinth.com/client.jar"],
            hashes: hash,
            fileSize: bytes.length,
            env: { server: "unsupported" },
          },
        ],
      }),
    ),
    "overrides/config/example.toml": Buffer.from("common"),
  });
  const plan = await resolve({
    kind: "modpack",
    minecraft: "1.20.1",
    loader: "paper",
    selections: [selection("pack", "packv")],
  });
  assert.equal(plan.minecraft, "1.21.1");
  assert.equal(plan.loader, "fabric");
  assert.equal(plan.replaceMods, true);
  assert.ok(plan.files.some((f) => f.path === "server.jar"));
  assert.ok(!plan.files.some((f) => f.path === "mods/client.jar"));
  const override = plan.files.find((f) => f.path === "config/example.toml");
  assert.equal((await artifact(override.artifact)).toString(), "server");
});
test("CurseForge download permissions are enforced and Bukkit plugins do not require mod-loader tags", async () => {
  process.env.CURSEFORGE_API_KEY = "fixture-provider-key";
  fixtures["/v1/mods/200"] = {
    data: {
      id: 200,
      name: "Blocked mod",
      classId: 6,
      allowModDistribution: false,
    },
  };
  fixtures["/v1/mods/200/files/300"] = {
    data: {
      id: 300,
      modId: 200,
      fileName: "blocked.jar",
      fileLength: bytes.length,
      downloadUrl: "https://edge.forgecdn.net/blocked.jar",
      gameVersions: ["1.21.1", "Fabric"],
      hashes: [{ algo: 1, value: hash.sha1 }],
      dependencies: [],
    },
  };
  await assert.rejects(
    resolve({
      kind: "mod",
      minecraft: "1.21.1",
      loader: "fabric",
      selections: [{ provider: "curseforge", project: "200", version: "300" }],
    }),
    /does not permit/,
  );
  fixtures["/v1/mods/201"] = {
    data: {
      id: 201,
      name: "Bukkit plugin",
      classId: 5,
      allowModDistribution: true,
    },
  };
  fixtures["/v1/mods/201/files/301"] = {
    data: {
      ...fixtures["/v1/mods/200/files/300"].data,
      id: 301,
      modId: 201,
      fileName: "plugin.jar",
      gameVersions: ["1.21.1"],
    },
  };
  const plan = await resolve({
    kind: "plugin",
    minecraft: "1.21.1",
    loader: "paper",
    selections: [{ provider: "curseforge", project: "201", version: "301" }],
  });
  assert.equal(plan.files[0].path, "plugins/plugin.jar");
  assert.ok(!JSON.stringify(plan).includes("fixture-provider-key"));
});
test("Paper installs Spigot/Bukkit plugins without accepting Purpur-only releases", async () => {
  const { compatiblePlatforms } =
    await import("../dist/minecraft/providers.js");
  assert.deepEqual(compatiblePlatforms("paper"), ["paper", "spigot", "bukkit"]);
  assert.ok(!compatiblePlatforms("paper").includes("purpur"));
  fixtures["/v2/project/spigotplugin"] = {
    ...project("spigotplugin"),
    project_type: "mod",
  };
  fixtures["/v2/version/spigotv"] = {
    ...version("spigotv", "spigotplugin"),
    loaders: ["spigot"],
  };
  const plan = await resolve({
    kind: "plugin",
    minecraft: "1.21.1",
    loader: "paper",
    selections: [selection("spigotplugin", "spigotv")],
  });
  assert.equal(plan.files[0].path, "plugins/spigotplugin.jar");
});
