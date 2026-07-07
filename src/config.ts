import dotenv from "dotenv";

dotenv.config();

export const config = {
    app: {
        name: process.env.APP_NAME ?? "HiveRegistry",
        url: process.env.APP_URL ?? "https://registry.hivepanel.dev",
    },

    server: {
        host: process.env.HOST ?? "0.0.0.0",
        port: Number(process.env.PORT ?? 4000),
    },
};