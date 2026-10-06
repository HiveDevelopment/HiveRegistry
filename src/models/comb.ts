export type CombCategory =
    | "game"
    | "web"
    | "database"
    | "application"
    | "bot"
    | "voice"
    | "runtime";

export type CombCapability =
    | "console"
    | "files"
    | "logs"
    | "environment"
    | "allocations"
    | "sftp"
    | "backups"
    | "schedules"
    | "domains"
    | "ssl"
    | "credentials"
    | "database";

export interface VariableSchema {
    name: string;
    type: "string" | "number" | "boolean";
    default?: unknown;
    required?: boolean;
    description?: string;
}

export interface CombMount {
    source: string;
    target: string;
}

export interface CombInstallOperation {
    type: "http" | "download" | "write_file" | "mkdir" | "chmod" | "move" | "copy" | "delete" | "extract" | "steamcmd" | "git";
    with: Record<string, unknown>;
    save?: string;
}

export interface Comb {
    id: string;
    name: string;
    category: CombCategory;
    group: string;
    game?: string;
    tags: string[];
    capabilities: CombCapability[];
    image: string;
    working_dir: string;
    entrypoint: string[];
    environment: Record<string, string>;
    mounts: CombMount[];
    startup: string;
    variables_schema: VariableSchema[];
    install: CombInstallOperation[];
}
