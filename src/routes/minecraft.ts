import type { FastifyInstance } from "fastify";
import {
  minecraftVersions,
  loaderVersions,
  runtimes,
} from "../minecraft/runtime.js";
import { search, versions, type Provider } from "../minecraft/providers.js";
import { resolve, exportPack, type PlanRequest } from "../minecraft/plans.js";
import { createReadStream } from "node:fs";
import { artifactPath } from "../minecraft/artifacts.js";
function provider(value: unknown): Provider {
  if (value !== "modrinth" && value !== "curseforge")
    throw new Error("Unknown provider");
  return value;
}
export async function minecraftRoutes(app: FastifyInstance) {
  const requests = new Map<string, { count: number; time: number }>();
  app.addHook("preHandler", async (request, reply) => {
    const artifactRequest =
      request.routeOptions.url?.endsWith("/artifacts/:id");
    if (
      !artifactRequest &&
      process.env.MINECRAFT_API_TOKEN &&
      request.headers.authorization !==
        `Bearer ${process.env.MINECRAFT_API_TOKEN}`
    )
      return reply
        .code(401)
        .send({ message: "Registry authentication required" });
    const now = Date.now();
    if (requests.size > 10000)
      for (const [ip, entry] of requests)
        if (now - entry.time > 60000) requests.delete(ip);
    const entry = requests.get(request.ip);
    if (!entry || now - entry.time > 60000)
      requests.set(request.ip, { count: 1, time: now });
    else if (++entry.count > (artifactRequest ? 1200 : 120))
      return reply
        .code(429)
        .send({ message: "Registry request limit reached" });
  });
  app.setErrorHandler((error, request, reply) => {
    request.log.warn(
      { message: error instanceof Error ? error.message : "Provider failed" },
      "Minecraft catalogue request failed",
    );
    reply
      .code(422)
      .send({
        message:
          error instanceof Error ? error.message : "Catalogue unavailable",
      });
  });
  app.get("/versions", async () => ({
    versions: await minecraftVersions(),
    runtimes,
    providers: {
      modrinth: true,
      curseforge: Boolean(process.env.CURSEFORGE_API_KEY),
    },
  }));
  app.get("/loaders", async (request) => {
    const q = request.query as any;
    if (
      !runtimes.includes(q.loader) ||
      !/^[A-Za-z0-9_.-]{1,60}$/.test(q.minecraft ?? "")
    )
      throw new Error("Invalid runtime");
    return { versions: await loaderVersions(q.loader, q.minecraft) };
  });
  app.get("/search", async (request) => {
    const q = request.query as any;
    if (!["mod", "plugin", "modpack"].includes(q.kind))
      throw new Error("Invalid catalogue type");
    return search(
      provider(q.provider),
      String(q.query ?? "").slice(0, 100),
      q.kind,
      String(q.minecraft ?? "").slice(0, 60),
      String(q.loader ?? "").slice(0, 30),
      Math.max(0, Math.min(10000, Number(q.offset) || 0)),
    );
  });
  app.get("/projects/:provider/:project/versions", async (request) => {
    const p = request.params as any,
      q = request.query as any;
    return versions(
      provider(p.provider),
      p.project,
      String(q.minecraft ?? "").slice(0, 60),
      String(q.loader ?? "").slice(0, 30),
      Math.max(0, Math.min(10000, Number(q.offset) || 0)),
    );
  });
  app.post("/resolve", { bodyLimit: 262144 }, async (request) =>
    resolve(request.body as PlanRequest),
  );
  app.post("/export/:format", { bodyLimit: 262144 }, async (request, reply) => {
    const format = (request.params as any).format;
    if (!["modrinth", "curseforge"].includes(format))
      throw new Error("Invalid export format");
    return reply
      .header("Content-Type", "application/zip")
      .header(
        "Content-Disposition",
        `attachment; filename="custom-pack.${format === "modrinth" ? "mrpack" : "zip"}"`,
      )
      .send(await exportPack(request.body as PlanRequest, format));
  });
  app.get("/artifacts/:id", async (request, reply) =>
    reply
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .header("Content-Type", "application/octet-stream")
      .send(createReadStream(await artifactPath((request.params as any).id))),
  );
}
