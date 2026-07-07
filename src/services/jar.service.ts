import fs from "node:fs/promises";
import path from "node:path";

import type { Jar } from "../models/jar.js";

const JARS_DIR = path.join(process.cwd(), "src/data/jars");

export class JarService {

    async list(): Promise<Jar[]> {

        const jars: Jar[] = [];

        async function scan(dir: string) {

            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {

                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    await scan(fullPath);
                    continue;
                }

                if (!entry.name.endsWith(".json")) continue;

                const text = await fs.readFile(fullPath, "utf8");

                if (!text.trim()) {
                    console.warn(`[HiveRegistry] Skipping empty file: ${fullPath}`);
                    continue;
                }

                let raw;

                try {
                    raw = JSON.parse(text);
                } catch (err) {
                    console.error(`[HiveRegistry] Invalid JSON: ${fullPath}`, err);
                    continue;
                }

                jars.push(raw);
            }
        }

        await scan(JARS_DIR);

        return jars;
    }

    async get(id: string): Promise<Jar | null> {

        const jars = await this.list();

        return jars.find(j => j.id === id) ?? null;
    }

    async getByType(type: Jar["type"]) {

        const jars = await this.list();

        return jars.filter(j => j.type === type);
    }

    async resolve(
        type: string,
        version?: string
    ) {

        const jars = await this.list();

        const jar = jars.find(j => j.type === type);

        if (!jar) return null;

        // if no version requested → return latest
        if (!version) {
            return jar.versions[0] ?? null;
        }

        // exact match
        const match = jar.versions.find(v => v.version === version);

        if (match) return match;

        // fallback → closest lower version
        const sorted = [...jar.versions].sort((a, b) =>
            b.version.localeCompare(a.version)
        );

        return sorted.find(v => v.version <= version) ?? null;
    }
}