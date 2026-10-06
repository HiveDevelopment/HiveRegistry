import fs from "node:fs/promises";
import path from "node:path";

import type { Comb } from "../models/comb.js";
import { CombSchema } from "../schemas/comb.schema.js";

const COMBS_DIR = path.join(process.cwd(), "src/data/combs");

export class CombService {
    async list(filters?: {
        search?: string;
        category?: string;
        group?: string;
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

                if (!entry.name.endsWith(".json")) {
                    continue;
                }

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

        return this.applyFilters(combs, filters)
            .sort((a, b) =>
                a.category.localeCompare(b.category) ||
                a.group.localeCompare(b.group) ||
                a.name.localeCompare(b.name)
            );
    }

    async get(id: string): Promise<Comb | null> {
        const combs = await this.list();

        return combs.find(comb => comb.id === id) ?? null;
    }

    private applyFilters(
        combs: Comb[],
        filters?: {
            search?: string;
            category?: string;
            group?: string;
            game?: string;
            tags?: string | string[];
        }
    ): Comb[] {
        if (!filters) {
            return combs;
        }

        let result = combs;

        if (filters.category) {
            result = result.filter(comb => comb.category === filters.category);
        }

        if (filters.group) {
            result = result.filter(comb => comb.group === filters.group);
        }

        if (filters.game) {
            result = result.filter(comb => comb.game === filters.game || comb.group === filters.game);
        }

        if (filters.tags) {
            const tags = (Array.isArray(filters.tags) ? filters.tags : filters.tags.split(","))
                .map(tag => tag.trim().toLowerCase())
                .filter(Boolean);

            result = result.filter(comb =>
                tags.every(tag => comb.tags.some(combTag => combTag.toLowerCase() === tag))
            );
        }

        if (filters.search) {
            const search = filters.search.toLowerCase().trim();

            result = result.filter(comb =>
                comb.id.toLowerCase().includes(search) ||
                comb.name.toLowerCase().includes(search) ||
                comb.category.toLowerCase().includes(search) ||
                comb.group.toLowerCase().includes(search) ||
                (comb.game ?? "").toLowerCase().includes(search) ||
                comb.tags.some(tag => tag.toLowerCase().includes(search))
            );
        }

        return result;
    }
}
