# HiveRegistry

HiveRegistry is the official package registry for the HivePanel ecosystem.

It provides a central API for discovering and distributing resources used by HivePanel installations, including:

- 📦 Combs — server templates, configuration and installation instructions.
- ☕ Minecraft server software and loader versions.
- 🧩 Mods, plugins and modpacks from Modrinth and CurseForge.
- 📥 Cached installation assets and verified downloads.
- 🛠️ Custom modpack resolution and launcher-compatible exports.

HiveRegistry is optional. HivePanel installations can use the public registry, host their own registry, or manage local resources without a registry. Online catalogue searches and uncached provider downloads require internet access.

Game runtimes and Docker images can be described by Comb manifests. There are currently no standalone `/runtimes` or `/images` API endpoints.

## Quick start

```bash
npm ci
npm run build
npm start
```

For development:

```bash
npm run dev
```

Run the Minecraft API fixture tests:

```bash
npm test
```

The server listens on `0.0.0.0:4000` by default. Production installations should use an HTTPS reverse proxy and persistent cache storage.

## Configuration

Configure these values in `.env` or your service environment:

```dotenv
APP_NAME=HiveRegistry
APP_URL=https://registry.hivepanel.dev
HOST=0.0.0.0
PORT=4000

# Protect Minecraft catalogue, resolve and export operations.
MINECRAFT_API_TOKEN=

# Provider credentials stay in HiveRegistry.
CURSEFORGE_API_KEY=
MODRINTH_TOKEN=
PROVIDER_USER_AGENT=HiveRegistry/1.0 (https://registry.hivepanel.dev; admin@example.com)

# Use a persistent directory writable by the Registry service.
MINECRAFT_CACHE_DIR=/var/lib/hiveregistry/minecraft-cache
```

| Setting | Use |
| --- | --- |
| `APP_URL` | Public HTTPS Registry URL used to generate artifact download URLs. Must be reachable by Workers. |
| `HOST`, `PORT` | Server bind address and port. |
| `MINECRAFT_API_TOKEN` | Optional shared Bearer token for Minecraft API operations. If empty, those operations are public. |
| `CURSEFORGE_API_KEY` | Required to enable CurseForge searches, release lookup and resolution. |
| `MODRINTH_TOKEN` | Optional Modrinth authentication token. Public Modrinth discovery works without it. |
| `PROVIDER_USER_AGENT` | Identifies your Registry to upstream providers. |
| `MINECRAFT_CACHE_DIR` | Metadata and artifact cache directory; defaults to `data/minecraft-cache`. |

For a private deployment, configure a strong `MINECRAFT_API_TOKEN`. This token protects the Minecraft API only. Root, Comb and existing JAR catalogue routes remain public; use reverse-proxy access controls if those must also be private.

## Authentication

When `MINECRAFT_API_TOKEN` is set, Minecraft requests require:

```http
Authorization: Bearer YOUR_REGISTRY_TOKEN
```

`GET /api/v1/minecraft/artifacts/{id}` is public so Workers can retrieve cached files without provider credentials. Artifact URLs contain no API keys.

Provider keys must never be sent by browser clients. HivePanel calls HiveRegistry using the Registry token; HiveRegistry authenticates upstream provider requests itself.

## API endpoints

All paths below are relative to your Registry URL.

| Method | Path | Use | Registry token |
| --- | --- | --- | --- |
| GET | `/` | Service name, API version and online status. | No |
| GET | `/api/v1/combs` | List and filter Comb manifests. | No |
| GET | `/api/v1/combs/{id}` | Retrieve one Comb manifest. | No |
| GET | `/api/v1/jars` | Existing JAR catalogue grouped by game and software type. | No |
| GET | `/api/v1/jars/{game}/{type}` | Retrieve one JAR catalogue group. | No |
| GET | `/api/v1/minecraft/versions` | Minecraft versions, supported runtimes and configured providers. | When configured |
| GET | `/api/v1/minecraft/loaders` | List compatible loader versions or Paper builds. | When configured |
| GET | `/api/v1/minecraft/search` | Search mods, plugins or modpacks. | When configured |
| GET | `/api/v1/minecraft/projects/{provider}/{project}/versions` | List project releases. | When configured |
| POST | `/api/v1/minecraft/resolve` | Resolve selections into an installation plan. | When configured |
| POST | `/api/v1/minecraft/export/modrinth` | Export a custom pack as `.mrpack`. | When configured |
| POST | `/api/v1/minecraft/export/curseforge` | Export a custom pack as a CurseForge manifest ZIP. | When configured |
| GET | `/api/v1/minecraft/artifacts/{id}` | Download an immutable cached artifact. | No |

