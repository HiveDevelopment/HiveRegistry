import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import Fastify from "fastify";

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "hive-preinstalls-"));
process.env.MINECRAFT_CACHE_DIR = temporary;
process.env.REGISTRY_API_TOKEN = "private-registry";
const { resolvePreset, presetSchema } =
  await import("../dist/preinstalls/catalogue.js");
const { preinstallRoutes } = await import("../dist/routes/preinstalls.js");
const { artifact } = await import("../dist/minecraft/artifacts.js");
const { CombSchema } = await import("../dist/schemas/comb.schema.js");
after(async () => fs.rm(temporary, { recursive: true, force: true }));

test("preinstall routes protect recipes but allow verified artifact downloads", async () => {
  const app = Fastify();
  await app.register(preinstallRoutes, { prefix: "/api/v1/preinstalls" });
  assert.equal((await app.inject("/api/v1/preinstalls/")).statusCode, 401);
  const headers = { authorization: "Bearer private-registry" };
  const catalogue = await app.inject({ url: "/api/v1/preinstalls/", headers });
  assert.equal(catalogue.statusCode, 200);
  const preset = catalogue
    .json()
    .presets.find((p) => p.id === "discord-tickets");
  assert.equal(preset.runtime, undefined);
  assert.equal(preset.files, undefined);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/preinstalls/resolve",
    headers,
    payload: { preset: preset.id, version: "4.0" },
  });
  assert.equal(response.statusCode, 200);
  const plan = response.json();
  assert.equal(plan.kind, "preinstall");
  assert.equal(plan.wipe, true);
  assert.deepEqual(plan.runtime.secretKeys, ["ENCRYPTION_KEY"]);
  assert.ok(!JSON.stringify(plan).includes("ENCRYPTION_KEY="));
  for (const file of plan.files) {
    const id = file.url.split("/").pop();
    const bytes = await artifact(id);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      file.hashes.sha256,
    );
    assert.equal(
      (await app.inject(new URL(file.url).pathname)).statusCode,
      200,
    );
  }
  await app.close();
});

test("unknown projects and versions cannot request arbitrary images", async () => {
  await assert.rejects(resolvePreset("unoffered-bot", "4.0"), /Unknown/);
  await assert.rejects(
    resolvePreset("discord-tickets", "../../latest"),
    /Unknown/,
  );
  const recipe = JSON.parse(
    await fs.readFile("src/data/preinstalls/discord-tickets.json", "utf8"),
  );
  recipe.versions[0].image = "--privileged";
  assert.equal(presetSchema.safeParse(recipe).success, false);
  recipe.versions[0].image = "ghcr.io/discord-tickets/bot:4.0";
  recipe.runtime.secretKeys = ["TOKEN\nINJECTED=yes"];
  assert.equal(presetSchema.safeParse(recipe).success, false);
});

test("Comb validation retains administrator-offered preinstalls", async () => {
  const comb = JSON.parse(
    await fs.readFile("src/data/combs/bots/discord-bot.json", "utf8"),
  );
  assert.deepEqual(CombSchema.parse(comb).preinstalls, [
    "discord-tickets",
    "discord-tickets-source",
  ]);
  comb.preinstalls = ["../arbitrary"];
  assert.equal(CombSchema.safeParse(comb).success, false);
});

test("source recipes and administrator-authored inline recipes retain install steps", async () => {
  const source = await resolvePreset("discord-tickets-source", "4.0.52");
  assert.equal(source.runtime.image, "node:22-bookworm");
  assert.equal(source.runtime.steps[0].type, "git");
  assert.equal(source.runtime.steps[0].with.ref, "{{SOURCE_REF}}");
  assert.ok(
    source.runtime.variables_schema.find(
      (variable) => variable.name === "SOURCE_REF",
    ).install,
  );
  const recipe = JSON.parse(
    await fs.readFile(
      "src/data/preinstalls/discord-tickets-source.json",
      "utf8",
    ),
  );
  recipe.id = "private-preset";
  const inline = await resolvePreset("private-preset", "4.0.52", recipe);
  assert.equal(inline.preset, "private-preset");
  assert.equal(inline.runtime.steps.length, 5);
  const comb = JSON.parse(
    await fs.readFile("src/data/combs/bots/discord-bot.json", "utf8"),
  );
  comb.preinstall_recipes = [recipe];
  comb.docker_images = {
    "Node 22": "node:22-bookworm",
    "Node 20": "node:20-bookworm",
  };
  assert.equal(
    CombSchema.parse(comb).preinstall_recipes[0].steps[0].type,
    "git",
  );
  assert.equal(
    CombSchema.parse(comb).docker_images["Node 22"],
    "node:22-bookworm",
  );
});
