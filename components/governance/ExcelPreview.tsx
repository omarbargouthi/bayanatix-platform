"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang-context";

// Shows an Excel workbook (.xlsx) inside the page: one tab per sheet, the cells as a
// plain table. The file is fetched as bytes and read by exceljs in the browser (loaded
// only when a workbook is actually previewed); every cell is put on the page as text, so
// nothing in the file can become markup.
//
// This shows the values, not the workbook's look: formulas appear as their last
// calculated result, and charts, images, colours, column widths and merged cells are not
// drawn. Large sheets are cut off (MAX_ROWS × MAX_COLS). The download is the full copy.
// The older binary format (.xls) is not supported.

const MAX_ROWS = 500;
const MAX_COLS = 50;

type Cell = { text: string; bold: boolean; numeric: boolean };
type Sheet = { name: string; rows: Cell[][]; cols: number; totalRows: number; totalCols: number };

const columnLetter = (n: number): string => {
  let s = "";
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

function displayText(value: unknown, fallback: string): string {
  if (value == null) return "";
  if (value instanceof Date) {
    // Excel dates carry no time zone; exceljs reads them as UTC.
    const iso = value.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
  }
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") {
    const v = value as { result?: unknown; error?: unknown; formula?: unknown; sharedFormula?: unknown };
    const formula = v.formula ?? v.sharedFormula;
    if (formula !== undefined || "result" in v) {
      // A formula: its last calculated result, or the formula itself when the file holds none.
      return v.result == null ? (typeof formula === "string" ? `=${formula}` : "") : displayText(v.result, "");
    }
    if ("error" in v) return String(v.error);
  }
  return fallback;
}

export function ExcelPreview({ url }: { url: string }) {
  const a = useLang().t.attachments;
  const fill = (text: string, values: Record<string, number>) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setSheets(null); setError(false); setActive(0);
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch");
        const data = await res.arrayBuffer();
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(data);
        const out: Sheet[] = [];
        wb.eachSheet((ws) => {
          const totalRows = ws.rowCount, totalCols = ws.columnCount;
          const cols = Math.min(totalCols, MAX_COLS);
          const rows: Cell[][] = [];
          for (let r = 1; r <= Math.min(totalRows, MAX_ROWS); r++) {
            const row = ws.getRow(r);
            const cells: Cell[] = [];
            for (let c = 1; c <= cols; c++) {
              const cell = row.getCell(c);
              const value = cell.value as unknown;
              const result = value && typeof value === "object" && "result" in (value as object) ? (value as { result: unknown }).result : value;
              cells.push({ text: displayText(value, cell.text ?? ""), bold: !!cell.font?.bold, numeric: typeof result === "number" });
            }
            rows.push(cells);
          }
          out.push({ name: ws.name, rows, cols, totalRows, totalCols });
        });
        if (live) setSheets(out);
      } catch {
        if (live) setError(true);
      }
    })();
    return () => { live = false; };
  }, [url]);

  if (error) return <div className="h-full grid place-items-center text-center px-6 text-sm text-ink">{a.excelFailed}</div>;
  if (!sheets) return <div className="h-full grid place-items-center text-sm text-muted">{a.loading}</div>;
  if (sheets.length === 0) return <div className="h-full grid place-items-center text-sm text-muted">{a.excelNoSheets}</div>;

  const sheet = sheets[Math.min(active, sheets.length - 1)];
  const cut = sheet.totalRows > MAX_ROWS || sheet.totalCols > MAX_COLS;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-1.5 border-b border-line bg-white text-[12px] text-ink-soft shrink-0">
        {a.excelNote}
        {cut && <span className="text-amber-700">{fill(sheet.totalCols > MAX_COLS ? a.excelCutRowsCols : a.excelCutRows, { shown: Math.min(sheet.totalRows, MAX_ROWS), total: sheet.totalRows, cols: MAX_COLS, totalCols: sheet.totalCols })}</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto bg-white" dir="ltr">
        {sheet.rows.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-muted">{a.excelEmptySheet}</div>
        ) : (
          <table className="border-collapse text-[12px] text-ink">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 bg-canvas-soft border border-line w-10" />
                {Array.from({ length: sheet.cols }, (_, c) => (
                  <th key={c} className="sticky top-0 z-10 bg-canvas-soft border border-line px-2 py-1 font-semibold text-muted text-[11px] min-w-[72px]">{columnLetter(c + 1)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((cells, r) => (
                <tr key={r}>
                  <th className="sticky left-0 z-10 bg-canvas-soft border border-line px-2 py-1 font-semibold text-muted text-[11px] text-center">{r + 1}</th>
                  {cells.map((cell, c) => (
                    <td key={c} dir="auto" className={`border border-line-soft px-2 py-1 align-top max-w-[360px] whitespace-pre-wrap break-words ${cell.bold ? "font-semibold" : ""} ${cell.numeric ? "text-right tabular-nums" : ""}`}>{cell.text}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sheets.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-t border-line bg-canvas-soft overflow-x-auto shrink-0">
          {sheets.map((s, i) => (
            <button key={i} onClick={() => setActive(i)} dir="auto"
              className={`px-3 py-1 rounded-md text-[12px] whitespace-nowrap border ${i === active ? "bg-white border-brand-purple text-brand-purple font-semibold" : "border-transparent text-ink-soft hover:bg-white"}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