### Test setup

The following examples use Bash, `curl` and `jq`:

```bash
REGISTRY_URL='https://registry.hivepanel.dev'

# Enter the token configured by the Registry operator, if required.
read -rsp 'Registry API token: ' REGISTRY_TOKEN
echo
```

Replace `REGISTRY_URL` with your own Registry URL when self-hosting. The public Registry may run a different release; the Minecraft endpoints require the updated source to be deployed.

### Service status

```bash
curl -fsS "$REGISTRY_URL/" | jq
```

Returns service metadata including `name`, `version`, `api` and `status`. This endpoint does not verify provider connectivity or Worker health.

### Combs

List all Combs:

```bash
curl -fsS "$REGISTRY_URL/api/v1/combs" | jq
```

Supported query parameters:

| Parameter | Use |
| --- | --- |
| `game` | Filter by exact game identifier, such as `minecraft`. |
| `search` | Match a Comb ID or name, case-insensitively. |
| `tags` | Comma-separated tags; results must include every requested tag, case-insensitively. |

```bash
curl -fsS --get "$REGISTRY_URL/api/v1/combs" \
  --data-urlencode 'game=minecraft' \
  --data-urlencode 'search=paper' | jq
```

The response is an array of full Comb manifests. Use an `id` returned by that list to retrieve one:

```bash
curl -fsS "$REGISTRY_URL/api/v1/combs/minecraft-paper" | jq
```

An unknown Comb returns `404` with `{"error":"Comb not found"}`.

### Existing JAR catalogue

```bash
curl -fsS "$REGISTRY_URL/api/v1/jars" | jq
curl -fsS "$REGISTRY_URL/api/v1/jars/minecraft/paper" | jq
```

The full catalogue is grouped by game and software type. Each group contains `latest` and `versions`; entries include provider download metadata such as `version`, `build` and `url`, where available. An unknown game/type group returns JSON `null`.

This catalogue is metadata and can contain upstream download URLs. Use the Minecraft resolver and artifact endpoints when you need Registry-cached installation files. Use `/minecraft/loaders` to discover the builds exposed by the newer runtime API.

### Minecraft versions and providers

```bash
curl -fsS "$REGISTRY_URL/api/v1/minecraft/versions" \
  -H "Authorization: Bearer $REGISTRY_TOKEN" | jq
```

Response fields:

- `versions`: Minecraft version objects with `id` and `type`, including releases and snapshots returned by Mojang.
- `runtimes`: `vanilla`, `paper`, `fabric`, `forge`, `neoforge`.
- `providers`: availability flags for `modrinth` and `curseforge`.

Provider flags indicate configuration, not a live upstream health check. Not every runtime supports every Minecraft version.

### Loader versions and Paper builds

Required query parameters:

| Parameter | Values |
| --- | --- |
| `minecraft` | Minecraft version, for example `1.21.1`. |
| `loader` | `vanilla`, `paper`, `fabric`, `forge`, `neoforge`. |

```bash
curl -fsS --get "$REGISTRY_URL/api/v1/minecraft/loaders" \
  -H "Authorization: Bearer $REGISTRY_TOKEN" \
  --data-urlencode 'minecraft=1.21.1' \
  --data-urlencode 'loader=fabric' | jq
```

Returns `{"versions":[...]}`. For Paper, entries are compatible stable build numbers. Forge/NeoForge lists exclude versions marked alpha, beta or snapshot. Vanilla returns an empty list because its server artifact is selected by Minecraft version.

### Search mods, plugins and modpacks

| Parameter | Required | Use |
| --- | --- | --- |
| `provider` | Yes | `modrinth` or `curseforge`. |
| `kind` | Yes | `mod`, `plugin` or `modpack`. |
| `query` | No | Search text, up to 100 characters. Empty searches return provider-ranked results. |
| `minecraft` | No | Filter by Minecraft version. |
| `loader` | No | Filter by loader/platform, for example `fabric`, `forge`, `neoforge` or `paper`. |
| `offset` | No | Pagination offset, default `0`, maximum `10000`. |

```bash
curl -fsS --get "$REGISTRY_URL/api/v1/minecraft/search" \
  -H "Authorization: Bearer $REGISTRY_TOKEN" \
  --data-urlencode 'provider=modrinth' \
  --data-urlencode 'kind=mod' \
  --data-urlencode 'minecraft=1.21.1' \
  --data-urlencode 'loader=fabric' \
  --data-urlencode 'query=sodium' \
  --data-urlencode 'offset=0' | jq
```

For plugins, use `kind=plugin` and a platform such as `loader=paper`. For modpacks, use `kind=modpack`; omit `loader` when you want the pack manifest to determine its runtime.

