// Azure Data Factory / Azure Synapse crawler — step 1: get the definitions.
//
// A factory and a Synapse workspace describe their pipelines, datasets, linked services,
// mapping data flows and notebooks as JSON resources of the same shape ({ name,
// properties }). This module only fetches them; lib/lineage/azure/model.ts reads them.
//
// A connection (db_type_code 'ADF' or 'SYNAPSE') points at one of:
//   * a folder — the Git repository the factory / workspace is integrated with (folders
//     pipeline/, dataset/, linkedService/, dataflow/, notebook/), or a folder holding an
//     exported ARM template;
//   * the live service — for ADF the factory's resource ID
//     (/subscriptions/…/resourceGroups/…/providers/Microsoft.DataFactory/factories/NAME),
//     for Synapse the workspace's development endpoint
//     (https://NAME.dev.azuresynapse.net) — read with a service principal: tenant ID in
//     the connection's database field, client ID as user name, client secret as password.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { cleanSourcePath } from "../../source-path";

export type AzureService = "ADF" | "SYNAPSE";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AzResource = { name: string; properties: any };
export type AzDefinitions = {
  service: AzureService;
  /** Where they came from, for the crawl log. */
  origin: string;
  linkedServices: AzResource[];
  datasets: AzResource[];
  pipelines: AzResource[];
  dataflows: AzResource[];
  notebooks: AzResource[];
};

export type AzureConnection = {
  dbTypeCode: string; connectionName: string; hostAddress: string;
  tenantId: string | null; clientId: string | null; clientSecret: string | null;
};

type Kind = "linkedServices" | "datasets" | "pipelines" | "dataflows" | "notebooks";
const KINDS: Kind[] = ["linkedServices", "datasets", "pipelines", "dataflows", "notebooks"];
const empty = (service: AzureService, origin: string): AzDefinitions =>
  ({ service, origin, linkedServices: [], datasets: [], pipelines: [], dataflows: [], notebooks: [] });

export const ADF_RESOURCE_ID = /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.DataFactory\/factories\/[^/]+\/?$/i;
export const SYNAPSE_ENDPOINT = /^https:\/\/[a-z0-9-]+\.dev\.azuresynapse\.(net|azure\.cn|usgovcloudapi\.net)\/?$/i;

/** Whether the connection's address names the live service rather than a folder. */
export function isLiveAddress(dbTypeCode: string, hostAddress: string): boolean {
  const v = cleanSourcePath(hostAddress);
  return dbTypeCode === "ADF" ? ADF_RESOURCE_ID.test(v) : SYNAPSE_ENDPOINT.test(v);
}

// ── Folder ────────────────────────────────────────────────────────────────────

// The Git layout uses singular folder names; exports and hand-made copies vary.
const FOLDER_KIND: Record<string, Kind> = {
  linkedservice: "linkedServices", linkedservices: "linkedServices",
  dataset: "datasets", datasets: "datasets",
  pipeline: "pipelines", pipelines: "pipelines",
  dataflow: "dataflows", dataflows: "dataflows",
  notebook: "notebooks", notebooks: "notebooks",
};

function readJson(file: string): unknown {
  // Files saved on Windows often start with a byte-order mark, which JSON.parse rejects.
  return JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
}

// An ARM template names a resource "[concat(parameters('factoryName'), '/PL_Load')]".
function armName(raw: string): string {
  const m = raw.match(/'\/?([^']+)'\s*\)\s*\]\s*$/);
  const name = m ? m[1] : raw;
  return name.split("/").pop() ?? name;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addArmTemplate(defs: AzDefinitions, template: any): number {
  let added = 0;
  for (const r of Array.isArray(template?.resources) ? template.resources : []) {
    const kind = FOLDER_KIND[String(r?.type ?? "").split("/").pop()!.toLowerCase()];
    if (!kind || !r.properties) continue;
    defs[kind].push({ name: armName(String(r.name ?? "")), properties: r.properties });
    added++;
  }
  return added;
}

