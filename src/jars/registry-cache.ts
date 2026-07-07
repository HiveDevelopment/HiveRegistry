import type { ResolvedJar } from "./providers/jar-provider.js";
import { jarRegistry } from "./index.js";

export class RegistryCache {

    private catalog: Record<string, Record<string, {
        latest: ResolvedJar;
        versions: ResolvedJar[];
    }>> = {};

    private lastBuild = 0;
    private buildPromise: Promise<void> | null = null;

    private readonly TTL = 1000 * 60 * 30; // 30 min

    async build() {

        const jars = await jarRegistry.list();

        const catalog: typeof this.catalog = {};

        for (const jar of jars) {

            if (!catalog[jar.game]) {
                catalog[jar.game] = {};
            }

            if (!catalog[jar.game][jar.type]) {
                catalog[jar.game][jar.type] = {
                    latest: jar,
                    versions: []
                };
            }

            const group = catalog[jar.game][jar.type];

            group.versions.push(jar);

            // determine latest (safe fallback)
            if (!group.latest) {
                group.latest = jar;
            } else {
                group.latest =
                    jar.version.localeCompare(group.latest.version) > 0
                        ? jar
                        : group.latest;
            }
        }

        this.catalog = catalog;
        this.lastBuild = Date.now();
    }

    private async ensure() {

        const now = Date.now();

        if (
            this.catalog &&
            Object.keys(this.catalog).length > 0 &&
            now - this.lastBuild < this.TTL
        ) {
            return;
        }

        if (this.buildPromise) {
            await this.buildPromise;
            return;
        }

        this.buildPromise = this.build()
            .finally(() => {
                this.buildPromise = null;
            });

        await this.buildPromise;
    }

    async getCatalog() {
        await this.ensure();
        return this.catalog;
    }

    async get(game: string, type: string) {
        await this.ensure();
        return this.catalog?.[game]?.[type] ?? null;
    }
}