Responses contain `total`, `offset` and `hits`. Each hit includes normalized project metadata such as `provider`, `project`, `name`, `summary`, `icon`, `downloads`, `kind` and `server`. Searches return up to 20 results per page; request offsets `0`, `20`, `40`, etc.

### Project releases

Use a `project` value returned by search:

```bash
PROJECT_ID='replace-with-project-id'

curl -fsS --get \
  "$REGISTRY_URL/api/v1/minecraft/projects/modrinth/$PROJECT_ID/versions" \
  -H "Authorization: Bearer $REGISTRY_TOKEN" \
  --data-urlencode 'minecraft=1.21.1' \
  --data-urlencode 'loader=fabric' \
  --data-urlencode 'offset=0' | jq
```

Optional query parameters are `minecraft`, `loader` and `offset`. Omit version/loader filters to list the provider's available releases without those constraints.

Returns `total`, `offset` and `versions`. Release entries include an `id`, display `name`, `number`, publication date and available compatibility metadata. Up to 100 releases are returned per page; request offsets `0`, `100`, `200`, etc.

Use the release `id` as `selections[].version` when resolving or exporting a pack. Display names and version numbers are not release IDs.

### Resolve an installation plan

`POST /api/v1/minecraft/resolve` accepts JSON:

| Field | Required | Use |
| --- | --- | --- |
| `kind` | Yes | `mod`, `plugin`, `jar`, `builder` or `modpack`. |
| `minecraft` | Yes | Target Minecraft version. |
| `loader` | Yes | Target loader/software. Runtime installation supports `vanilla`, `paper`, `fabric`, `forge`, `neoforge`. |
| `loaderVersion` | No | Pin a version returned by `/loaders`; otherwise choose a compatible default. |
| `selections` | Yes | Array of provider/project/release selections. Use `[]` for a JAR-only plan. |
| `name` | No | Plan/pack name, up to 100 characters. |
| `side` | No | `server` or `client`; defaults to `server` for resolution. |

Each selection contains `provider`, `project` and an optional `version`. Pin releases for reproducible plans. For mods/plugins, omitting `version` chooses the first compatible provider release. Published modpacks require a pinned release.

Resolve a Fabric server JAR:

```bash
curl -fsS "$REGISTRY_URL/api/v1/minecraft/resolve" \
  -H "Authorization: Bearer $REGISTRY_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
    "kind": "jar",
    "minecraft": "1.21.1",
    "loader": "fabric",
    "selections": []
  }' | jq
```

Build a reusable custom pack request using project and release IDs from the preceding endpoints:

```bash
VERSION_ID='replace-with-release-id'

jq -n \
  --arg project "$PROJECT_ID" \
  --arg version "$VERSION_ID" \
  '{
    kind: "builder",
    name: "My custom modpack",
    minecraft: "1.21.1",
    loader: "fabric",
    selections: [{provider: "modrinth", project: $project, version: $version}]
  }' > pack.json

curl -fsS "$REGISTRY_URL/api/v1/minecraft/resolve" \
  -H "Authorization: Bearer $REGISTRY_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @pack.json > plan.json

jq . plan.json
```

Use `kind=mod` to resolve individual mods, `kind=plugin` for plugins, and `kind=builder` to include the runtime alongside custom mod selections.

For a published pack, use `kind=modpack` with exactly one pinned selection. The request still requires valid `minecraft` and `loader` fields, but the pack manifest selects the actual Minecraft version and loader version. Supported manifests are Modrinth `modrinth.index.json` and CurseForge `manifest.json`.

The resolver:

- Includes required dependencies and pins resolved releases.
- Checks declared Minecraft/loader compatibility and explicit dependency conflicts.
- Rejects declared client-only mods in server plans.
- Applies common overrides, then the appropriate server/client overrides.
- Blocks provider-denied downloads.
- Includes runtime installation files for JAR, builder and published-pack plans.

Responses include `format`, `id`, `name`, `kind`, `minecraft`, `loader`, `loaderVersion`, `replaceMods`, `files`, `projects` and `warnings`. File entries contain destinations, sizes, hashes and Registry artifact URLs.

Resolving a plan does not install anything onto a Cell. HivePanel submits the plan to HiveWorker, which downloads and verifies files, stages changes and performs installation. Registry resolution can fetch/cache runtime artifacts or pack archives while preparing the plan.

Compatibility checks use provider metadata; they cannot guarantee that mods work together at runtime. CurseForge entries carry warnings where server compatibility is unknown.

### Export custom modpacks

