import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getWorkbenchRows } from "@/lib/queries/translations";
import { createJob, finishJob, failJob } from "@/lib/queries/background-jobs";
import * as XLSX from "xlsx";

const JOB_TYPE_TRANSLATIONS_EXPORT = "TRANSLATIONS_EXPORT";

// Spec FR-2.4: key_code / category / base_text / context_note / translated_text / status columns.
async function runExport(jobId: number, languageCode: string, categoryCode: string | undefined): Promise<void> {
  try {
    const rows = await getWorkbenchRows({ languageCode, categoryCode });
    const sheetRows = rows.map((r) => ({
      key_code: r.keyCode, category: r.categoryCode, base_language: r.baseLanguageCode, base_text: r.baseText,
      context_note: r.contextNoteText ?? "", translated_text: r.translatedText ?? "", status: r.statusCode,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), "Translations");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const fileName = `translations_${languageCode}${categoryCode ? `_${categoryCode}` : ""}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await finishJob(jobId, {
      resultFileData: buf, resultFileName: fileName,
      resultFileMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      resultJson: { rows: rows.length },
    });
  } catch (e) {
    await failJob(jobId, (e as Error).message);
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { languageCode?: string; categoryCode?: string };
  if (!body.languageCode) return NextResponse.json({ error: "Missing languageCode" }, { status: 400 });

  const jobId = await createJob(JOB_TYPE_TRANSLATIONS_EXPORT, body, session.userId);
  void runExport(jobId, body.languageCode, body.categoryCode);

  return NextResponse.json({ jobId }, { status: 202 });
}
