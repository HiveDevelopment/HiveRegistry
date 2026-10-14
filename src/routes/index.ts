import { FastifyInstance } from "fastify";

import { minecraftRoutes } from "./minecraft.js";
import { rootRoute } from "./root.js";
import { combRoutes } from "./combs.js";
import { jarRoutes } from "./jars.js";

export async function registerRoutes(app: FastifyInstance) {
  app.register(rootRoute);
  app.register(minecraftRoutes, { prefix: "/api/v1/minecraft" });

  app.register(combRoutes, {
    prefix: "/api/v1/combs",
  });

  app.register(jarRoutes, {
    prefix: "/api/v1/jars",
  });
}
