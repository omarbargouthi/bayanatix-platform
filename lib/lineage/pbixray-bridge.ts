// Optional, higher-fidelity .pbix path: spawns `python scripts/pbixray_extract.py`
// to read the compiled data model directly (pbixray decodes the VertiPaq
// binary), which is the only place a .pbix's DAX measures and full column list
// live. Requires Python + the pbixray package on whatever host runs this app —
// when either is missing, extractViaPbixray resolves to null and the caller
// (lib/lineage/pbix-parser.ts) falls back to the DataMashup-only (M source
// only, no measures) path instead of failing the upload.
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PbixRayColumn = { name: string; dataType: string };
export type PbixRayMeasure = { name: string; expression: string };
export type PbixRayTable = { name: string; columns: PbixRayColumn[]; measures: PbixRayMeasure[]; mExpression: string | null };

export async function extractViaPbixray(pbixBuf: Buffer): Promise<PbixRayTable[] | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "pbix-"));
  const filePath = path.join(dir, "model.pbix");
  try {
    await writeFile(filePath, pbixBuf);
    const scriptPath = path.join(process.cwd(), "scripts", "pbixray_extract.py");
    const { stdout } = await execFileAsync("python", [scriptPath, filePath], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60_000,
    });
    const parsed = JSON.parse(stdout);
    if (parsed.error) {
      console.warn("[pbixray] extraction unavailable:", parsed.error);
      return null;
    }
    return parsed.tables as PbixRayTable[];
  } catch (err) {
    console.warn("[pbixray] python/pbixray not available, falling back to DataMashup-only parsing:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
