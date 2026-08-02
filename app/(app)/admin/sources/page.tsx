"use client";

import { useEffect, useRef, useState } from "react";

type Conn = {
  connectionId: number; connectionName: string; dbTypeCode: string;
  hostAddress: string; portNumber: number; databaseName: string | null;
  serviceName: string | null; defaultSchema: string | null;
  usernameText: string | null; sslEnabled: boolean; isActiveBoolean: boolean;
  connectionStatus: string; lastTestedAt: string | null;
  crawlStatus: string; crawlErrorText: string | null;
  crawledSchemaCount: number; crawledTableCount: number; crawledColumnCount: number;
  lastDiscoveryTimestamp: string | null; createdAtTimestamp: string;
  lineageEnabled: boolean; lineageScanViews: boolean; lineageScanMatviews: boolean;
  lineageScanProcedures: boolean; lineageScanFunctions: boolean;
};

type CrawlJob = {
  jobId: number; connectionName: string; startedAt: string; finishedAt: string | null;
  status: string; schemaCount: number; tableCount: number; columnCount: number; errorText: string | null;
};

type CrawlJobLog = { logId: number; loggedAt: string; level: string; message: string };

type CrawlCfg = {
  schemaIncludeList: string[] | null; schemaExcludeList: string[];
  tableExcludePatterns: string[]; profilingEnabled: boolean;
  profilingMode: string; profilingLimit: number;
  defaultOwnerUserId:   string | null;
  defaultBizStewardId:  string | null;
  defaultTechStewardId: string | null;
};

type UserOption = { userId: string; fullName: string | null; email: string };

const DB_TYPES = [
  { value: "POSTGRES", label: "PostgreSQL", port: 5432 },
  { value: "MYSQL",    label: "MySQL",      port: 3306 },
  { value: "MSSQL",    label: "SQL Server", port: 1433 },
  { value: "ORACLE",   label: "Oracle DB",  port: 1521 },
  { value: "CSV",      label: "CSV File(s)",          port: 0 },
  { value: "EXCEL",    label: "Excel Workbook(s)",    port: 0 },
];

const DB_ICON: Record<string, string> = {
  POSTGRES: "🐘", MYSQL: "🐬", MSSQL: "🪟", ORACLE: "🔶", CSV: "📄", EXCEL: "📊",
};

// CSV/EXCEL are flat-file sources: no network host/port/credentials, just a
// file or directory path (stored in hostAddress — repurposed for this case).
const FILE_TYPES = ["CSV", "EXCEL"];
const isFileType = (dbTypeCode: string) => FILE_TYPES.includes(dbTypeCode);

// Database types the crawler can actually connect to (ORACLE has no working driver yet).
const LINEAGE_APPLICABLE_TYPES = ["POSTGRES", "MYSQL", "MSSQL"];
// Database types the lineage scan *engine* currently supports end-to-end (AST parsing
// via libpg-query + pg_get_viewdef/pg_get_functiondef are Postgres-specific). MySQL/SQL
// Server show the configuration section as a placeholder for a future scanner.
const LINEAGE_SCANNER_IMPLEMENTED = ["POSTGRES"];

type LineageCfg = {
  lineageEnabled: boolean; lineageScanViews: boolean; lineageScanMatviews: boolean;
  lineageScanProcedures: boolean; lineageScanFunctions: boolean;
};
const BLANK_LINEAGE_CFG: LineageCfg = {
  lineageEnabled: false, lineageScanViews: true, lineageScanMatviews: true,
  lineageScanProcedures: true, lineageScanFunctions: true,
};

type ClassificationCfg = {
  auto_classify_columns: boolean;
  classify_scope: "NEW_ONLY" | "UNCLASSIFIED_ONLY" | "ALL";
  harvest_fk_constraints: boolean;
  infer_fk_by_naming: boolean;
  auto_accept_band: "NONE" | "HIGH";
};
const BLANK_CLASSIFICATION_CFG: ClassificationCfg = {
  auto_classify_columns: true, classify_scope: "NEW_ONLY",
  harvest_fk_constraints: true, infer_fk_by_naming: true, auto_accept_band: "NONE",
};

const STATUS_DOT: Record<string, string> = {
  OK:        "bg-green-500",
  FAILED:    "bg-red-500",
  TESTING:   "bg-yellow-400 animate-pulse",
  UNCHECKED: "bg-gray-300",
};

const CRAWL_DOT: Record<string, string> = {
  COMPLETED: "bg-green-500",
  FAILED:    "bg-red-500",
  CRAWLING:  "bg-brand-purple animate-pulse",
  IDLE:      "bg-gray-300",
};

const BLANK_FORM = { connectionName: "", dbTypeCode: "POSTGRES", hostAddress: "localhost", portNumber: 5432, databaseName: "", serviceName: "", defaultSchema: "", usernameText: "", passwordText: "", sslEnabled: false };

const BLANK_CFG: CrawlCfg = {
  schemaIncludeList: null, schemaExcludeList: [], tableExcludePatterns: [],
  profilingEnabled: false, profilingMode: "TOP_N", profilingLimit: 1000,
  defaultOwnerUserId: null, defaultBizStewardId: null, defaultTechStewardId: null,
};

function arr2str(a: string[] | null | undefined) { return (a ?? []).join(", "); }
function str2arr(s: string) { return s.split(",").map(x => x.trim()).filter(Boolean); }

