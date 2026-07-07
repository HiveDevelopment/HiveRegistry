export interface VariableSchema {
    name: string;
    type: "string" | "number" | "boolean";
    default?: any;
    required?: boolean;
    description?: string;
}

export interface Comb {
    id: string;
    name: string;
    game: string;

    tags: string[];

    image: string;
    working_dir: string;
    entrypoint: string[];

    environment: Record<string, string>;

    mounts: {
        source: string;
        target: string;
    }[];

    startup: string;

    variables_schema: VariableSchema[];

    install: unknown[];
}