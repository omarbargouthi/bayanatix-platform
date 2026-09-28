import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addHoldCondition, type ConditionOperator } from "@/lib/queries/legal-holds";

function canManage(role: string) {
  return role === "ADMIN" || role === "OFFICER";
}

const NO_VALUE_OPERATORS: ConditionOperator[] = ["IS_NULL", "IS_NOT_NULL"];
const VALID_OPERATORS: ConditionOperator[] = [
  "EQUALS", "NOT_EQUALS", "GREATER_THAN", "GREATER_OR_EQUAL",
  "LESS_THAN", "LESS_OR_EQUAL", "BETWEEN", "CONTAINS", "IN_LIST",
  "IS_NULL", "IS_NOT_NULL",
];

export async function POST(req: Request, { params }: { params: { holdId: string; entityId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const holdId = Number(params.holdId);
  const entityId = Number(params.entityId);
  if (isNaN(holdId) || isNaN(entityId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { attributeId, valueText, valueText2, operator, logicOperator } = await req.json() as {
    attributeId: number; valueText: string; valueText2?: string | null;
    operator?: ConditionOperator; logicOperator?: "AND" | "OR";
  };
  if (!attributeId) return NextResponse.json({ error: "attributeId is required" }, { status: 400 });

  const op = operator ?? "EQUALS";
  if (!VALID_OPERATORS.includes(op)) return NextResponse.json({ error: "Invalid operator" }, { status: 400 });
  if (!NO_VALUE_OPERATORS.includes(op) && !valueText?.trim()) {
    return NextResponse.json({ error: "valueText is required for this operator" }, { status: 400 });
  }
  if (op === "BETWEEN" && !valueText2?.trim()) {
    return NextResponse.json({ error: "A second value is required for BETWEEN" }, { status: 400 });
  }
  const logic = logicOperator === "AND" ? "AND" : "OR";

  const conditionId = await addHoldCondition(
    holdId, entityId, attributeId,
    NO_VALUE_OPERATORS.includes(op) ? "" : valueText.trim(),
    op === "BETWEEN" ? (valueText2 as string).trim() : null,
    op, logic,
  );
  return NextResponse.json({ ok: true, conditionId }, { status: 201 });
}
