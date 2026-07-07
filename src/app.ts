import Fastify from "fastify";
import { registerRoutes } from "./routes/index.js";
import { registryCache } from "./jars/cache.js";

export async function buildApp() {
    const app = Fastify({
        logger: true
    });

    const cachePromise = registryCache.build();

    await registerRoutes(app);
    await cachePromise;

    return app;
}