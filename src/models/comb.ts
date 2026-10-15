export type CombCategory =
  "game" | "web" | "database" | "application" | "bot" | "voice" | "runtime";

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
  type:
    | "http"
    | "download"
    | "write_file"
    | "mkdir"
    | "chmod"
    | "move"
    | "copy"
    | "delete"
    | "extract"
    | "steamcmd"
    | "git"
    | "run";
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
  docker_images?: Record<string, string>;
  recommended_resources?: { memory_mb?: number; overhead_memory_mb?: number; swap_mb?: number; disk_mb?: number; cpu_percent?: number; io_weight?: number };
  working_dir: string;
  shell?: "sh" | "bash";
  variables?: Record<string,string>;
  stop?: {command:string;timeout:number;signal:"SIGTERM"|"SIGINT"|"SIGHUP"|"SIGQUIT"};
  entrypoint: string[];
  environment: Record<string, string>;
  mounts: CombMount[];
  startup: string;
  variables_schema: VariableSchema[];
  preinstalls?: string[];
  preinstall_recipes?: Record<string, unknown>[];
  install: CombInstallOperation[];
}
