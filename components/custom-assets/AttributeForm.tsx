"use client";

export type AttributeDef = {
  attrCode: string;
  attrNameText: string;
  dataTypeCode: string;
  enumValuesJson: string[] | null;
  isRequired: boolean;
};

export function AttributeForm({
  attributes, values, onChange, disabled,
}: {
  attributes: AttributeDef[];
  values: Record<string, unknown>;
  onChange: (attrCode: string, value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {attributes.map((a) => {
        const value = values[a.attrCode] ?? "";
        return (
          <div key={a.attrCode} className={a.dataTypeCode === "LONGTEXT" ? "col-span-2" : ""}>
            <label className="field-label">{a.attrNameText}{a.isRequired && <span className="text-red-500"> *</span>}</label>
            {a.dataTypeCode === "LONGTEXT" ? (
              <textarea className="field-input" rows={3} value={String(value)} disabled={disabled}
                onChange={(e) => onChange(a.attrCode, e.target.value)} />
            ) : a.dataTypeCode === "BOOLEAN" ? (
              <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(a.attrCode, e.target.checked)} />
            ) : a.dataTypeCode === "ENUM" ? (
              <select className="field-input" value={String(value)} disabled={disabled} onChange={(e) => onChange(a.attrCode, e.target.value)}>
                <option value="">—</option>
                {(a.enumValuesJson ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            ) : a.dataTypeCode === "NUMBER" ? (
              <input type="number" className="field-input" value={String(value)} disabled={disabled}
                onChange={(e) => onChange(a.attrCode, e.target.value === "" ? "" : Number(e.target.value))} />
            ) : a.dataTypeCode === "DATE" ? (
              <input type="date" className="field-input" value={String(value)} disabled={disabled}
                onChange={(e) => onChange(a.attrCode, e.target.value)} />
            ) : a.dataTypeCode === "URL" ? (
              <input type="url" className="field-input" placeholder="https://…" value={String(value)} disabled={disabled}
                onChange={(e) => onChange(a.attrCode, e.target.value)} />
            ) : (
              <input type="text" className="field-input" value={String(value)} disabled={disabled}
                onChange={(e) => onChange(a.attrCode, e.target.value)} />
            )}
          </div>
        );
      })}
    </div>
  );
}