export function loadFromFolder(rawPath: string, service: AzureService): { defs: AzDefinitions; problems: string[] } {
  const root = cleanSourcePath(rawPath);
  if (!root) throw new Error("A folder path is required");
  if (!existsSync(root)) throw new Error(`Path not found: ${root}`);
  if (!statSync(root).isDirectory()) throw new Error(`Not a folder: ${root}`);

  const defs = empty(service, root);
  const problems: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const kind = FOLDER_KIND[entry.name.toLowerCase()];
      if (!kind) continue;
      const dir = path.join(root, entry.name);
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        if (!f.isFile() || !f.name.toLowerCase().endsWith(".json")) continue;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const json = readJson(path.join(dir, f.name)) as any;
          if (!json?.properties) { problems.push(`${entry.name}/${f.name}: no "properties" — skipped`); continue; }
          defs[kind].push({ name: String(json.name ?? f.name.replace(/\.json$/i, "")), properties: json.properties });
        } catch (e) {
          problems.push(`${entry.name}/${f.name}: not valid JSON (${(e as Error).message})`);
        }
      }
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      // An exported ARM template (ARMTemplateForFactory.json / TemplateForWorkspace.json).
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json = readJson(path.join(root, entry.name)) as any;
        if (String(json?.$schema ?? "").toLowerCase().includes("deploymenttemplate")) addArmTemplate(defs, json);
      } catch (e) {
        problems.push(`${entry.name}: not valid JSON (${(e as Error).message})`);
      }
    }
  }
  return { defs, problems };
}

// ── Live service ──────────────────────────────────────────────────────────────

async function getToken(conn: AzureConnection, scope: string): Promise<string> {
  if (!conn.tenantId || !conn.clientId || !conn.clientSecret) {
    throw new Error("Reading the live service needs a service principal: tenant ID, client ID (user name) and client secret (password).");
  }
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(conn.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: conn.clientId, client_secret: conn.clientSecret, scope }),
    signal: AbortSignal.timeout(30_000),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !body.access_token) {
    throw new Error(`Azure sign-in failed (${res.status}): ${body.error_description ?? body.error ?? "no token returned"}`.split("\r\n")[0]);
  }
  return body.access_token as string;
}

async function listAll(url: string, token: string, what: string): Promise<AzResource[]> {
  const out: AzResource[] = [];
  let next: string | null = url;
  for (let page = 0; next && page < 200; page++) {
    const res: Response = await fetch(next, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(`Listing ${what} failed (${res.status}): ${body?.error?.message ?? body?.message ?? res.statusText}`);
    for (const r of Array.isArray(body.value) ? body.value : []) {
      if (r?.name && r.properties) out.push({ name: String(r.name), properties: r.properties });
    }
    next = typeof body.nextLink === "string" && body.nextLink ? body.nextLink : null;
  }
  return out;
}

export async function loadFromService(conn: AzureConnection): Promise<AzDefinitions> {
  const address = cleanSourcePath(conn.hostAddress).replace(/\/+$/, "");
  const service = conn.dbTypeCode as AzureService;
  const defs = empty(service, address);
  if (service === "ADF") {
    const token = await getToken(conn, "https://management.azure.com/.default");
    const base = `https://management.azure.com${address}`;
    // A factory has no notebooks of its own.
    const paths: Partial<Record<Kind, string>> = { linkedServices: "linkedservices", datasets: "datasets", pipelines: "pipelines", dataflows: "dataflows" };
    for (const kind of KINDS) {
      if (paths[kind]) defs[kind] = await listAll(`${base}/${paths[kind]}?api-version=2018-06-01`, token, kind);
    }
  } else {
    const token = await getToken(conn, "https://dev.azuresynapse.net/.default");
    const paths: Record<Kind, string> = { linkedServices: "linkedservices", datasets: "datasets", pipelines: "pipelines", dataflows: "dataflows", notebooks: "notebooks" };
    for (const kind of KINDS) defs[kind] = await listAll(`${address}/${paths[kind]}?api-version=2020-12-01`, token, kind);
  }
  return defs;
}

export async function loadDefinitions(conn: AzureConnection): Promise<{ defs: AzDefinitions; problems: string[] }> {
  if (conn.dbTypeCode !== "ADF" && conn.dbTypeCode !== "SYNAPSE") throw new Error(`Not an Azure Data Factory or Synapse connection: ${conn.dbTypeCode}`);
  if (isLiveAddress(conn.dbTypeCode, conn.hostAddress)) return { defs: await loadFromService(conn), problems: [] };
  if (/^https?:\/\//i.test(cleanSourcePath(conn.hostAddress)) || cleanSourcePath(conn.hostAddress).startsWith("/subscriptions/")) {
    throw new Error(conn.dbTypeCode === "ADF"
      ? "That is not a Data Factory resource ID. Expected /subscriptions/…/resourceGroups/…/providers/Microsoft.DataFactory/factories/NAME, or a folder path."
      : "That is not a Synapse development endpoint. Expected https://NAME.dev.azuresynapse.net, or a folder path.");
  }
  return loadFromFolder(conn.hostAddress, conn.dbTypeCode);
}

export function countDefinitions(d: AzDefinitions): string {
  const n = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;
  return [n(d.pipelines.length, "pipeline"), n(d.dataflows.length, "data flow"), n(d.notebooks.length, "notebook"),
    n(d.datasets.length, "dataset"), n(d.linkedServices.length, "linked service")].join(", ");
}
