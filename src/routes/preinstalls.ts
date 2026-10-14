import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { presets, resolvePreset } from "../preinstalls/catalogue.js";
import { artifactPath } from "../minecraft/artifacts.js";

export async function preinstallRoutes(app: FastifyInstance) {
  const requests = new Map<string, { count: number; time: number }>();
  app.addHook("preHandler", async (request, reply) => {
    const now = Date.now();
    if (requests.size > 10000)
      for (const [ip, entry] of requests)
        if (now - entry.time > 60000) requests.delete(ip);
    const artifact = request.routeOptions.url?.endsWith("/artifacts/:id");
    const entry = requests.get(request.ip);
    if (!entry || now - entry.time > 60000)
      requests.set(request.ip, { count: 1, time: now });
    else if (++entry.count > (artifact ? 1200 : 120))
      return reply
        .code(429)
        .send({ message: "Registry request limit reached" });
    const token =
      process.env.REGISTRY_API_TOKEN ?? process.env.MINECRAFT_API_TOKEN;
    if (
      !request.routeOptions.url?.endsWith("/artifacts/:id") &&
      token &&
      request.headers.authorization !== `Bearer ${token}`
    )
      return reply
        .code(401)
        .send({ message: "Registry authentication required" });
  });
  app.setErrorHandler((error, request, reply) => {
    request.log.warn({ err: error }, "Preinstall request failed");
    reply
      .code(422)
      .send({
        message: "This preinstall is unavailable or its recipe is invalid.",
      });
  });
  app.get("/", async () => ({
    presets: (await presets()).map(({ files, runtime, steps, ...preset }) => ({
      ...preset,
      variables: runtime.variables_schema,
    })),
  }));
  app.post("/resolve", { bodyLimit: 262144 }, async (request) => {
    const body = request.body as {
      preset?: string;
      version?: string;
      recipe?: unknown;
    };
    if (
      !body ||
      typeof body.preset !== "string" ||
      typeof body.version !== "string"
    )
      throw new Error("Invalid selection");
    return resolvePreset(body.preset, body.version, body.recipe);
  });
  app.get("/artifacts/:id", async (request, reply) =>
    reply
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .header("Content-Type", "application/octet-stream")
      .send(
        createReadStream(
          await artifactPath((request.params as { id: string }).id),
        ),
      ),
  );
}