export default function DataSourcesPage() {
  const [connections, setConnections] = useState<Conn[]>([]);
  const [selected, setSelected]   = useState<Conn | null>(null);
  const [isAdding, setIsAdding]   = useState(false);
  const [form, setForm]           = useState({ ...BLANK_FORM });
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [crawling, setCrawling]   = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showPwd, setShowPwd]     = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Crawl config state
  const [crawlCfg, setCrawlCfg]       = useState<CrawlCfg>({ ...BLANK_CFG });
  const [cfgSaving, setCfgSaving]     = useState(false);
  const [cfgSaved, setCfgSaved]       = useState(false);
  const [cfgIncludes, setCfgIncludes] = useState("");
  const [cfgExcludes, setCfgExcludes] = useState("");
  const [cfgPatterns, setCfgPatterns] = useState("");

  // Lineage scan config state
  const [lineageCfg, setLineageCfg]     = useState<LineageCfg>({ ...BLANK_LINEAGE_CFG });
  const [lineageSaving, setLineageSaving] = useState(false);
  const [lineageSaved, setLineageSaved] = useState(false);
  const [scanning, setScanning]         = useState(false);
  const [scanResult, setScanResult]     = useState<{ ok: boolean; message: string } | null>(null);

  // Column classification (Business/Technical suggestion engine) settings state
  const [classCfg, setClassCfg]         = useState<ClassificationCfg>({ ...BLANK_CLASSIFICATION_CFG });
  const [classCfgSaving, setClassCfgSaving] = useState(false);
  const [classCfgSaved, setClassCfgSaved]   = useState(false);

  // Governance default user picker state (per field)
  const [govSearch, setGovSearch]     = useState<Record<string, string>>({});
  const [govResults, setGovResults]   = useState<Record<string, UserOption[]>>({});

  // Job history state
  const [jobs, setJobs]               = useState<CrawlJob[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [jobLogs, setJobLogs]         = useState<Map<number, CrawlJobLog[]>>(new Map());

  async function load() {
    const r = await fetch("/api/admin/sources");
    if (r.ok) setConnections(await r.json());
  }

  async function searchGovUsers(field: string, q: string) {
    setGovSearch((p) => ({ ...p, [field]: q }));
    if (!q.trim()) { setGovResults((p) => ({ ...p, [field]: [] })); return; }
    const r = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
    if (r.ok) { const data = await r.json(); setGovResults((p) => ({ ...p, [field]: data })); }
  }

  function setGovUser(field: keyof CrawlCfg, userId: string | null, displayName: string) {
    setCrawlCfg((c) => ({ ...c, [field]: userId }));
    setGovSearch((p) => ({ ...p, [field]: displayName }));
    setGovResults((p) => ({ ...p, [field]: [] }));
  }

  async function loadCrawlConfig(id: number) {
    const r = await fetch(`/api/admin/sources/${id}/config`);
    if (!r.ok) return;
    const cfg: CrawlCfg = await r.json();
    setCrawlCfg(cfg);
    setCfgIncludes(arr2str(cfg.schemaIncludeList));
    setCfgExcludes(arr2str(cfg.schemaExcludeList));
    setCfgPatterns(arr2str(cfg.tableExcludePatterns));
    // Resolve display names for governance defaults
    const govFields: { field: string; userId: string | null }[] = [
      { field: "defaultOwnerUserId",   userId: cfg.defaultOwnerUserId },
      { field: "defaultBizStewardId",  userId: cfg.defaultBizStewardId },
      { field: "defaultTechStewardId", userId: cfg.defaultTechStewardId },
    ];
    const labels: Record<string, string> = {};
    for (const { field, userId } of govFields) {
      if (userId) {
        const u = await fetch(`/api/users/search?q=${encodeURIComponent(userId)}`);
        if (u.ok) {
          const users: UserOption[] = await u.json();
          const match = users.find((x) => x.userId === userId);
          if (match) labels[field] = match.fullName ?? match.email;
        }
      }
    }
    setGovSearch(labels);
  }

  async function loadClassificationConfig(id: number) {
    const r = await fetch(`/api/admin/sources/${id}/classification-settings`);
    if (!r.ok) return;
    const cfg = await r.json();
    setClassCfg({ ...BLANK_CLASSIFICATION_CFG, ...cfg });
  }

  async function loadJobs(id: number) {
    const r = await fetch(`/api/admin/crawl-jobs?connectionId=${id}`);
    if (r.ok) setJobs(await r.json());
  }

  async function toggleJobLogs(jobId: number) {
    if (expandedJobId === jobId) { setExpandedJobId(null); return; }
    setExpandedJobId(jobId);
    if (!jobLogs.has(jobId)) {
      const r = await fetch(`/api/admin/crawl-jobs/${jobId}/logs`);
      const data: CrawlJobLog[] = await r.json();
      setJobLogs(prev => new Map(prev).set(jobId, data));
    }
  }

  async function handleSaveConfig() {
    if (!selected) return;
    setCfgSaving(true);
    try {
      await fetch(`/api/admin/sources/${selected.connectionId}/config`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaIncludeList:    str2arr(cfgIncludes).length ? str2arr(cfgIncludes) : null,
          schemaExcludeList:    str2arr(cfgExcludes),
          tableExcludePatterns: str2arr(cfgPatterns),
          profilingEnabled:     crawlCfg.profilingEnabled,
          profilingMode:        crawlCfg.profilingMode,
          profilingLimit:       crawlCfg.profilingLimit,
          defaultOwnerUserId:   crawlCfg.defaultOwnerUserId,
          defaultBizStewardId:  crawlCfg.defaultBizStewardId,
          defaultTechStewardId: crawlCfg.defaultTechStewardId,
        }),
      });
      setCfgSaved(true);
      setTimeout(() => setCfgSaved(false), 2000);
    } finally { setCfgSaving(false); }
  }

  useEffect(() => { load(); }, []);

  // Load crawl config + job history when a connection is selected
  useEffect(() => {
    if (selected?.connectionId) {
      loadCrawlConfig(selected.connectionId);
      loadClassificationConfig(selected.connectionId);
      loadJobs(selected.connectionId);
      setJobLogs(new Map());
      setExpandedJobId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.connectionId]);

  // Sync lineage config form from the selected connection (only when switching connections,
  // not on every poll refresh of `selected`, so in-progress edits aren't clobbered).
  useEffect(() => {
    if (selected) {
      setLineageCfg({
        lineageEnabled: selected.lineageEnabled,
        lineageScanViews: selected.lineageScanViews,
        lineageScanMatviews: selected.lineageScanMatviews,
        lineageScanProcedures: selected.lineageScanProcedures,
        lineageScanFunctions: selected.lineageScanFunctions,
      });
      setScanResult(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.connectionId]);

  // Poll selected connection while crawling
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!selected || selected.crawlStatus !== "CRAWLING") { setCrawling(false); return; }
    setCrawling(true);
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/admin/sources/${selected.connectionId}`);
      if (!r.ok) return;
      const fresh: Conn = await r.json();
      setConnections(prev => prev.map(c => c.connectionId === fresh.connectionId ? fresh : c));
      setSelected(fresh);
      if (fresh.crawlStatus !== "CRAWLING") {
        clearInterval(pollRef.current!);
        setCrawling(false);
        loadJobs(fresh.connectionId);
      }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selected?.connectionId, selected?.crawlStatus]);

  function selectConn(c: Conn) {
    setSelected(c); setIsAdding(false); setTestResult(null); setDeleteConfirm(false); setShowPwd(false);
    setForm({ connectionName: c.connectionName, dbTypeCode: c.dbTypeCode, hostAddress: c.hostAddress, portNumber: c.portNumber, databaseName: c.databaseName || "", serviceName: c.serviceName || "", defaultSchema: c.defaultSchema || "", usernameText: c.usernameText || "", passwordText: "", sslEnabled: c.sslEnabled });
  }

  function startAdd() {
    setSelected(null); setIsAdding(true); setTestResult(null); setDeleteConfirm(false); setShowPwd(false);
    setForm({ ...BLANK_FORM });
  }

  function setDbType(type: string) {
    const found = DB_TYPES.find(t => t.value === type);
    setForm(f => ({ ...f, dbTypeCode: type, portNumber: found?.port ?? f.portNumber }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (isAdding) {
        const r = await fetch("/api/admin/sources", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, portNumber: Number(form.portNumber) }),
        });
        if (!r.ok) { const e = await r.json(); alert(e.error); return; }
        await load();
        const data = await r.json();
        setIsAdding(false);
        const fresh = await (await fetch(`/api/admin/sources/${data.connectionId}`)).json();
        setSelected(fresh);
        setConnections(prev => [...prev, fresh]);
      } else if (selected) {
        const body: Record<string, unknown> = { ...form, portNumber: Number(form.portNumber) };
        if (!form.passwordText) delete body.passwordText;
        const r = await fetch(`/api/admin/sources/${selected.connectionId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (!r.ok) { const e = await r.json(); alert(e.error); return; }
        const fresh = await (await fetch(`/api/admin/sources/${selected.connectionId}`)).json();
        setSelected(fresh);
        setConnections(prev => prev.map(c => c.connectionId === fresh.connectionId ? fresh : c));
        setTestResult(null);
      }
    } finally { setSaving(false); }
  }

  async function handleTest() {
    if (!selected) return;
    setTesting(true); setTestResult(null);
    try {
      // Save password if changed before test
      if (form.passwordText) {
        await fetch(`/api/admin/sources/${selected.connectionId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passwordText: form.passwordText }),
        });
      }
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 30000);
      let data: { ok: boolean; message: string };
      try {
        const r = await fetch(`/api/admin/sources/${selected.connectionId}/test`, { method: "POST", signal: ac.signal });
        data = await r.json();
      } catch {
        data = { ok: false, message: "Request timed out or connection refused" };
      } finally {
        clearTimeout(timer);
      }
      setTestResult(data);
      const fresh = await (await fetch(`/api/admin/sources/${selected.connectionId}`)).json();
      setSelected(fresh);
      setConnections(prev => prev.map(c => c.connectionId === fresh.connectionId ? fresh : c));
    } catch (e: unknown) {
      setTestResult({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function handleCrawl() {
    if (!selected) return;
    const r = await fetch(`/api/admin/sources/${selected.connectionId}/crawl`, { method: "POST" });
    if (!r.ok) { const e = await r.json(); alert(e.error); return; }
    const fresh = await (await fetch(`/api/admin/sources/${selected.connectionId}`)).json();
    setSelected(fresh);
    setConnections(prev => prev.map(c => c.connectionId === fresh.connectionId ? fresh : c));
  }

  async function handleSaveLineageCfg() {
    if (!selected) return;
    setLineageSaving(true);
    try {
      const r = await fetch(`/api/admin/sources/${selected.connectionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lineageCfg),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error); return; }
      const fresh = await (await fetch(`/api/admin/sources/${selected.connectionId}`)).json();
      setSelected(fresh);
      setConnections(prev => prev.map(c => c.connectionId === fresh.connectionId ? fresh : c));
      setLineageSaved(true);
      setTimeout(() => setLineageSaved(false), 2000);
    } finally { setLineageSaving(false); }
  }

  async function handleSaveClassificationCfg() {
    if (!selected) return;
    setClassCfgSaving(true);
    try {
      const r = await fetch(`/api/admin/sources/${selected.connectionId}/classification-settings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(classCfg),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error); return; }
      setClassCfgSaved(true);
      setTimeout(() => setClassCfgSaved(false), 2000);
    } finally { setClassCfgSaving(false); }
  }

  async function handleRunLineageScan() {
    if (!selected) return;
    setScanning(true); setScanResult(null);
    try {
      const r = await fetch("/api/lineage/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: selected.connectionId }),
      });
      const data = await r.json();
      setScanResult(r.ok
        ? { ok: true, message: `Scan started (run #${data.scanRunId}). View results in the Data Lineage graph or catalog table pages.` }
        : { ok: false, message: data.error || "Scan failed" });
    } catch (e) {
      setScanResult({ ok: false, message: (e as Error).message });
    } finally { setScanning(false); }
  }

  async function handleDelete() {
    if (!selected || !deleteConfirm) return;
    await fetch(`/api/admin/sources/${selected.connectionId}`, { method: "DELETE" });
    setConnections(prev => prev.filter(c => c.connectionId !== selected.connectionId));
    setSelected(null); setDeleteConfirm(false);
  }

  const isEditing = !!selected && !isAdding;

  return (
    <div className="flex h-[calc(100vh-120px)] overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r border-line bg-canvas flex flex-col">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">Data Sources</span>
          <button onClick={startAdd} className="text-[11px] font-semibold text-brand-purple hover:underline">+ Add</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {connections.length === 0 && (
            <div className="p-6 text-center text-muted text-xs">No data sources yet</div>
          )}
          {connections.map(c => (
            <button
              key={c.connectionId}
              onClick={() => selectConn(c)}
              className={`w-full text-left px-4 py-3 border-b border-line hover:bg-white transition-colors ${selected?.connectionId === c.connectionId ? "bg-white border-l-2 border-l-brand-purple" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{DB_ICON[c.dbTypeCode] ?? "🗄"}</span>
                <span className="text-[13px] font-medium text-ink truncate flex-1">{c.connectionName}</span>
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[c.connectionStatus] ?? "bg-gray-300"}`} title={`Connection: ${c.connectionStatus}`} />
              </div>
              <div className="mt-1 pl-6 flex items-center gap-2">
                <span className="text-[10px] text-muted truncate">{isFileType(c.dbTypeCode) ? c.hostAddress : `${c.hostAddress}/${c.databaseName || "—"}`}</span>
                {c.crawlStatus !== "IDLE" && (
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CRAWL_DOT[c.crawlStatus] ?? "bg-gray-300"}`} title={`Crawl: ${c.crawlStatus}`} />
                )}
              </div>
              {c.crawledTableCount > 0 && (
                <div className="pl-6 mt-0.5 text-[10px] text-muted">{c.crawledTableCount} tables · {c.crawledColumnCount} cols</div>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* ── Main Panel ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-8">
        {!selected && !isAdding && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="text-6xl">🗄</div>
            <h2 className="text-xl font-semibold text-ink">Onboard a Data Source</h2>
            <p className="text-muted text-sm max-w-md">Connect to PostgreSQL, MySQL, SQL Server, or Oracle databases — or point at a CSV/Excel file or folder. Test the connection, then crawl to discover schemas, tables, and columns automatically.</p>
            <button onClick={startAdd} className="mt-2 px-5 py-2.5 bg-brand-purple text-white text-sm font-semibold rounded-lg hover:bg-brand-deep transition-colors">
              + Add Data Source
            </button>
          </div>
        )}

        {(isAdding || isEditing) && (
          <div className="max-w-2xl">
            <h2 className="text-lg font-bold text-ink mb-6">{isAdding ? "New Data Source Connection" : `Edit – ${selected?.connectionName}`}</h2>

            {/* Connection Form */}
            <div className="bg-white border border-line rounded-xl p-6 space-y-5">
              <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Connection Details</h3>

              {/* autoComplete="off" on the wrapping form stops Chrome from autofilling DB credentials with app login */}
              <form autoComplete="off" onSubmit={e => e.preventDefault()}>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-ink mb-1">Connection Name *</label>
                  <input className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple" value={form.connectionName} onChange={e => setForm(f => ({ ...f, connectionName: e.target.value }))} placeholder="e.g. CRMDB – Production" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Database Type *</label>
                  <select className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple bg-white" value={form.dbTypeCode} onChange={e => setDbType(e.target.value)}>
                    {DB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                {isFileType(form.dbTypeCode) ? (
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-ink mb-1">File or Directory Path *</label>
                    <input className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple font-mono" value={form.hostAddress} onChange={e => setForm(f => ({ ...f, hostAddress: e.target.value }))} placeholder={form.dbTypeCode === "CSV" ? "C:\\data\\sales.csv or C:\\data\\csv-exports" : "C:\\data\\report.xlsx or C:\\data\\workbooks"} />
                    <p className="text-[11px] text-muted mt-1">
                      A single file is crawled as one table{form.dbTypeCode === "EXCEL" ? " per sheet" : ""}. A directory is crawled as one schema — every {form.dbTypeCode === "CSV" ? ".csv file" : ".xlsx/.xls workbook"} inside becomes its own table{form.dbTypeCode === "EXCEL" ? "(s)" : ""}. Server-side path — must be reachable by the app process.
                    </p>
                  </div>
                ) : (
                <>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Port *</label>
                  <input type="number" className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple" value={form.portNumber} onChange={e => setForm(f => ({ ...f, portNumber: Number(e.target.value) }))} />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-ink mb-1">Host Address *</label>
                  <input className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple" value={form.hostAddress} onChange={e => setForm(f => ({ ...f, hostAddress: e.target.value }))} placeholder="localhost or 192.168.1.100" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">{form.dbTypeCode === "ORACLE" ? "SID / Service Name" : "Database Name"}</label>
                  <input className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple" value={form.databaseName} onChange={e => setForm(f => ({ ...f, databaseName: e.target.value }))} placeholder={form.dbTypeCode === "ORACLE" ? "XE" : "mydb"} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Default Schema <span className="text-muted font-normal">(filter crawl)</span></label>
                  <input className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple" value={form.defaultSchema} onChange={e => setForm(f => ({ ...f, defaultSchema: e.target.value }))} placeholder="e.g. crm or dbo" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Username</label>
                  <input autoComplete="off" className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple" value={form.usernameText} onChange={e => setForm(f => ({ ...f, usernameText: e.target.value }))} placeholder="postgres" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Password {isEditing && <span className="text-muted font-normal">(leave blank to keep)</span>}</label>
                  <div className="relative">
                    <input type={showPwd ? "text" : "password"} autoComplete="new-password" className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple pr-10" value={form.passwordText} onChange={e => setForm(f => ({ ...f, passwordText: e.target.value }))} placeholder={isEditing ? "unchanged" : "••••••••"} />
                    <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-2.5 text-muted hover:text-ink text-xs">{showPwd ? "Hide" : "Show"}</button>
                  </div>
                </div>

                <div className="col-span-2 flex items-center gap-3">
                  <button type="button" onClick={() => setForm(f => ({ ...f, sslEnabled: !f.sslEnabled }))} className={`relative w-10 h-5 rounded-full transition-colors ${form.sslEnabled ? "bg-brand-purple" : "bg-gray-300"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.sslEnabled ? "left-5" : "left-0.5"}`} />
                  </button>
                  <label className="text-sm text-ink">Enable SSL / TLS</label>
                </div>
                </>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-brand-purple text-white text-sm font-semibold rounded-lg hover:bg-brand-deep disabled:opacity-50 transition-colors">
                  {saving ? "Saving…" : isAdding ? "Add Connection" : "Save Changes"}
                </button>
                {isAdding && (
                  <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-sm text-muted hover:text-ink border border-line rounded-lg transition-colors">Cancel</button>
                )}
              </div>
              </form>
            </div>

            {/* Actions panel — only for saved connections */}
            {isEditing && selected && (
              <div className="mt-6 space-y-4">

                {/* ── Crawl Settings ── */}
                <div className="bg-white border border-line rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-ink mb-1">Crawl Settings</h3>
                  <p className="text-xs text-muted mb-5">Control which schemas and tables are discovered, and optionally capture column profiling statistics.</p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-ink mb-1">Include Schemas <span className="text-muted font-normal">(comma-separated, blank = all)</span></label>
                        <input className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple font-mono" value={cfgIncludes} onChange={e => setCfgIncludes(e.target.value)} placeholder="crm, finance, hr" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-ink mb-1">Exclude Schemas <span className="text-muted font-normal">(comma-separated)</span></label>
                        <input className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple font-mono" value={cfgExcludes} onChange={e => setCfgExcludes(e.target.value)} placeholder="staging, test" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1">Exclude Table Patterns <span className="text-muted font-normal">(LIKE patterns, comma-separated)</span></label>
                      <input className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-purple font-mono" value={cfgPatterns} onChange={e => setCfgPatterns(e.target.value)} placeholder="tmp_%, _bak, %_archive" />
                    </div>
                    <div className="border-t border-line pt-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setCrawlCfg(c => ({ ...c, profilingEnabled: !c.profilingEnabled }))}
                          className={`relative w-10 h-5 rounded-full transition-colors ${crawlCfg.profilingEnabled ? "bg-brand-purple" : "bg-gray-300"}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${crawlCfg.profilingEnabled ? "left-5" : "left-0.5"}`} />
                        </button>
                        <label className="text-sm text-ink font-medium">Enable Column Profiling</label>
                        <span className="text-xs text-muted">(null%, distinct count, min/max, top values)</span>
                      </div>
                      {crawlCfg.profilingEnabled && (
                        <div className="grid grid-cols-2 gap-4 pl-13">
                          <div>
                            <label className="block text-xs font-semibold text-ink mb-1">Profiling Mode</label>
                            <select className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-purple"
                              value={crawlCfg.profilingMode} onChange={e => setCrawlCfg(c => ({ ...c, profilingMode: e.target.value }))}>
                              <option value="TOP_N">Top N rows</option>
                              <option value="TOP_PCT">Top N% (TABLESAMPLE)</option>
                              <option value="FULL">Full table scan</option>
                            </select>
                          </div>
                          {crawlCfg.profilingMode !== "FULL" && (
                            <div>
                              <label className="block text-xs font-semibold text-ink mb-1">
                                {crawlCfg.profilingMode === "TOP_N" ? "Row Limit" : "Sample %"}
                              </label>
                              <input type="number" min={1} max={crawlCfg.profilingMode === "TOP_PCT" ? 100 : undefined}
                                className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-purple"
                                value={crawlCfg.profilingLimit} onChange={e => setCrawlCfg(c => ({ ...c, profilingLimit: Number(e.target.value) }))} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Default Governance */}
                    <div className="border-t border-line pt-4 space-y-3">
                      <div>
                        <div className="text-xs font-semibold text-ink mb-0.5">Default Governance Roles</div>
                        <p className="text-[11px] text-muted mb-3">Assigned automatically to every table discovered during crawl. Leave blank to skip.</p>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: "Default Owner",            field: "defaultOwnerUserId"   as keyof CrawlCfg },
                            { label: "Default Business Steward",  field: "defaultBizStewardId"  as keyof CrawlCfg },
                            { label: "Default Technical Steward", field: "defaultTechStewardId" as keyof CrawlCfg },
                          ].map(({ label, field }) => (
                            <div key={field} className="relative">
                              <label className="block text-[11px] font-semibold text-ink mb-1">{label}</label>
                              <div className="flex items-center gap-1">
                                <input
                                  className="flex-1 border border-line rounded-lg px-3 py-1.5 text-[13px] text-ink focus:outline-none focus:border-brand-purple min-w-0"
                                  placeholder="Search user…"
                                  value={govSearch[field] ?? ""}
                                  onChange={(e) => searchGovUsers(field, e.target.value)}
                                />
                                {crawlCfg[field] && (
                                  <button
                                    onClick={() => setGovUser(field, null, "")}
                                    className="shrink-0 w-6 h-6 rounded-full bg-gray-100 hover:bg-red-100 text-muted hover:text-red-600 flex items-center justify-center text-[11px] transition-colors"
                                    title="Clear"
                                  >✕</button>
                                )}
                              </div>
                              {(govResults[field] ?? []).length > 0 && (
                                <div className="absolute z-50 left-0 right-8 top-full mt-1 bg-white border border-line rounded-xl shadow-xl overflow-hidden">
                                  {(govResults[field] ?? []).map((u) => (
                                    <button
                                      key={u.userId}
                                      onMouseDown={() => setGovUser(field, u.userId, u.fullName ?? u.email)}
                                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-canvas-soft text-left border-b border-line-soft last:border-b-0"
                                    >
                                      <div className="w-6 h-6 rounded-full bg-brand-purple/10 text-brand-purple text-[10px] font-bold flex items-center justify-center shrink-0">
                                        {((u.fullName ?? u.userId).slice(0, 1)).toUpperCase()}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-[12px] font-medium text-ink truncate">{u.fullName ?? u.userId}</div>
                                        <div className="text-[10px] text-muted truncate">{u.email}</div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <button onClick={handleSaveConfig} disabled={cfgSaving} className="btn btn-primary btn-sm">
                        {cfgSaving ? "Saving…" : "Save Crawl Settings"}
                      </button>
                      {cfgSaved && <span className="text-xs text-green-700 font-semibold">✓ Saved</span>}
                    </div>
                  </div>
                </div>

                {/* Data Lineage */}
                {LINEAGE_APPLICABLE_TYPES.includes(selected.dbTypeCode) && (
                  <div className="bg-white border border-line rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-ink mb-1">Data Lineage</h3>
                    <p className="text-xs text-muted mb-5">
                      Scan views, materialized views, procedures, and functions to automatically discover column-level data lineage for this source.
                    </p>

                    {!LINEAGE_SCANNER_IMPLEMENTED.includes(selected.dbTypeCode) && (
                      <div className="mb-4 rounded-lg px-4 py-2.5 text-xs bg-amber-50 text-amber-800 border border-amber-200">
                        Lineage scanning for {DB_TYPES.find(t => t.value === selected.dbTypeCode)?.label ?? selected.dbTypeCode} is not implemented yet — the scanner currently supports PostgreSQL only. This section is shown as a preview of the upcoming capability.
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <button type="button"
                          disabled={!LINEAGE_SCANNER_IMPLEMENTED.includes(selected.dbTypeCode)}
                          onClick={() => setLineageCfg(c => ({ ...c, lineageEnabled: !c.lineageEnabled }))}
                          className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-40 ${lineageCfg.lineageEnabled ? "bg-brand-purple" : "bg-gray-300"}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${lineageCfg.lineageEnabled ? "left-5" : "left-0.5"}`} />
                        </button>
                        <label className="text-sm text-ink font-medium">Enable Lineage Scanning</label>
                      </div>

                      {lineageCfg.lineageEnabled && (
                        <div className="pl-13 space-y-2">
                          <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Object Types to Scan</div>
                          <div className="grid grid-cols-2 gap-2">
                            {([
                              { label: "Views",               field: "lineageScanViews"      as keyof LineageCfg },
                              { label: "Materialized Views",   field: "lineageScanMatviews"   as keyof LineageCfg },
                              { label: "Procedures",           field: "lineageScanProcedures" as keyof LineageCfg },
                              { label: "Functions",            field: "lineageScanFunctions"  as keyof LineageCfg },
                            ]).map(({ label, field }) => (
                              <label key={field} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                                <input type="checkbox" className="w-4 h-4 accent-brand-purple"
                                  checked={lineageCfg[field]}
                                  onChange={e => setLineageCfg(c => ({ ...c, [field]: e.target.checked }))} />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3 pt-1">
                        <button onClick={handleSaveLineageCfg} disabled={lineageSaving} className="btn btn-primary btn-sm">
                          {lineageSaving ? "Saving…" : "Save Lineage Settings"}
                        </button>
                        {lineageSaved && <span className="text-xs text-green-700 font-semibold">✓ Saved</span>}
                        {lineageCfg.lineageEnabled && LINEAGE_SCANNER_IMPLEMENTED.includes(selected.dbTypeCode) && (
                          <button onClick={handleRunLineageScan} disabled={scanning || selected.crawledTableCount === 0}
                            title={selected.crawledTableCount === 0 ? "Crawl this source at least once first" : undefined}
                            className="px-4 py-2 text-sm font-semibold border border-brand-purple text-brand-purple rounded-lg hover:bg-brand-purple hover:text-white disabled:opacity-50 transition-colors flex items-center gap-2">
                            {scanning && <span className="w-3 h-3 border-2 border-brand-purple border-t-transparent rounded-full animate-spin" />}
                            {scanning ? "Scanning…" : "Run Lineage Scan"}
                          </button>
                        )}
                      </div>

                      {scanResult && (
                        <div className={`rounded-lg px-4 py-3 text-sm flex items-start gap-2 ${scanResult.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                          <span className="text-base">{scanResult.ok ? "✓" : "✗"}</span>
                          <span>{scanResult.message}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Column Classification */}
                <div className="bg-white border border-line rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-ink mb-1">Column Classification</h3>
                  <p className="text-xs text-muted mb-5">
                    Auto-suggest Business/Technical column types during crawl, based on table category, key role, naming patterns, and FK topology. Suggestions always require steward review unless auto-accept is enabled below.
                  </p>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <button type="button"
                        onClick={() => setClassCfg(c => ({ ...c, auto_classify_columns: !c.auto_classify_columns }))}
                        className={`relative w-10 h-5 rounded-full transition-colors ${classCfg.auto_classify_columns ? "bg-brand-purple" : "bg-gray-300"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${classCfg.auto_classify_columns ? "left-5" : "left-0.5"}`} />
                      </button>
                      <label className="text-sm text-ink font-medium">Auto-classify Columns on Crawl</label>
                    </div>

                    {classCfg.auto_classify_columns && (
                      <div className="pl-13 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-ink mb-1">Classification Scope</label>
                            <select className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-purple"
                              value={classCfg.classify_scope} onChange={e => setClassCfg(c => ({ ...c, classify_scope: e.target.value as ClassificationCfg["classify_scope"] }))}>
                              <option value="NEW_ONLY">New columns only</option>
                              <option value="UNCLASSIFIED_ONLY">Unclassified columns</option>
                              <option value="ALL">Re-evaluate all columns</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-ink mb-1">Auto-accept Band</label>
                            <select className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-purple"
                              value={classCfg.auto_accept_band} onChange={e => setClassCfg(c => ({ ...c, auto_accept_band: e.target.value as ClassificationCfg["auto_accept_band"] }))}>
                              <option value="NONE">Never auto-accept — always review</option>
                              <option value="HIGH">Auto-accept HIGH-confidence suggestions</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 accent-brand-purple"
                              checked={classCfg.harvest_fk_constraints}
                              onChange={e => setClassCfg(c => ({ ...c, harvest_fk_constraints: e.target.checked }))} />
                            Harvest declared FK constraints
                          </label>
                          <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 accent-brand-purple"
                              checked={classCfg.infer_fk_by_naming}
                              onChange={e => setClassCfg(c => ({ ...c, infer_fk_by_naming: e.target.checked }))} />
                            Infer FKs by column naming (fallback)
                          </label>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                      <button onClick={handleSaveClassificationCfg} disabled={classCfgSaving} className="btn btn-primary btn-sm">
                        {classCfgSaving ? "Saving…" : "Save Classification Settings"}
                      </button>
                      {classCfgSaved && <span className="text-xs text-green-700 font-semibold">✓ Saved</span>}
                    </div>
                  </div>
                </div>

                {/* Test Connection */}
                <div className="bg-white border border-line rounded-xl p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">Test Connection</h3>
                      <p className="text-xs text-muted mt-0.5">Verify connectivity and credentials before crawling</p>
                    </div>
                    <button onClick={handleTest} disabled={testing} className="px-4 py-2 text-sm font-semibold border border-brand-purple text-brand-purple rounded-lg hover:bg-brand-purple hover:text-white disabled:opacity-50 transition-colors flex items-center gap-2">
                      {testing && <span className="w-3 h-3 border-2 border-brand-purple border-t-transparent rounded-full animate-spin" />}
                      {testing ? "Testing…" : "Test Connection"}
                    </button>
                  </div>
                  {testResult && (
                    <div className={`rounded-lg px-4 py-3 text-sm flex items-start gap-2 ${testResult.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                      <span className="text-base">{testResult.ok ? "✓" : "✗"}</span>
                      <span>{testResult.message}</span>
                    </div>
                  )}
                  {!testResult && selected.connectionStatus !== "UNCHECKED" && (
                    <div className={`rounded-lg px-4 py-2 text-xs flex items-center gap-2 ${selected.connectionStatus === "OK" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                      <span className={`w-2 h-2 rounded-full ${STATUS_DOT[selected.connectionStatus]}`} />
                      Last test: {selected.connectionStatus} — {selected.lastTestedAt ? new Date(selected.lastTestedAt).toLocaleString() : "—"}
                    </div>
                  )}
                </div>

                {/* Crawl */}
                <div className="bg-white border border-line rounded-xl p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">Discover Assets (Crawl)</h3>
                      <p className="text-xs text-muted mt-0.5">Crawl schemas, tables, and columns. Results will appear in the Data Catalog.</p>
                    </div>
                    <button onClick={handleCrawl} disabled={crawling || selected.crawlStatus === "CRAWLING"} className="px-4 py-2 text-sm font-semibold bg-brand-purple text-white rounded-lg hover:bg-brand-deep disabled:opacity-50 transition-colors flex items-center gap-2">
                      {(crawling || selected.crawlStatus === "CRAWLING") && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                      {selected.crawlStatus === "CRAWLING" ? "Crawling…" : "Start Crawl"}
                    </button>
                  </div>

                  {selected.crawlStatus === "CRAWLING" && (
                    <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg border border-purple-100 text-sm text-brand-purple">
                      <span className="w-4 h-4 border-2 border-brand-purple border-t-transparent rounded-full animate-spin shrink-0" />
                      Discovering schemas, tables, and columns… this may take a moment.
                    </div>
                  )}

                  {selected.crawlStatus === "COMPLETED" && (
                    <div className="space-y-3">
                      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-green-700 font-semibold text-sm">✓ Crawl completed</span>
                          <span className="text-xs text-green-600">{selected.lastDiscoveryTimestamp ? new Date(selected.lastDiscoveryTimestamp).toLocaleString() : ""}</span>
                        </div>
                        <div className="flex gap-6 text-sm text-green-800">
                          <span><strong>{selected.crawledSchemaCount}</strong> schema{selected.crawledSchemaCount !== 1 ? "s" : ""}</span>
                          <span><strong>{selected.crawledTableCount}</strong> table{selected.crawledTableCount !== 1 ? "s" : ""}</span>
                          <span><strong>{selected.crawledColumnCount}</strong> column{selected.crawledColumnCount !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                      <a href="/catalog" className="inline-flex items-center gap-1 text-sm text-brand-purple font-medium hover:underline">
                        View in Data Catalog →
                      </a>
                    </div>
                  )}

                  {selected.crawlStatus === "FAILED" && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
                      <div className="font-semibold mb-1">✗ Crawl failed</div>
                      <div className="text-xs font-mono">{selected.crawlErrorText || "Unknown error"}</div>
                    </div>
                  )}

                  {selected.crawlStatus === "IDLE" && (
                    <p className="text-xs text-muted">Not crawled yet. Test the connection first, then start a crawl.</p>
                  )}
                </div>

                {/* Job History */}
                {jobs.length > 0 && (
                  <div className="bg-white border border-line rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-ink">Crawl Job History</h3>
                      <button onClick={() => selected && loadJobs(selected.connectionId)} className="text-xs text-muted hover:text-ink">Refresh</button>
                    </div>
                    <div className="space-y-2">
                      {jobs.map(job => {
                        const statusStyle: Record<string,string> = {
                          COMPLETED: "bg-green-100 text-green-800",
                          FAILED:    "bg-red-100 text-red-800",
                          RUNNING:   "bg-yellow-100 text-yellow-800",
                        };
                        const dur = job.finishedAt
                          ? (() => { const ms = new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime(); return ms < 60000 ? `${Math.round(ms/1000)}s` : `${Math.round(ms/60000)}m`; })()
                          : null;
                        return (
                          <div key={job.jobId} className="border border-line rounded-lg overflow-hidden">
                            <button className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-canvas-soft text-sm"
                              onClick={() => toggleJobLogs(job.jobId)}>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusStyle[job.status] ?? "bg-gray-100 text-gray-600"}`}>{job.status}</span>
                              <span className="text-muted text-xs">{new Date(job.startedAt).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
                              {dur && <span className="text-muted text-xs">({dur})</span>}
                              <span className="text-xs text-ink ml-auto">{job.tableCount} tables · {job.columnCount} cols</span>
                              <span className="text-muted text-xs">{expandedJobId === job.jobId ? "▲" : "▼"}</span>
                            </button>
                            {expandedJobId === job.jobId && (
                              <div className="bg-gray-950 px-4 py-3 font-mono text-[11px] max-h-48 overflow-y-auto">
                                {!jobLogs.has(job.jobId) && <div className="text-gray-400">Loading…</div>}
                                {(jobLogs.get(job.jobId) ?? []).map(log => (
                                  <div key={log.logId} className={`flex gap-3 py-0.5 ${log.level==="ERROR"?"text-red-400":log.level==="WARN"?"text-yellow-300":"text-green-300"}`}>
                                    <span className="text-gray-600 shrink-0">{new Date(log.loggedAt).toLocaleTimeString("en-GB")}</span>
                                    <span className={`shrink-0 ${log.level==="ERROR"?"text-red-400":log.level==="WARN"?"text-yellow-300":"text-blue-400"}`}>[{log.level}]</span>
                                    <span>{log.message}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Connection info summary */}
                <div className="bg-white border border-line rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-ink mb-4">Connection Summary</h3>
                  <div className="grid grid-cols-2 gap-y-3 text-sm">
                    {(isFileType(selected.dbTypeCode) ? [
                      ["Type", DB_TYPES.find(t => t.value === selected.dbTypeCode)?.label ?? selected.dbTypeCode],
                      ["Path", selected.hostAddress],
                      ["Added", new Date(selected.createdAtTimestamp).toLocaleDateString()],
                    ] : [
                      ["Type",     DB_TYPES.find(t => t.value === selected.dbTypeCode)?.label ?? selected.dbTypeCode],
                      ["Host",     selected.hostAddress],
                      ["Port",     String(selected.portNumber)],
                      ["Database", selected.databaseName || "—"],
                      ["Schema filter", selected.defaultSchema || "all schemas"],
                      ["Username", selected.usernameText || "—"],
                      ["SSL",      selected.sslEnabled ? "Enabled" : "Disabled"],
                      ["Added",    new Date(selected.createdAtTimestamp).toLocaleDateString()],
                    ]).map(([k, v]) => (
                      <div key={k}>
                        <div className="text-[10px] text-muted uppercase tracking-wide font-semibold">{k}</div>
                        <div className="text-ink text-[13px] font-mono">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Delete */}
                <div className="bg-white border border-red-200 rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-red-700 mb-1">Delete Connection</h3>
                  <p className="text-xs text-muted mb-4">Removes the connection and all discovered catalog data linked to it. This cannot be undone.</p>
                  {deleteConfirm ? (
                    <div className="flex items-center gap-3">
                      <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors">Yes, Delete</button>
                      <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 text-sm text-muted border border-line rounded-lg hover:text-ink transition-colors">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(true)} className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors">
                      Delete Connection
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
