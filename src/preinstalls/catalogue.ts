import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { registerArtifact } from "../minecraft/artifacts.js";
import { safePath } from "../minecraft/archive.js";
import { config } from "../config.js";

const variable = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  type: z.enum(["string", "number", "boolean"]),
  default: z.string().default(""),
  required: z.boolean().default(false),
  secret: z.boolean().default(false),
  install: z.boolean().default(false),
  description: z.string().default(""),
});
const recipeStep = z.object({
  type: z.enum([
    "git",
    "mkdir",
    "copy",
    "move",
    "delete",
    "write_file",
    "download",
    "extract",
    "run",
  ]),
  with: z.record(z.string(), z.string().max(16384)),
});
export const presetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,80}$/),
  name: z.string().min(1),
  description: z.string(),
  source: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === "https:"),
  license: z.string(),
  warnings: z.array(z.string()).default([]),
  steps: z.array(recipeStep).max(100).default([]),
  versions: z
    .array(
      z.object({
        id: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/),
        image: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9./_:@-]{1,250}$/),
        steps: z.array(recipeStep).max(100).optional(),
      }),
    )
    .min(1),
  runtime: z.object({
    startup: z.string().min(1),
    environment: z.record(z.string(), z.string()),
    variables_schema: z.array(variable).max(50),
    secretKeys: z
      .array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/))
      .max(10)
      .default([]),
  }),
  files: z
    .record(z.string(), z.string())
    .default({})
    .refine((files) => Object.keys(files).length <= 100),
});
export async function presets() {
  const directory = path.resolve(
    process.env.PREINSTALL_CATALOGUE_DIR ?? "src/data/preinstalls",
  );
  const entries = await fs.readdir(directory);
  return Promise.all(
    entries
      .filter((name) => name.endsWith(".json"))
      .map(async (name) =>
        presetSchema.parse(
          JSON.parse(await fs.readFile(path.join(directory, name), "utf8")),
        ),
      ),
  );
}
export async function resolvePreset(
  id: string,
  version: string,
  custom?: unknown,
) {
  const preset = custom
    ? presetSchema.parse(custom)
    : (await presets()).find((item) => item.id === id);
  const release = preset?.versions.find((item) => item.id === version);
  if (!preset || preset.id !== id || !release)
    throw new Error("Unknown preinstall or version");
  const files = await Promise.all(
    Object.entries(
      Object.keys(preset.files).length
        ? preset.files
        : {
            "PREINSTALL.md": `# ${preset.name}\n\n${preset.description}\n\nSource: ${preset.source}\n`,
          },
    ).map(async ([destination, content]) => {
      safePath(destination);
      const bytes = Buffer.from(content),
        hashes = { sha256: createHash("sha256").update(bytes).digest("hex") };
      const artifact = await registerArtifact(
        { url: "", filename: destination, size: bytes.length, hashes },
        bytes,
      );
      return {
        path: destination,
        size: bytes.length,
        hashes,
        url: `${config.app.url.replace(/\/$/, "")}/api/v1/preinstalls/artifacts/${artifact}`,
      };
    }),
  );
  return {
    format: 1,
    id: createHash("sha256")
      .update(JSON.stringify([preset, release]))
      .digest("hex"),
    preset: id,
    version,
    name: preset.name,
    kind: "preinstall",
    wipe: true,
    files,
    runtime: {
      ...preset.runtime,
      image: release.image,
      steps: release.steps ?? preset.steps,
    },
    warnings: preset.warnings,
    source: preset.source,
    license: preset.license,
  };
}
