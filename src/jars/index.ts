import { JarRegistry } from "./jar-registry.js";
import { PaperProvider } from "./providers/paper.provider.js";
import { StaticJarProvider } from "./providers/static.provider.js";

const paper = new PaperProvider();
const staticProvider = new StaticJarProvider();

export const jarRegistry = new JarRegistry([
    paper,
    staticProvider
]);