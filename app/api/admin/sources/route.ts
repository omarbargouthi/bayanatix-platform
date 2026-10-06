import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listConnections, createConnection } from "@/lib/queries/sources";
import { cleanSourcePath } from "@/lib/source-path";

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
  const { connectionName, dbTypeCode, portNumber, databaseName, serviceName, defaultSchema, usernameText, passwordText, sslEnabled } = body;
  const hostAddress = typeof body.hostAddress === "string" ? cleanSourcePath(body.hostAddress) : body.hostAddress;
  const VALID = ["POSTGRES", "MYSQL", "MSSQL", "ORACLE", "CSV", "EXCEL", "JSON", "REST_API", "SOAP_API"];
  if (!VALID.includes(dbTypeCode)) return NextResponse.json({ error: `dbTypeCode must be one of ${VALID.join(", ")}` }, { status: 400 });
  // File sources (CSV/EXCEL/JSON) store their path in hostAddress and have no real port,
  // username, or database — those fields stay null for them. Spec sources (REST_API/
  // SOAP_API) store the spec's file path or URL in hostAddress the same way, but DO
  // accept an optional username/password — sent as HTTP Basic Auth when the spec is
  // fetched from a URL behind auth.
  const isFileType = dbTypeCode === "CSV" || dbTypeCode === "EXCEL" || dbTypeCode === "JSON";
  const isSpecType = dbTypeCode === "REST_API" || dbTypeCode === "SOAP_API";
  const noPortNeeded = isFileType || isSpecType;
  if (!connectionName || !hostAddress || (!noPortNeeded && !portNumber))
    return NextResponse.json({ error: noPortNeeded ? "connectionName and hostAddress (path/URL) are required" : "connectionName, dbTypeCode, hostAddress, portNumber are required" }, { status: 400 });
  const id = await createConnection({
    connectionName, dbTypeCode, hostAddress, portNumber: noPortNeeded ? 0 : Number(portNumber),
    databaseName: noPortNeeded ? null : (databaseName || null),
    serviceName: noPortNeeded ? null : (serviceName || null),
    defaultSchema: noPortNeeded ? null : (defaultSchema || null),
    usernameText: isFileType ? null : (usernameText || null),
    passwordText: isFileType ? null : (passwordText || null),
    sslEnabled: isFileType ? false : !!sslEnabled,
  });
  return NextResponse.json({ connectionId: id }, { status: 201 });
}
