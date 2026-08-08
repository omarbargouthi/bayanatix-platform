import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getWorkbenchRows } from "@/lib/queries/translations";
import * as XLSX from "xlsx";

// Spec FR-2.4: key_code / category / base_text / context_note / translated_text / status columns.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const languageCode = url.searchParams.get("lang");
  if (!languageCode) return NextResponse.json({ error: "Missing lang query param" }, { status: 400 });
  const categoryCode = url.searchParams.get("category") ?? undefined;

  const rows = await getWorkbenchRows({ languageCode, categoryCode });
  const sheetRows = rows.map((r) => ({
    key_code: r.keyCode, category: r.categoryCode, base_text: r.baseText,
    context_note: r.contextNoteText ?? "", translated_text: r.translatedText ?? "", status: r.statusCode,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), "Translations");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const fileName = `translations_${languageCode}${categoryCode ? `_${categoryCode}` : ""}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
