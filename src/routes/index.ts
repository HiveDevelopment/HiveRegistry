import { FastifyInstance } from "fastify";

import { rootRoute } from "./root.js";
import { combRoutes } from "./combs.js";
import { jarRoutes } from "./jars.js";

export async function registerRoutes(app: FastifyInstance) {

    app.register(rootRoute);

    app.register(combRoutes, {
        prefix: "/api/v1/combs"
    });

    app.register(jarRoutes, {
        prefix: "/api/v1/jars"
    });
}