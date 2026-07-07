import fs from "node:fs/promises";
import path from "node:path";

import type { Comb } from "../models/comb.js";
import { CombSchema } from "../schemas/comb.schema.js";

const COMBS_DIR = path.join(process.cwd(), "src/data/combs");

export class CombService {
    async list(filters?: {
        search?: string;
        game?: string;
        tags?: string | string[];
    }): Promise<Comb[]> {
        const combs: Comb[] = [];
        async function scanDir(dir: string) {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    await scanDir(fullPath);
                    continue;
                }

                if (!entry.name.endsWith(".json")) continue;

                try {
                    const json = await fs.readFile(fullPath, "utf8");
                    const raw = JSON.parse(json);

                    const result = CombSchema.safeParse(raw);

                    if (!result.success) {
                        console.error(
                            `[HiveRegistry] Invalid comb file: ${fullPath}`,
                            result.error.flatten()
                        );
                        continue;
                    }

                    combs.push(result.data);

                } catch (err) {
                    console.error(
                        `[HiveRegistry] Failed to load comb file: ${fullPath}`,
                        err
                    );
                }
            }
        }

        await scanDir(COMBS_DIR);
        return this.applyFilters(combs, filters);
    }

    async get(id: string): Promise<Comb | null> {
        async function scanDir(dir: string): Promise<Comb | null> {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const found = await scanDir(fullPath);
                    if (found) return found;
                    continue;
                }

                if (!entry.name.endsWith(".json")) continue;
                try {
                    const json = await fs.readFile(fullPath, "utf8");
                    const raw = JSON.parse(json);

                    const result = CombSchema.safeParse(raw);

                    if (!result.success) {
                        continue;
                    }

                    if (result.data.id === id) {
                        return result.data;
                    }

                } catch {
                    continue;
                }
            }
            return null;
        }
        return scanDir(COMBS_DIR);
    }

    private applyFilters(
        combs: Comb[],
        filters?: { search?: string; game?: string; tags?: string | string[] }
    ): Comb[] {
        if (!filters) return combs;
        let result = combs;

        if (filters.game) {
            result = result.filter(c => c.game === filters.game);
        }

         if (filters.tags) {
            const tags = Array.isArray(filters.tags)
                ? filters.tags
                : filters.tags.split(",");

            result = result.filter(c =>
                tags.every(tag => c.tags.includes(tag))
            );
        }

        if (filters.search) {
            const s = filters.search.toLowerCase();
            result = result.filter(c =>
                c.id.toLowerCase().includes(s) ||
                c.name.toLowerCase().includes(s)
            );
        }
        return result;
    }
}