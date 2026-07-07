import type { JarProvider, ResolvedJar } from "./providers/jar-provider.js";

export class JarRegistry {

    constructor(private providers: JarProvider[]) {}

    async get(type: string, version?: string): Promise<ResolvedJar | null> {

        for (const provider of this.providers) {

            const result = await provider.get(type, version);

            if (result) return result;
        }

        return null;
    }

    async list(): Promise<ResolvedJar[]> {

        const all: ResolvedJar[] = [];

        for (const provider of this.providers) {
            all.push(...await provider.list());
        }

        return all;
    }
}