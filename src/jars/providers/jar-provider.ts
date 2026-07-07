export interface ResolvedJar {
    game: string;
    type: string;
    version: string;
    build?: number;
    url: string;
}

export interface JarProvider {
    get(type: string, version?: string): Promise<ResolvedJar | null>;
    list(): Promise<ResolvedJar[]>;
}