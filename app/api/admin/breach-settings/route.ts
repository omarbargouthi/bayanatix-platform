import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { defaultBreachRegulations, setDefaultBreachRegulations } from "@/lib/privacy/breach";

// The laws preselected on a new breach (admin only; Configuration › Privacy & Retention).
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ regulations: await defaultBreachRegulations() });
}

// PUT { regulations: ["PDPL", "PIPEDA", …] }
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { regulations } = await req.json().catch(() => ({}));
  const res = await setDefaultBreachRegulations(regulations, session.userId);
  if ("error" in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json({ regulations: await defaultBreachRegulations() });
}
