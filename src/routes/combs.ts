import { FastifyInstance } from "fastify";
import { CombService } from "../services/comb.service.js";

const service = new CombService();

export async function combRoutes(app: FastifyInstance) {

    app.get("/", async (request) => {
        const query = request.query as {
            search?: string;
            game?: string;
            tags?: string;
        };

        const combs = await service.list({
            search: query.search,
            game: query.game,
            tags: query.tags
        });

        let result = combs;

        // 🔍 filter by game
        if (query.game) {
            result = result.filter(c => c.game === query.game);
        }

        // 🔎 search by id or name
        if (query.search) {
            const s = query.search.toLowerCase();

            result = result.filter(c =>
                c.id.toLowerCase().includes(s) ||
                c.name.toLowerCase().includes(s)
            );
        }

        return result;
    });

    app.get("/:id", async (request, reply) => {
        const { id } = request.params as {
            id: string;
        };
        const comb = await service.get(id);

        if (!comb) {
            return reply.code(404).send({
                error: "Comb not found"
            });
        }

        return comb;
    });
}