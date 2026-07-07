import type { JarProvider, ResolvedJar } from "./jar-provider.js";

export class PaperProvider implements JarProvider {

    private cache: ResolvedJar[] = [];

    private lastFetch = 0;
    private refreshPromise: Promise<void> | null = null;

    private readonly TTL = 1000 * 60 * 30; // 30 minutes

    async refresh() {

        const res = await fetch("https://fill.papermc.io/v3/projects/paper", {
            headers: {
                "User-Agent": "HiveRegistry/1.0 (https://registry.hivepanel.dev)"
            }
        });

        const data = await res.json();

        if (!data?.versions || typeof data.versions !== "object") {
            throw new Error("Invalid Fill API response");
        }

        const versionGroups = data.versions;
        const allVersions = Object.values(versionGroups)
            .flat()
            .filter((version): version is string => typeof version === "string");

        const results: ResolvedJar[] = [];

        for (const version of allVersions) {

            try {
                const buildsRes = await fetch(
                    `https://fill.papermc.io/v3/projects/paper/versions/${version}/builds`,
                    {
                        headers: {
                            "User-Agent": "HiveRegistry/1.0 (https://registry.hivepanel.dev)"
                        }
                    }
                );

                const builds = await buildsRes.json();

                if (!Array.isArray(builds)) continue;

                const stableBuilds = builds
                    .filter(b => b.channel === "STABLE")
                    .sort((a, b) => a.id - b.id);

                const latest = stableBuilds.at(-1);

                if (!latest) continue;

                const url =
                    latest.downloads?.["server:default"]?.url;

                if (!url) continue;

                results.push({
                    game: "minecraft",
                    type: "paper",
                    version,
                    build: latest.id,
                    url
                });

            } catch (err) {
                console.warn(`[PaperProvider] Failed version ${version}`, err);
                continue;
            }
        }

        // newest versions first
        results.sort((a, b) =>
            b.version.localeCompare(a.version)
        );

        this.cache = results;
        this.lastFetch = Date.now();
    }

    private async ensureCache() {

        const now = Date.now();

        // fresh cache
        if (this.cache.length > 0 && now - this.lastFetch < this.TTL) {
            return;
        }

        // prevent duplicate refresh calls (important under load)
        if (this.refreshPromise) {
            await this.refreshPromise;
            return;
        }

        this.refreshPromise = this.refresh()
            .finally(() => {
                this.refreshPromise = null;
            });

        await this.refreshPromise;
    }

    async get(type: string, version?: string) {

        if (type !== "paper") return null;

        await this.ensureCache();

        if (!version) {
            return this.cache[0] ?? null;
        }

        return (
            this.cache.find(j => j.version === version) ?? null
        );
    }

    async list() {
        await this.ensureCache();
        return this.cache;
    }
}