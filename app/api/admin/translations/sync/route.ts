import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { syncListValueKeys } from "@/lib/i18n-admin/translatable-fields";

// Re-syncs translation_keys from the translatable-field registry's source tables
// (app_lookups, classification_types, stakeholder_roles) — picks up new/changed
// rows as MISSING/STALE keys (AC-5, AC-6). Safe to call anytime; called on-demand
// from the admin panel here, and opportunistically when the workbench loads a LIST
// category.
export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await syncListValueKeys();
  return NextResponse.json(result);
}
