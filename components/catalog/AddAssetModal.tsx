"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type AssetKind =
  | "DATA_SOURCE" | "SCHEMA" | "TABLE" | "COLUMN"
  | "GLOSSARY_DOMAIN" | "GLOSSARY_SUBDOMAIN" | "BUSINESS_TERM";

const KINDS: { kind: AssetKind; label: string; desc: string; icon: string }[] = [
  { kind: "DATA_SOURCE",       label: "Data Source",       desc: "A database / warehouse connection", icon: "🗄️" },
  { kind: "SCHEMA",            label: "Schema",            desc: "A schema inside a data source",     icon: "🗂️" },
  { kind: "TABLE",             label: "Table / View",      desc: "A table or view inside a schema",   icon: "📋" },
  { kind: "COLUMN",            label: "Column",            desc: "A column inside a table",           icon: "📌" },
  { kind: "GLOSSARY_DOMAIN",   label: "Glossary Domain",   desc: "Top-level glossary category",       icon: "📖" },
  { kind: "GLOSSARY_SUBDOMAIN",label: "Glossary Sub-domain","desc": "Sub-domain under a domain",      icon: "🔖" },
  { kind: "BUSINESS_TERM",     label: "Business Term",     desc: "A defined business concept",        icon: "🏷️" },
];

const SOURCE_TYPES = ["POSTGRESQL","MYSQL","MSSQL","ORACLE","SNOWFLAKE","BIGQUERY","SAP","DATABRICKS","OTHER"];
const TABLE_TYPES  = [
  { value:"",              label:"— None —" },
  { value:"TRANSACTIONAL", label:"Transactional" },
  { value:"MASTER",        label:"Master" },
  { value:"REFERENCE",     label:"Lookup / Reference" },
  { value:"SYSTEM",        label:"System / Setup" },
];
const CLASS_CODES = [
  { value:"",            label:"— None —" },
  { value:"PUBLIC",      label:"Public" },
  { value:"INTERNAL",    label:"Internal" },
  { value:"CONFIDENTIAL",label:"Confidential" },
  { value:"RESTRICTED",  label:"Restricted" },
  { value:"SECRET",      label:"Secret" },
  { value:"TOP_SECRET",  label:"Top Secret" },
];
const DATA_TYPES = ["VARCHAR","INTEGER","BIGINT","NUMERIC","BOOLEAN","DATE","TIMESTAMP","TEXT","UUID","JSONB","FLOAT","OTHER"];

interface RefData {
  sources:    { id: number; name: string }[];
  schemas:    { id: number; name: string; sourceId: number }[];
  entities:   { id: number; name: string; schemaId: number }[];
  domains:    { id: number; name: string; parentId: number | null }[];
}

function useRefData() {
  const [data, setData] = useState<RefData>({ sources: [], schemas: [], entities: [], domains: [] });
  useEffect(() => {
    (async () => {
      const [s, sch, e, d] = await Promise.all([
        fetch("/api/catalog/sources").then((r) => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/catalog/schemas").then((r)  => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/catalog/entities").then((r) => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/glossary/picker").then((r)  => r.ok ? r.json() : []).catch(() => []),
      ]);
      setData({
        sources:  (s ?? []).map((x: { dataSourceId: number; sourceName: string }) => ({ id: x.dataSourceId, name: x.sourceName })),
        schemas:  (sch ?? []).map((x: { schemaId: number; schemaName: string; dataSourceId: number }) => ({ id: x.schemaId, name: x.schemaName, sourceId: x.dataSourceId })),
        entities: (e ?? []).map((x: { entityId: number; entityName: string; schemaId: number }) => ({ id: x.entityId, name: x.entityName, schemaId: x.schemaId })),
        domains:  (d ?? []).map((x: { glossaryId: number; domainName: string }) => ({ id: x.glossaryId, name: x.domainName, parentId: null })),
      });
    })();
  }, []);
  return data;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

function Sel({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`input-field ${className ?? ""}`}>
      {children}
    </select>
  );
}

function Inp({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`input-field ${className ?? ""}`} />;
}

// ── Per-kind forms ────────────────────────────────────────────────────────────

function DataSourceForm({ onSubmit }: { onSubmit: (body: object) => Promise<void> }) {
  const [sourceName,    setSourceName]    = useState("");
  const [sourceType,    setSourceType]    = useState("POSTGRESQL");
  const [databaseName,  setDatabaseName]  = useState("");
  const [description,   setDescription]   = useState("");
  const [businessApp,   setBusinessApp]   = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ sourceName, sourceType, databaseName, description, businessAppName: businessApp }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Source Name" required><Inp value={sourceName} onChange={setSourceName} placeholder="e.g. Production Oracle" /></Field>
        <Field label="Source Type" required>
          <Sel value={sourceType} onChange={setSourceType}>{SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Sel>
        </Field>
      </div>
      <Field label="Database / Connection Name" required><Inp value={databaseName} onChange={setDatabaseName} placeholder="e.g. PRODDB" /></Field>
      <Field label="Business Application"><Inp value={businessApp} onChange={setBusinessApp} placeholder="e.g. Oracle ERP, Salesforce" /></Field>
      <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input-field resize-none" placeholder="Describe this data source…" /></Field>
      <button type="submit" className="btn btn-primary w-full">Create Data Source</button>
    </form>
  );
}

