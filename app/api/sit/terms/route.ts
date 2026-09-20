import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSitTermsForRegion, getSitSettings } from "@/lib/queries/sit-classification";

// Terms eligible for the steward "reassign" dropdown and the admin settings
// page's pattern list — scoped to the given region (or the active region if
// omitted), per "region controls which list of terms."
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region") ?? (await getSitSettings()).activeRegionCode;

  return NextResponse.json(await getSitTermsForRegion(region));
}
