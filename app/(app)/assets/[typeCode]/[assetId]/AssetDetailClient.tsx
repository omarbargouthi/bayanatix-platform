"use client";

import { useState } from "react";
import Link from "next/link";
import { AttributeForm, type AttributeDef } from "@/components/custom-assets/AttributeForm";
import { EndpointPicker, type EndpointHit } from "@/components/custom-assets/EndpointPicker";
import { TagPicker } from "@/components/catalog/TagPicker";
import { GovernancePanel, type Stakeholder, type GovernanceRoleLabels } from "@/components/catalog/GovernancePanel";
import { AssetRequestsDrawer } from "@/components/catalog/AssetRequestsDrawer";

type ResolvedLink = {
  linkId: number;
  relTypeId: number;
  relCode: string;
  label: string;
  direction: "OUT" | "IN";
  otherAssetTypeCode: string;
  otherAssetId: number;
  otherAssetName: string;
  otherAssetHref: string | null;
  attributes: Record<string, unknown>;
  validFromDate: string | null;
  validToDate: string | null;
};

type RelationshipType = {
  relTypeId: number;
  relCode: string;
  relNameText: string;
  inverseNameText: string | null;
  fromEndpoints: string[];
  toEndpoints: string[];
};

type RelSlot = { relTypeId: number; relCode: string; label: string; direction: "OUT" | "IN"; allowedTypes: string[] };