function SchemaForm({ refData, onSubmit }: { refData: RefData; onSubmit: (body: object) => Promise<void> }) {
  const [schemaName,   setSchemaName]   = useState("");
  const [dataSourceId, setDataSourceId] = useState("");
  const [description,  setDescription]  = useState("");
  const [ownerUserId,  setOwnerUserId]  = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ schemaName, dataSourceId: Number(dataSourceId), description, ownerUserId }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Schema Name" required><Inp value={schemaName} onChange={setSchemaName} placeholder="e.g. sales_dw" /></Field>
        <Field label="Data Source" required>
          <Sel value={dataSourceId} onChange={setDataSourceId}>
            <option value="">— Select source —</option>
            {refData.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Sel>
        </Field>
      </div>
      <Field label="Owner (User ID)"><Inp value={ownerUserId} onChange={setOwnerUserId} placeholder="Optional" /></Field>
      <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input-field resize-none" /></Field>
      <button type="submit" className="btn btn-primary w-full">Create Schema</button>
    </form>
  );
}

function TableForm({ refData, onSubmit }: { refData: RefData; onSubmit: (body: object) => Promise<void> }) {
  const [entityName,  setEntityName]  = useState("");
  const [schemaId,    setSchemaId]    = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [category,    setCategory]    = useState("");
  const [isView,      setIsView]      = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ entityName, schemaId: Number(schemaId), displayName, description, category: category || null, isView }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Table Name" required><Inp value={entityName} onChange={setEntityName} placeholder="e.g. CUSTOMER_MASTER" /></Field>
        <Field label="Schema" required>
          <Sel value={schemaId} onChange={setSchemaId}>
            <option value="">— Select schema —</option>
            {refData.schemas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Sel>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Friendly Name"><Inp value={displayName} onChange={setDisplayName} placeholder="e.g. Customer Master" /></Field>
        <Field label="Table Type"><Sel value={category} onChange={setCategory}>{TABLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Sel></Field>
      </div>
      <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input-field resize-none" /></Field>
      <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
        <input type="checkbox" checked={isView} onChange={(e) => setIsView(e.target.checked)} className="w-4 h-4 accent-brand-purple" />
        This is a View (not a physical table)
      </label>
      <button type="submit" className="btn btn-primary w-full">Create Table</button>
    </form>
  );
}

