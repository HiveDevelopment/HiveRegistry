import { buildApp } from "./app.js";

async function start() {
    const app = await buildApp();

    await app.listen({
        host: "0.0.0.0",
        port: 8080,
    });

    console.log("HiveRegistry listening on http://localhost:8080");
}

start().catch((err) => {
    console.error(err);
    process.exit(1);
});