function RelationshipPanel({
  slot, typeCode, assetId, links, canWrite, onLinksChange,
}: {
  slot: RelSlot;
  typeCode: string;
  assetId: number;
  links: ResolvedLink[];
  canWrite: boolean;
  onLinksChange: (links: ResolvedLink[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const slotLinks = links.filter((l) => l.relTypeId === slot.relTypeId && l.direction === slot.direction);

  async function addLink(hit: EndpointHit) {
    setBusy(true);
    try {
      const r = await fetch(`/api/custom-assets/${typeCode}/${assetId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relCode: slot.relCode, direction: slot.direction,
          otherAssetTypeCode: hit.typeCode, otherAssetId: hit.id,
        }),
      });
      if (r.ok) {
        const { linkId } = await r.json();
        onLinksChange([...links, {
          linkId, relTypeId: slot.relTypeId, relCode: slot.relCode, label: slot.label, direction: slot.direction,
          otherAssetTypeCode: hit.typeCode, otherAssetId: hit.id, otherAssetName: hit.name, otherAssetHref: null,
          attributes: {}, validFromDate: null, validToDate: null,
        }]);
      }
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(linkId: number) {
    setBusy(true);
    try {
      const r = await fetch(`/api/custom-asset-links/${linkId}`, { method: "DELETE" });
      if (r.ok) onLinksChange(links.filter((l) => l.linkId !== linkId));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-line rounded-lg p-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-semibold text-ink">{slot.label}</span>
        {canWrite && (
          <button onClick={() => setAdding((v) => !v)} className="text-[11px] text-brand-purple hover:underline font-medium">
            {adding ? "Cancel" : "+ Add"}
          </button>
        )}
      </div>

      {slotLinks.length === 0 && !adding && (
        <div className="text-[12px] text-muted italic">None linked.</div>
      )}

      <div className="space-y-1.5">
        {slotLinks.map((l) => (
          <div key={l.linkId} className="flex items-center gap-2 group bg-canvas-soft rounded-md px-2.5 py-1.5">
            {l.otherAssetHref ? (
              <Link href={l.otherAssetHref} className="text-[12px] font-medium text-brand-purple hover:underline flex-1 truncate">
                {l.otherAssetName}
              </Link>
            ) : (
              <span className="text-[12px] font-medium text-ink flex-1 truncate">{l.otherAssetName}</span>
            )}
            <span className="text-[10px] text-muted shrink-0">{l.otherAssetTypeCode.replace("CUSTOM:", "").replace("DATA_", "")}</span>
            {canWrite && (
              <button
                onClick={() => removeLink(l.linkId)}
                disabled={busy}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center text-[11px] shrink-0 transition-opacity disabled:opacity-50"
                title="Remove"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {adding && (
        <div className="mt-2">
          <EndpointPicker
            allowedTypes={slot.allowedTypes}
            excludeIds={slotLinks.map((l) => ({ typeCode: l.otherAssetTypeCode, id: l.otherAssetId }))}
            onSelect={addLink}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
    </div>
  );
}

export function AssetDetailClient({
  typeCode, typeName, assetTypeCode, assetId,
  assetNameText: initialName, nameArText: initialNameAr, descriptionText: initialDesc, statusCode: initialStatus,
  attributes, initialValues, links: initialLinks, relationshipTypes,
  initialStakeholders, roleLabels, canWrite,
}: {
  typeCode: string; typeName: string; assetTypeCode: string; assetId: number;
  assetNameText: string; nameArText: string | null; descriptionText: string | null; statusCode: "ACTIVE" | "DEPRECATED";
  attributes: AttributeDef[]; initialValues: Record<string, unknown>;
  links: ResolvedLink[]; relationshipTypes: RelationshipType[];
  initialStakeholders: Stakeholder[]; roleLabels: GovernanceRoleLabels; canWrite: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showRequests, setShowRequests] = useState(false);

  const [assetNameText, setAssetNameText] = useState(initialName);
  const [nameArText, setNameArText] = useState(initialNameAr ?? "");
  const [descriptionText, setDescriptionText] = useState(initialDesc ?? "");
  const [statusCode, setStatusCode] = useState(initialStatus);
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [links, setLinks] = useState<ResolvedLink[]>(initialLinks);

  const slots: RelSlot[] = [];
  for (const rt of relationshipTypes) {
    if (rt.fromEndpoints.includes(assetTypeCode)) {
      slots.push({ relTypeId: rt.relTypeId, relCode: rt.relCode, label: rt.relNameText, direction: "OUT", allowedTypes: rt.toEndpoints });
    }
    if (rt.toEndpoints.includes(assetTypeCode)) {
      slots.push({ relTypeId: rt.relTypeId, relCode: rt.relCode, label: rt.inverseNameText ?? rt.relNameText, direction: "IN", allowedTypes: rt.fromEndpoints });
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const r = await fetch(`/api/custom-assets/${typeCode}/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetNameText, nameArText: nameArText || null, descriptionText: descriptionText || null,
          statusCode, attributes: values,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (body.errors) setFieldErrors(Object.fromEntries(body.errors.map((e: any) => [e.attrCode, e.message])));
        setError(body.error === "validation_failed" ? "Please fix the highlighted fields." : (body.error ?? "Failed to save."));
        return;
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="card-padded space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {editing ? (
              <input className="field-input font-bold text-lg" value={assetNameText} onChange={(e) => setAssetNameText(e.target.value)} />
            ) : (
              <h1 className="text-xl font-bold text-brand-deep">{assetNameText}</h1>
            )}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCode === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
              {statusCode}
            </span>
          </div>
          <div className="flex gap-2">
            {canWrite && (
              <button onClick={() => setShowRequests(true)} className="btn text-sm">Raise Request</button>
            )}
            {canWrite && !editing && (
              <button onClick={() => setEditing(true)} className="btn text-sm">Edit</button>
            )}
            {editing && (
              <>
                <button onClick={save} disabled={saving} className="btn btn-primary text-sm">{saving ? "Saving…" : "Save"}</button>
                <button onClick={() => setEditing(false)} className="btn text-sm">Cancel</button>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Name (Arabic)</label>
              <input className="field-input" value={nameArText} onChange={(e) => setNameArText(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Status</label>
              <select className="field-input" value={statusCode} onChange={(e) => setStatusCode(e.target.value as "ACTIVE" | "DEPRECATED")}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="DEPRECATED">DEPRECATED</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="field-label">Description</label>
              <textarea className="field-input" rows={2} value={descriptionText} onChange={(e) => setDescriptionText(e.target.value)} />
            </div>
          </div>
        ) : (
          descriptionText && <p className="text-[13px] text-ink-soft">{descriptionText}</p>
        )}

        <AttributeForm attributes={attributes} values={values} onChange={(code, v) => setValues((prev) => ({ ...prev, [code]: v }))} disabled={!editing} />

        {Object.keys(fieldErrors).length > 0 && (
          <ul className="text-xs text-red-600 list-disc pl-4">
            {Object.entries(fieldErrors).map(([code, msg]) => <li key={code}>{msg}</li>)}
          </ul>
        )}
        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>

      {slots.length > 0 && (
        <div className="card p-5">
          <h3 className="font-bold text-sm mb-3">Relationships</h3>
          <div className="grid grid-cols-2 gap-3">
            {slots.map((slot) => (
              <RelationshipPanel
                key={`${slot.relTypeId}-${slot.direction}`}
                slot={slot} typeCode={typeCode} assetId={assetId} links={links} canWrite={canWrite}
                onLinksChange={setLinks}
              />
            ))}
          </div>
        </div>
      )}

      <div className="card p-5">
        <h3 className="font-bold text-sm mb-3">Tags</h3>
        <TagPicker assetType={assetTypeCode} assetId={assetId} />
      </div>

      <GovernancePanel
        assetTypeCode={assetTypeCode}
        assetId={assetId}
        initialStakeholders={initialStakeholders}
        canEdit={canWrite}
        roleLabels={roleLabels}
      />

      {showRequests && (
        <AssetRequestsDrawer
          assetType={assetTypeCode}
          assetId={assetId}
          assetName={assetNameText}
          onClose={() => setShowRequests(false)}
        />
      )}
    </div>
  );
}
