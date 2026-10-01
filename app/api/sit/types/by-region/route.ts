import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setSitTypesEnabledForRegion } from "@/lib/queries/sit-classification";

// Admin UI's "Enable all" / "Disable all" per country-group action on the SIT
// Type Catalog -- bulk-flips is_enabled for every type that has at least one
// pattern in the given region. GLOBAL is intentionally not special-cased here
// since the UI never offers this action on the Global group.
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const regionCode = typeof body.region_code === "string" ? body.region_code : "";
  const isEnabled = typeof body.is_enabled === "boolean" ? body.is_enabled : null;
  if (!regionCode || isEnabled === null) {
    return NextResponse.json({ error: "region_code and is_enabled are required" }, { status: 400 });
  }

  await setSitTypesEnabledForRegion(regionCode, isEnabled);
  return NextResponse.json({ ok: true });
}
