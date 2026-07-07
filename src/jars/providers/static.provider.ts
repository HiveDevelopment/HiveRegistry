import fs from "node:fs/promises";
import path from "node:path";

import type { JarProvider, ResolvedJar } from "./jar-provider.js";

const DIR = path.join(process.cwd(), "src/data/jars");

export class StaticJarProvider implements JarProvider {

    private cache: ResolvedJar[] = [];

    async load() {

        const files = await fs.readdir(DIR, { withFileTypes: true });

        const results: ResolvedJar[] = [];

        for (const file of files) {

            if (!file.isFile() || !file.name.endsWith(".json")) continue;

            const raw = JSON.parse(
                await fs.readFile(path.join(DIR, file.name), "utf8")
            );

            results.push(raw);
        }

        this.cache = results;
    }

    async get(type: string) {

        if (this.cache.length === 0) {
            await this.load();
        }

        return this.cache.find(j => j.type === type) ?? null;
    }

    async list() {
        if (this.cache.length === 0) {
            await this.load();
        }

        return this.cache;
    }
}