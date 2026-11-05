import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { minecraftRoutes } from "../dist/routes/minecraft.js";
import { preinstallRoutes } from "../dist/routes/preinstalls.js";

test("public default and explicit private mode", async () => {
  const app = Fastify();
  await app.register(minecraftRoutes, { prefix: "/minecraft" });
  await app.register(preinstallRoutes, { prefix: "/preinstalls" });
  process.env.REGISTRY_API_TOKEN = "private-test";
  delete process.env.REGISTRY_REQUIRE_AUTH;
  try {
    assert.equal((await app.inject("/minecraft/loaders?loader=invalid")).statusCode, 422);
    assert.equal((await app.inject("/preinstalls/")).statusCode, 200);
    process.env.REGISTRY_REQUIRE_AUTH = "true";
    for (const url of ["/minecraft/loaders?loader=invalid", "/preinstalls/"]) {
      assert.equal((await app.inject(url)).statusCode, 401);
      assert.equal((await app.inject({ url, headers: { authorization: "Bearer wrong" } })).statusCode, 401);
    }
    assert.equal((await app.inject({ url: "/preinstalls/", headers: { authorization: "Bearer private-test" } })).statusCode, 200);
    delete process.env.REGISTRY_API_TOKEN;
    delete process.env.MINECRAFT_API_TOKEN;
    assert.equal((await app.inject("/preinstalls/")).statusCode, 401);
  } finally {
    await app.close();
  }
});
