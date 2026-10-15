import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getServerLang, getServerT } from "@/lib/i18n/server";
import { canViewBreach, getBreach } from "@/lib/privacy/breach";
import { buildBreachHtml } from "@/lib/privacy/breach-export";
import { renderHtmlToPdf } from "@/lib/reports/pdf-render";

// GET — the breach as a PDF report in the user's language, for the regulator notification.
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isFinite(id) || !(await canViewBreach(session, id))) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  const breach = await getBreach(id);
  if (!breach) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  const [contact] = breach.ownerUserId
    ? await sql<{ name: string; email: string | null }[]>`SELECT full_name AS name, email FROM bayanat.users WHERE user_id = ${breach.ownerUserId}`
    : [];
  const html = buildBreachHtml(breach, await getServerT(session), await getServerLang(session), contact ?? null);
  const pdf = await renderHtmlToPdf(html);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${breach.referenceCode}.pdf"` },
  });
}
