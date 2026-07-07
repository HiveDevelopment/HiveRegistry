import { FastifyInstance } from "fastify";
import { registryCache } from "../jars/cache.js";

export async function jarRoutes(app: FastifyInstance) {
    app.get("/", async () => {
        return registryCache.getCatalog();
    });

    app.get("/:game/:type", async (req) => {
        const { game, type } = req.params as {
            game: string;
            type: string;
        };

        return registryCache.get(game, type);
    });
}