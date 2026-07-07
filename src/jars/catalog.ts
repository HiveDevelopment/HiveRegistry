import { jarRegistry } from "./index.js";

export async function buildJarCatalog() {

    const jars = await jarRegistry.list();

    const catalog: Record<string, any> = {};

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

        // always keep latest (simple heuristic)
        if (!group.latest || jar.version > group.latest.version) {
            group.latest = jar;
        }
    }

    return catalog;
}