function ColumnForm({ refData, onSubmit }: { refData: RefData; onSubmit: (body: object) => Promise<void> }) {
  const [physicalName, setPhysicalName] = useState("");
  const [entityId,     setEntityId]     = useState("");
  const [dataType,     setDataType]     = useState("VARCHAR");
  const [friendlyName, setFriendlyName] = useState("");
  const [description,  setDescription]  = useState("");
  const [isPrimaryKey, setIsPrimaryKey] = useState(false);
  const [isNullable,   setIsNullable]   = useState(true);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ physicalName, entityId: Number(entityId), dataType, friendlyName, description, isPrimaryKey, isNullable }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Column Name" required><Inp value={physicalName} onChange={setPhysicalName} placeholder="e.g. customer_id" /></Field>
        <Field label="Table" required>
          <Sel value={entityId} onChange={setEntityId}>
            <option value="">— Select table —</option>
            {refData.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Sel>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Data Type" required>
          <Sel value={dataType} onChange={setDataType}>{DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Sel>
        </Field>
        <Field label="Friendly Name"><Inp value={friendlyName} onChange={setFriendlyName} placeholder="e.g. Customer ID" /></Field>
      </div>
      <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-field resize-none" /></Field>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={isPrimaryKey} onChange={(e) => setIsPrimaryKey(e.target.checked)} className="w-4 h-4 accent-brand-purple" /> Primary Key</label>
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={isNullable}   onChange={(e) => setIsNullable(e.target.checked)}   className="w-4 h-4 accent-brand-purple" /> Nullable</label>
      </div>
      <button type="submit" className="btn btn-primary w-full">Create Column</button>
    </form>
  );
}

function GlossaryDomainForm({ parentLabel, refData, onSubmit }: { parentLabel: string; refData: RefData; onSubmit: (body: object) => Promise<void> }) {
  const [termName,    setTermName]    = useState("");
  const [description, setDescription] = useState("");
  const [classCode,   setClassCode]   = useState("");
  const [parentId,    setParentId]    = useState("");
  const isSubdomain = parentLabel === "Sub-domain";
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ termName, description, classCode: classCode || null, parentGlossaryId: parentId ? Number(parentId) : null }); }} className="space-y-4">
      <Field label={`${parentLabel} Name`} required><Inp value={termName} onChange={setTermName} placeholder={isSubdomain ? "e.g. Revenue Recognition" : "e.g. Finance"} /></Field>
      {isSubdomain && (
        <Field label="Parent Domain" required>
          <Sel value={parentId} onChange={setParentId}>
            <option value="">— Select domain —</option>
            {refData.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Sel>
        </Field>
      )}
      <Field label="Classification"><Sel value={classCode} onChange={setClassCode}>{CLASS_CODES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Sel></Field>
      <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input-field resize-none" /></Field>
      <button type="submit" className="btn btn-primary w-full">Create {parentLabel}</button>
    </form>
  );
}

const PI_CATEGORIES = [
  { value: "DIRECT_ID",  label: "Direct Identifier" },
  { value: "CONTACT",    label: "Contact Information" },
  { value: "FINANCIAL",  label: "Financial Data" },
  { value: "BIOMETRIC",  label: "Biometric Data" },
  { value: "PERSONAL",   label: "Personal Information" },
  { value: "HEALTH",     label: "Health Information" },
];

