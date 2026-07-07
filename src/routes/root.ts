import { FastifyInstance } from "fastify";

export async function rootRoute(app: FastifyInstance) {

    app.get("/", async () => {
        return {
            name: "HiveRegistry",
            version: "0.1.0",
            api: "v1",
            status: "online"
        };
    });

}