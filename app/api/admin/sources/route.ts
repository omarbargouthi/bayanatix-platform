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
  const VALID = ["POSTGRES", "MYSQL", "MSSQL", "ORACLE", "CSV", "EXCEL"];
  if (!VALID.includes(dbTypeCode)) return NextResponse.json({ error: `dbTypeCode must be one of ${VALID.join(", ")}` }, { status: 400 });
  // File sources (CSV/EXCEL) store their path in hostAddress and have no real port,
  // username, or database — those fields stay null for them.
  const isFileType = dbTypeCode === "CSV" || dbTypeCode === "EXCEL";
  if (!connectionName || !hostAddress || (!isFileType && !portNumber))
    return NextResponse.json({ error: isFileType ? "connectionName and hostAddress (file/directory path) are required" : "connectionName, dbTypeCode, hostAddress, portNumber are required" }, { status: 400 });
  const id = await createConnection({
    connectionName, dbTypeCode, hostAddress, portNumber: isFileType ? 0 : Number(portNumber),
    databaseName: isFileType ? null : (databaseName || null),
    serviceName: isFileType ? null : (serviceName || null),
    defaultSchema: isFileType ? null : (defaultSchema || null),
    usernameText: isFileType ? null : (usernameText || null),
    passwordText: isFileType ? null : (passwordText || null),
    sslEnabled: isFileType ? false : !!sslEnabled,
  });
  return NextResponse.json({ connectionId: id }, { status: 201 });
}
