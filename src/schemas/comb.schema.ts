import { z } from "zod";

export const VariableSchemaZod = z.object({
    name: z.string(),
    type: z.enum(["string", "number", "boolean"]),
    default: z.any().optional(),
    required: z.boolean().optional(),
    description: z.string().optional()
});

export const CombSchema = z.object({
    id: z.string(),
    name: z.string(),
    game: z.string(),

    tags: z.array(z.string()).default([]),

    image: z.string(),
    working_dir: z.string(),
    entrypoint: z.array(z.string()),

    environment: z.record(z.string()),

    mounts: z.array(
        z.object({
            source: z.string(),
            target: z.string()
        })
    ),

    startup: z.string(),

    variables_schema: z.array(VariableSchemaZod),

    install: z.array(z.any())
});