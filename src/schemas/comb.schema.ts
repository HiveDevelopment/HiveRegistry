import { z } from "zod";
import { presetSchema } from "../preinstalls/catalogue.js";

export const VariableSchemaZod = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean"]),
  default: z.unknown().optional(),
  required: z.boolean().optional(),
  description: z.string().optional(),
});

export const CombCategoryZod = z.enum([
  "game",
  "web",
  "database",
  "application",
  "bot",
  "voice",
  "runtime",
]);

export const CombCapabilityZod = z.enum([
  "console",
  "files",
  "logs",
  "environment",
  "allocations",
  "sftp",
  "backups",
  "schedules",
  "domains",
  "ssl",
  "credentials",
  "database",
]);

const InstallWithZod = z.record(z.string(), z.unknown());

export const CombInstallOperationZod = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("http"),
    with: InstallWithZod,
    save: z.string().optional(),
  }),
  z.object({
    type: z.literal("download"),
    with: InstallWithZod,
    save: z.string().optional(),
  }),
  z.object({
    type: z.literal("write_file"),
    with: InstallWithZod,
    save: z.string().optional(),
  }),
  z.object({
    type: z.literal("mkdir"),
    with: InstallWithZod,
    save: z.string().optional(),
  }),
  z.object({
    type: z.literal("chmod"),
    with: InstallWithZod,
    save: z.string().optional(),
  }),
  z.object({
    type: z.literal("move"),
    with: InstallWithZod,
    save: z.string().optional(),
  }),
  z.object({
    type: z.literal("copy"),
    with: InstallWithZod,
    save: z.string().optional(),
  }),
  z.object({
    type: z.literal("delete"),
    with: InstallWithZod,
    save: z.string().optional(),
  }),
  z.object({
    type: z.literal("extract"),
    with: InstallWithZod,
    save: z.string().optional(),
  }),
  z.object({
    type: z.literal("steamcmd"),
    with: InstallWithZod,
    save: z.string().optional(),
  }),
  z.object({
    type: z.literal("git"),
    with: InstallWithZod,
    save: z.string().optional(),
  }),
  z.object({
    type: z.literal("run"),
    with: InstallWithZod,
    save: z.string().optional(),
  }),
]);

export const CombSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: CombCategoryZod,
  group: z.string().min(1),
  game: z.string().min(1).optional(),
  tags: z.array(z.string()).default([]),
  capabilities: z.array(CombCapabilityZod).default([]),
  image: z.string().min(1),
  docker_images: z.record(z.string(), z.string().min(1)).optional(),
  recommended_resources: z.object({
    memory_mb: z.number().int().nonnegative().optional(),
    overhead_memory_mb: z.number().int().nonnegative().optional(),
    swap_mb: z.number().int().min(-1).optional(),
    disk_mb: z.number().int().nonnegative().optional(),
    cpu_percent: z.number().int().min(0).max(1000).optional(),
    io_weight: z.number().int().min(10).max(1000).optional(),
  }).strict().optional(),
  working_dir: z.string().min(1),
  shell: z.enum(["sh", "bash"]).optional(),
  variables: z.record(z.string(), z.string()).optional(),
  stop: z.object({command:z.string().max(1000).refine(value=>!/[\r\n]/.test(value)),timeout:z.number().int().min(0).max(600),signal:z.enum(["SIGTERM","SIGINT","SIGHUP","SIGQUIT"])}).optional(),
  entrypoint: z.array(z.string()),
  environment: z.record(z.string(), z.string()),
  mounts: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
    }),
  ),
  startup: z.string(),
  variables_schema: z.array(VariableSchemaZod),
  preinstall_recipes: z.array(presetSchema).max(50).optional(),
  preinstalls: z
    .array(z.string().regex(/^[a-z0-9-]{1,80}$/))
    .max(50)
    .optional(),
  install: z.array(CombInstallOperationZod),
});
