"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AttributeSchemaEditor, BLANK_FIELD, toApiFields, type EditableField,
} from "@/components/custom-assets/AttributeSchemaEditor";

type CustomAssetType = {
  typeId: number; typeCode: string; typeNameText: string; nameArText: string | null;
  descriptionText: string | null; iconCode: string | null; colorHex: string | null;
  isEnabled: boolean; instanceCount?: number;
};

type CustomRelationshipType = {
  relTypeId: number; relCode: string; relNameText: string; nameArText: string | null;
  inverseNameText: string | null; inverseNameArText: string | null;
  fromEndpoints: string[]; toEndpoints: string[]; cardinalityCode: string;
  attributesSchema: { attr_code: string; attr_name_text: string; data_type_code: string }[] | null;
  isEnabled: boolean;
};

const CORE_ASSET_TYPES = ["DATA_SOURCES", "DATA_SCHEMAS", "DATA_ENTITIES", "DATA_ATTRIBUTES"];
const CARDINALITIES = ["M:N", "1:N", "N:1"];

const BLANK_TYPE_FORM = { typeCode: "", typeNameText: "", nameArText: "", descriptionText: "", iconCode: "", colorHex: "#6058A0" };
const BLANK_REL_FORM = {
  relCode: "", relNameText: "", nameArText: "", inverseNameText: "", inverseNameArText: "", cardinalityCode: "M:N",
  fromEndpoints: [] as string[], toEndpoints: [] as string[],
};

