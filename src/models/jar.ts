export interface JarVersion {
    version: string;
    build?: number;
    url: string;
}

export interface Jar {
    id: string;
    name: string;

    game: "minecraft";

    type: "vanilla" | "paper" | "spigot" | "snapshot" | "forge" | "fabric";

    versions: JarVersion[];

    metadata?: Record<string, any>;
}