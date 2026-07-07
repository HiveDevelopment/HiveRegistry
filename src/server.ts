import { buildApp } from "./app.js";
import { config } from "./config.js";

async function start() {
    const app = await buildApp();

    await app.listen({
        host: config.server.host,
        port: config.server.port,
    });

    console.log(
        `${config.app.name} listening on ${config.app.url}`
    );
}

start().catch((err) => {
    console.error(err);
    process.exit(1);
});