export default function CustomAssetsAdminPage() {
  const [tab, setTab] = useState<"types" | "relTypes">("types");

  const [types, setTypes] = useState<CustomAssetType[]>([]);
  const [relTypes, setRelTypes] = useState<CustomRelationshipType[]>([]);
  const [loading, setLoading] = useState(true);

  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingType, setEditingType] = useState<CustomAssetType | null>(null);
  const [typeForm, setTypeForm] = useState({ ...BLANK_TYPE_FORM });
  const [typeFields, setTypeFields] = useState<EditableField[]>([{ ...BLANK_FIELD }]);
  const [typeError, setTypeError] = useState<string | null>(null);

  const [showRelForm, setShowRelForm] = useState(false);
  const [editingRel, setEditingRel] = useState<CustomRelationshipType | null>(null);
  const [relForm, setRelForm] = useState({ ...BLANK_REL_FORM });
  const [relFields, setRelFields] = useState<EditableField[]>([]);
  const [relError, setRelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, rRes] = await Promise.all([
        fetch("/api/admin/custom-asset-types?all=true"),
        fetch("/api/admin/custom-relationship-types?all=true"),
      ]);
      if (tRes.ok) setTypes(await tRes.json());
      if (rRes.ok) setRelTypes(await rRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const allEndpointOptions = [...CORE_ASSET_TYPES, ...types.map((t) => `CUSTOM:${t.typeCode}`)];

  function startNewType() {
    setEditingType(null);
    setTypeForm({ ...BLANK_TYPE_FORM });
    setTypeFields([{ ...BLANK_FIELD }]);
    setTypeError(null);
    setShowTypeForm(true);
  }

  async function startEditType(t: CustomAssetType) {
    setEditingType(t);
    setTypeForm({
      typeCode: t.typeCode, typeNameText: t.typeNameText, nameArText: t.nameArText ?? "",
      descriptionText: t.descriptionText ?? "", iconCode: t.iconCode ?? "", colorHex: t.colorHex ?? "#6058A0",
    });
    setTypeError(null);
    const r = await fetch(`/api/admin/custom-asset-types/${t.typeId}`);
    const attrs = r.ok ? await r.json() : [];
    setTypeFields(
      attrs.length > 0
        ? attrs.map((a: any) => ({
            attr_code: a.attrCode, attr_name_text: a.attrNameText, name_ar_text: a.nameArText ?? "",
            data_type_code: a.dataTypeCode, enum_values_text: (a.enumValuesJson ?? []).join(", "),
            is_required_indicator: a.isRequired, is_unique_indicator: a.isUnique,
          }))
        : [{ ...BLANK_FIELD }],
    );
    setShowTypeForm(true);
  }

  async function saveType(confirmFieldDeletion = false) {
    setTypeError(null);
    const attributes = toApiFields(typeFields.filter((f) => f.attr_code.trim()), true);

    if (editingType) {
      const r = await fetch(`/api/admin/custom-asset-types/${editingType.typeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typeNameText: typeForm.typeNameText, nameArText: typeForm.nameArText || null,
          descriptionText: typeForm.descriptionText || null, iconCode: typeForm.iconCode || null,
          colorHex: typeForm.colorHex || null, attributes, confirmFieldDeletion,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        if (r.status === 409 && body.fieldsWithData) {
          if (confirm(`${body.message} Continue and delete this data?`)) return saveType(true);
        }
        setTypeError(body.error ?? "Failed to save type");
        return;
      }
    } else {
      const r = await fetch("/api/admin/custom-asset-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...typeForm, typeCode: typeForm.typeCode.trim().toUpperCase().replace(/\s+/g, "_"), attributes }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setTypeError(body.error ?? "Failed to create type");
        return;
      }
    }
    setShowTypeForm(false);
    await load();
  }

  async function toggleTypeEnabled(t: CustomAssetType) {
    await fetch(`/api/admin/custom-asset-types/${t.typeId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !t.isEnabled }),
    });
    await load();
  }

  function startNewRel() {
    setEditingRel(null);
    setRelForm({ ...BLANK_REL_FORM });
    setRelFields([]);
    setRelError(null);
    setShowRelForm(true);
  }

  function startEditRel(r: CustomRelationshipType) {
    setEditingRel(r);
    setRelForm({
      relCode: r.relCode, relNameText: r.relNameText, nameArText: r.nameArText ?? "",
      inverseNameText: r.inverseNameText ?? "", inverseNameArText: r.inverseNameArText ?? "",
      cardinalityCode: r.cardinalityCode, fromEndpoints: r.fromEndpoints, toEndpoints: r.toEndpoints,
    });
    setRelFields(
      (r.attributesSchema ?? []).map((a: any) => ({
        attr_code: a.attr_code, attr_name_text: a.attr_name_text, name_ar_text: a.name_ar_text ?? "",
        data_type_code: a.data_type_code, enum_values_text: (a.enum_values_json ?? []).join(", "),
        is_required_indicator: a.is_required_indicator ?? false, is_unique_indicator: false,
      })),
    );
    setRelError(null);
    setShowRelForm(true);
  }

  async function saveRel() {
    setRelError(null);
    if (relForm.fromEndpoints.length === 0 || relForm.toEndpoints.length === 0) {
      setRelError("Select at least one From endpoint and one To endpoint.");
      return;
    }
    const attributesSchema = toApiFields(relFields.filter((f) => f.attr_code.trim()), false);
    const payload = { ...relForm, relCode: relForm.relCode.trim().toUpperCase().replace(/\s+/g, "_"), attributesSchema };

    const url = editingRel ? `/api/admin/custom-relationship-types/${editingRel.relTypeId}` : "/api/admin/custom-relationship-types";
    const method = editingRel ? "PATCH" : "POST";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      setRelError(body.error ?? "Failed to save relationship type");
      return;
    }
    setShowRelForm(false);
    await load();
  }

  async function toggleRelEnabled(r: CustomRelationshipType) {
    await fetch(`/api/admin/custom-relationship-types/${r.relTypeId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !r.isEnabled }),
    });
    await load();
  }

  function toggleEndpoint(list: "fromEndpoints" | "toEndpoints", code: string) {
    setRelForm((prev) => {
      const set = new Set(prev[list]);
      if (set.has(code)) set.delete(code); else set.add(code);
      return { ...prev, [list]: [...set] };
    });
  }

  if (loading) return <div className="p-6 text-center text-muted">Loading…</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-brand-deep">Custom Asset Types</h1>
        <p className="text-xs text-muted mt-0.5">Define custom asset types, their attribute schema, and typed relationships to core catalog assets.</p>
      </div>

      <div className="flex gap-2 border-b border-line">
        <button onClick={() => setTab("types")} className={`px-3 py-2 text-sm font-semibold border-b-2 ${tab === "types" ? "border-brand-purple text-brand-purple" : "border-transparent text-muted"}`}>Types</button>
        <button onClick={() => setTab("relTypes")} className={`px-3 py-2 text-sm font-semibold border-b-2 ${tab === "relTypes" ? "border-brand-purple text-brand-purple" : "border-transparent text-muted"}`}>Relationship Types</button>
      </div>

      {tab === "types" && (
        <div className="space-y-4">
          <button onClick={startNewType} className="btn btn-primary text-sm">+ New Type</button>

          {showTypeForm && (
            <div className="card-padded space-y-3">
              <div className="text-sm font-semibold text-ink">{editingType ? `Edit ${editingType.typeNameText}` : "New Custom Asset Type"}</div>
              <div className="grid grid-cols-2 gap-3">
                <input className="field-input" placeholder="TYPE_CODE" value={typeForm.typeCode} disabled={!!editingType}
                  onChange={(e) => setTypeForm({ ...typeForm, typeCode: e.target.value })} />
                <input className="field-input" placeholder="Name (English)" value={typeForm.typeNameText}
                  onChange={(e) => setTypeForm({ ...typeForm, typeNameText: e.target.value })} />
                <input className="field-input" placeholder="Name (Arabic)" value={typeForm.nameArText}
                  onChange={(e) => setTypeForm({ ...typeForm, nameArText: e.target.value })} />
                <input className="field-input" placeholder="Icon code (optional)" value={typeForm.iconCode}
                  onChange={(e) => setTypeForm({ ...typeForm, iconCode: e.target.value })} />
                <input className="field-input" type="color" value={typeForm.colorHex}
                  onChange={(e) => setTypeForm({ ...typeForm, colorHex: e.target.value })} />
                <input className="field-input col-span-2" placeholder="Description (optional)" value={typeForm.descriptionText}
                  onChange={(e) => setTypeForm({ ...typeForm, descriptionText: e.target.value })} />
              </div>
              <div>
                <div className="field-label">Attribute Schema</div>
                <AttributeSchemaEditor fields={typeFields} onChange={setTypeFields} showUnique />
              </div>
              {typeError && <div className="text-xs text-red-600">{typeError}</div>}
              <div className="flex gap-2">
                <button onClick={() => saveType()} className="btn btn-primary text-sm">Save</button>
                <button onClick={() => setShowTypeForm(false)} className="btn text-sm">Cancel</button>
              </div>
            </div>
          )}

          <div className="card-padded">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Instances</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.typeId} className="border-b border-line-soft">
                    <td className="py-2 pr-3 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: t.colorHex ?? "#6058A0" }} />
                      {t.typeNameText}
                    </td>
                    <td className="py-2 pr-3 text-ink-soft">{t.typeCode}</td>
                    <td className="py-2 pr-3 text-ink-soft">{t.instanceCount ?? 0}</td>
                    <td className="py-2 pr-3">
                      <button onClick={() => toggleTypeEnabled(t)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                        {t.isEnabled ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <button onClick={() => startEditType(t)} className="text-xs text-brand-purple font-semibold">Edit</button>
                    </td>
                  </tr>
                ))}
                {types.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">No custom asset types yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "relTypes" && (
        <div className="space-y-4">
          <button onClick={startNewRel} className="btn btn-primary text-sm">+ New Relationship Type</button>

          {showRelForm && (
            <div className="card-padded space-y-3">
              <div className="text-sm font-semibold text-ink">{editingRel ? `Edit ${editingRel.relNameText}` : "New Relationship Type"}</div>
              <div className="grid grid-cols-2 gap-3">
                <input className="field-input" placeholder="REL_CODE" value={relForm.relCode} disabled={!!editingRel}
                  onChange={(e) => setRelForm({ ...relForm, relCode: e.target.value })} />
                <select className="field-input" value={relForm.cardinalityCode} onChange={(e) => setRelForm({ ...relForm, cardinalityCode: e.target.value })}>
                  {CARDINALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="field-input" placeholder="Name (e.g. Consumes)" value={relForm.relNameText}
                  onChange={(e) => setRelForm({ ...relForm, relNameText: e.target.value })} />
                <input className="field-input" placeholder="Name (Arabic)" value={relForm.nameArText}
                  onChange={(e) => setRelForm({ ...relForm, nameArText: e.target.value })} />
                <input className="field-input" placeholder="Inverse label (e.g. Consumed by)" value={relForm.inverseNameText}
                  onChange={(e) => setRelForm({ ...relForm, inverseNameText: e.target.value })} />
                <input className="field-input" placeholder="Inverse label (Arabic)" value={relForm.inverseNameArText}
                  onChange={(e) => setRelForm({ ...relForm, inverseNameArText: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="field-label">From endpoints</div>
                  <div className="flex flex-wrap gap-2">
                    {allEndpointOptions.map((code) => (
                      <label key={code} className={`text-xs px-2 py-1 rounded-full border cursor-pointer ${relForm.fromEndpoints.includes(code) ? "bg-brand-purple/10 border-brand-purple text-brand-purple" : "border-line text-ink-soft"}`}>
                        <input type="checkbox" className="hidden" checked={relForm.fromEndpoints.includes(code)} onChange={() => toggleEndpoint("fromEndpoints", code)} />
                        {code}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="field-label">To endpoints</div>
                  <div className="flex flex-wrap gap-2">
                    {allEndpointOptions.map((code) => (
                      <label key={code} className={`text-xs px-2 py-1 rounded-full border cursor-pointer ${relForm.toEndpoints.includes(code) ? "bg-brand-purple/10 border-brand-purple text-brand-purple" : "border-line text-ink-soft"}`}>
                        <input type="checkbox" className="hidden" checked={relForm.toEndpoints.includes(code)} onChange={() => toggleEndpoint("toEndpoints", code)} />
                        {code}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="field-label">Relationship Attributes (optional)</div>
                <AttributeSchemaEditor fields={relFields} onChange={setRelFields} showUnique={false} />
              </div>
              {relError && <div className="text-xs text-red-600">{relError}</div>}
              <div className="flex gap-2">
                <button onClick={saveRel} className="btn btn-primary text-sm">Save</button>
                <button onClick={() => setShowRelForm(false)} className="btn text-sm">Cancel</button>
              </div>
            </div>
          )}

          <div className="card-padded">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="py-2 pr-3">Relationship</th>
                  <th className="py-2 pr-3">From → To</th>
                  <th className="py-2 pr-3">Cardinality</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {relTypes.map((r) => (
                  <tr key={r.relTypeId} className="border-b border-line-soft">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-ink">{r.relNameText}</div>
                      <div className="text-[10px] text-muted">{r.relCode}</div>
                    </td>
                    <td className="py-2 pr-3 text-xs text-ink-soft">{r.fromEndpoints.join(", ")} → {r.toEndpoints.join(", ")}</td>
                    <td className="py-2 pr-3 text-ink-soft">{r.cardinalityCode}</td>
                    <td className="py-2 pr-3">
                      <button onClick={() => toggleRelEnabled(r)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                        {r.isEnabled ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <button onClick={() => startEditRel(r)} className="text-xs text-brand-purple font-semibold">Edit</button>
                    </td>
                  </tr>
                ))}
                {relTypes.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">No relationship types yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