function BusinessTermForm({ refData, onSubmit }: { refData: RefData; onSubmit: (body: object) => Promise<void> }) {
  const [termName,      setTermName]      = useState("");
  const [parentId,      setParentId]      = useState("");
  const [definition,    setDefinition]    = useState("");
  const [termType,      setTermType]      = useState("TERM");
  const [classCode,     setClassCode]     = useState("");
  const [isPii,         setIsPii]         = useState(false);
  const [piCategory,    setPiCategory]    = useState("");
  const [format,        setFormat]        = useState("");
  const [businessRules, setBusinessRules] = useState("");
  const [example,       setExample]       = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ termName, parentGlossaryId: Number(parentId), definition, termType, classCode: classCode || null, isPii, piCategoryCode: isPii ? (piCategory || null) : null, format, businessRules, example }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Term Name" required><Inp value={termName} onChange={setTermName} placeholder="e.g. Net Revenue" /></Field>
        <Field label="Domain / Sub-domain" required>
          <Sel value={parentId} onChange={setParentId}>
            <option value="">— Select —</option>
            {refData.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Sel>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Term Type">
          <Sel value={termType} onChange={setTermType}>
            <option value="TERM">Term</option>
            <option value="KPI_METRIC">KPI / Metric</option>
          </Sel>
        </Field>
        <Field label="Classification"><Sel value={classCode} onChange={setClassCode}>{CLASS_CODES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Sel></Field>
      </div>
      <Field label="Definition" required><textarea value={definition} onChange={(e) => setDefinition(e.target.value)} rows={3} className="input-field resize-none" placeholder="What does this term mean?" /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Format"><Inp value={format} onChange={setFormat} placeholder="e.g. YYYY-MM-DD" /></Field>
        <Field label="Example"><Inp value={example} onChange={setExample} placeholder="e.g. 2024-01-15" /></Field>
      </div>
      <Field label="Business Rules"><textarea value={businessRules} onChange={(e) => setBusinessRules(e.target.value)} rows={2} className="input-field resize-none" placeholder="Enter rules…" /></Field>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={isPii} onChange={(e) => { setIsPii(e.target.checked); if (!e.target.checked) setPiCategory(""); }} className="w-4 h-4 accent-brand-purple" />
          <span className="font-medium">Personal Information (PI)</span>
        </label>
        {isPii && (
          <Field label="PI Category">
            <Sel value={piCategory} onChange={setPiCategory}>
              <option value="">— Select category —</option>
              {PI_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Sel>
          </Field>
        )}
      </div>
      <button type="submit" className="btn btn-primary w-full">Create Business Term</button>
    </form>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function AddAssetModal({ onClose }: { onClose: () => void }) {
  const router  = useRouter();
  const refData = useRefData();
  const [kind,    setKind]    = useState<AssetKind | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const ENDPOINT: Record<AssetKind, string> = {
    DATA_SOURCE:        "/api/catalog/sources",
    SCHEMA:             "/api/catalog/schemas",
    TABLE:              "/api/catalog/entities",
    COLUMN:             "/api/catalog/attributes",
    GLOSSARY_DOMAIN:    "/api/glossary/domains",
    GLOSSARY_SUBDOMAIN: "/api/glossary/domains",
    BUSINESS_TERM:      "/api/glossary/terms",
  };

  async function submit(body: object) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT[kind!], {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setSuccess(true);
      router.refresh();
      setTimeout(onClose, 1200);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-line max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="font-bold text-brand-deep">Add Asset</h2>
            {kind && (
              <button onClick={() => { setKind(null); setError(null); setSuccess(false); }}
                className="text-[11px] text-brand-purple hover:underline mt-0.5">
                ← Choose different type
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {success && (
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm font-medium">
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              Asset created successfully!
            </div>
          )}

          {!kind && !success && (
            <div>
              <p className="text-sm text-muted mb-4">Choose the type of asset you want to add:</p>
              <div className="grid grid-cols-2 gap-3">
                {KINDS.map(({ kind: k, label, desc, icon }) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className="text-left flex items-start gap-3 p-4 rounded-lg border border-line hover:border-brand-purple hover:bg-brand-purple/5 transition-all"
                  >
                    <span className="text-2xl shrink-0">{icon}</span>
                    <div>
                      <div className="font-semibold text-sm text-brand-deep">{label}</div>
                      <div className="text-[12px] text-muted">{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {kind && !success && (
            <div>
              {error && (
                <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
              )}
              {saving && (
                <div className="mb-4 text-sm text-muted">Saving…</div>
              )}
              {kind === "DATA_SOURCE"        && <DataSourceForm onSubmit={submit} />}
              {kind === "SCHEMA"             && <SchemaForm refData={refData} onSubmit={submit} />}
              {kind === "TABLE"              && <TableForm refData={refData} onSubmit={submit} />}
              {kind === "COLUMN"             && <ColumnForm refData={refData} onSubmit={submit} />}
              {kind === "GLOSSARY_DOMAIN"    && <GlossaryDomainForm parentLabel="Domain"     refData={refData} onSubmit={submit} />}
              {kind === "GLOSSARY_SUBDOMAIN" && <GlossaryDomainForm parentLabel="Sub-domain" refData={refData} onSubmit={submit} />}
              {kind === "BUSINESS_TERM"      && <BusinessTermForm refData={refData} onSubmit={submit} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
