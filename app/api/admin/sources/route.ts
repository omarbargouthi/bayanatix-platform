import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listConnections, createConnection } from "@/lib/queries/sources";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connections = await listConnections();
  // Mask passwords in response
  return NextResponse.json(connections.map(c => ({ ...c, passwordText: c.passwordText ? "••••••••" : null })));
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const { connectionName, dbTypeCode, hostAddress, portNumber, databaseName, serviceName, defaultSchema, usernameText, passwordText, sslEnabled } = body;
  if (!connectionName || !dbTypeCode || !hostAddress || !portNumber)
    return NextResponse.json({ error: "connectionName, dbTypeCode, hostAddress, portNumber are required" }, { status: 400 });
  const VALID = ["POSTGRES", "MYSQL", "MSSQL", "ORACLE"];
  if (!VALID.includes(dbTypeCode)) return NextResponse.json({ error: `dbTypeCode must be one of ${VALID.join(", ")}` }, { status: 400 });
  const id = await createConnection({ connectionName, dbTypeCode, hostAddress, portNumber: Number(portNumber), databaseName: databaseName || null, serviceName: serviceName || null, defaultSchema: defaultSchema || null, usernameText: usernameText || null, passwordText: passwordText || null, sslEnabled: !!sslEnabled });
  return NextResponse.json({ connectionId: id }, { status: 201 });
}