Both export endpoints accept the same request structure as the resolver. Export treats the request as a custom builder and defaults to the client side.

Export `pack.json` as a Modrinth pack:

```bash
curl -fS "$REGISTRY_URL/api/v1/minecraft/export/modrinth" \
  -H "Authorization: Bearer $REGISTRY_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @pack.json \
  --output custom-pack.mrpack
```

Export a pack whose selections all come from CurseForge:

```bash
curl -fS "$REGISTRY_URL/api/v1/minecraft/export/curseforge" \
  -H "Authorization: Bearer $REGISTRY_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @curseforge-pack.json \
  --output custom-pack.zip
```

Create `curseforge-pack.json` in the same format as `pack.json`, using CurseForge project/file IDs and `provider: "curseforge"` for every selection.

Modrinth exports support mixed Modrinth/CurseForge sources and include pinned file URLs, hashes and side metadata. CurseForge exports require every resolved project, including dependencies, to come from CurseForge. Exports reference mod downloads; they do not bundle all mod JARs into the archive. Both endpoints return ZIP content with a download filename.

HiveRegistry does not store personal pack recipes through an API endpoint. Saved custom packs belong to users in HivePanel.

### Download a cached artifact

Use the URL returned in an installation plan:

```bash
ARTIFACT_URL=$(jq -r '.files[0].url' plan.json)
curl -fS "$ARTIFACT_URL" --output downloaded-artifact.bin
```

The direct endpoint is `GET /api/v1/minecraft/artifacts/{id}`, where `id` is the 64-character artifact identifier returned by Registry. Requests do not accept arbitrary upstream URLs.

Downloads return `application/octet-stream` and an immutable cache header. Missing binaries are fetched from approved provider hosts and checked against available source hashes before entering the cache. HiveWorker independently verifies the hashes in the installation plan.

Use the plan's destination path to decide where a file belongs. An artifact may be a server JAR, loader installer, mod, plugin or configuration override; it is not always a runnable server JAR.

## Caching and limits

- Minecraft provider metadata is cached on disk for 15 minutes.
- The existing JAR catalogue uses a separate 30-minute in-memory cache.
- Artifact binaries are stored persistently and served as streams.
- Simultaneous requests for the same metadata/artifact share in-flight work.
- Artifact cache entries have no automatic eviction. Monitor storage and remove obsolete entries during maintenance; regenerate affected previews afterward.
- Minecraft endpoints use a shared per-IP one-minute request counter. Catalogue/resolve/export requests reject above 120; artifact requests reject above 1,200. Limit responses use HTTP `429`.
- Resolve/export request bodies are limited to 256 KiB; selections are limited to 200.
- Plans allow up to 600 files, 512 MiB per artifact and 4 GiB declared total download size.
- Pack extraction rejects encrypted/ZIP64 archives and limits entries to 3,000, extracted entry size to 16 MiB and total extracted content to 64 MiB.

Changing provider credentials does not bypass cached metadata. Restart with the new environment and allow existing metadata to expire, or clear the appropriate cache during maintenance.

## Errors

Minecraft API errors normally return:

```json
{
  "message": "Registry authentication required"
}
```

| Status | Meaning |
| --- | --- |
| `200` | Successful JSON response or file download. |
| `401` | Missing/incorrect Registry token on a protected Minecraft operation. |
| `404` | Unknown route or missing Comb. |
| `422` | Invalid selection, incompatibility, unavailable provider/artifact, rejected download or export failure. Provider failures are also reported through this status. |
| `429` | Minecraft API rate limit reached. |

Comb errors use an `error` field instead of `message`. Unknown existing JAR catalogue groups return `200` with `null`. Clients should also handle reverse-proxy errors and network timeouts.

## Using HiveRegistry with HivePanel

Panel environment:

```dotenv
HIVEPANEL_REGISTRY_URL=https://registry.hivepanel.dev
HIVEPANEL_REGISTRY_TOKEN=YOUR_REGISTRY_TOKEN
```

Worker configuration:

```yaml
minecraft:
  registry_url: https://registry.hivepanel.dev
```

For a private Registry, replace the URLs in both configurations with the same reachable HTTPS Registry origin. Workers need no Modrinth or CurseForge keys. If Worker configuration omits `minecraft.registry_url`, it defaults to `https://registry.hivepanel.dev`.

Deploy compatible Registry, Worker and Panel releases together. Native Minecraft installers support Minecraft Java with Vanilla, Paper, Fabric, Forge and NeoForge. Bedrock, Quilt installation, Spigot BuildTools and arbitrary installer scripts are not included in this implementation. Some published packs require authors' dedicated server distributions and cannot be installed from these manifests automatically.
