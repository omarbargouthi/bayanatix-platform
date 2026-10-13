import { NextResponse } from "next/server";
import { getServerLang, getServerT } from "@/lib/i18n/server";
import { getDpia, getDpiaVersion } from "@/lib/privacy/dpia";
import { buildDpiaHtml } from "@/lib/privacy/dpia-export";
import { viewer } from "@/lib/privacy/dpia-http";
import { renderHtmlToPdf } from "@/lib/reports/pdf-render";

// GET — the assessment as a PDF in the user's language. ?version=n → that frozen version.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const v = await viewer(id);
  if ("response" in v) return v.response;
  const version = Number(new URL(req.url).searchParams.get("version")) || null;
  const dpia = version ? await getDpiaVersion(id, version) : await getDpia(id);
  if (!dpia) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  const html = buildDpiaHtml(dpia, await getServerT(v.session), await getServerLang(v.session), version);
  const pdf = await renderHtmlToPdf(html);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${dpia.referenceCode}${version ? `-v${version}` : ""}.pdf"`,
    },
  });
}
