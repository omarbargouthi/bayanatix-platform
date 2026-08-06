"use client";

export type EditableField = {
  attr_code: string;
  attr_name_text: string;
  name_ar_text: string;
  data_type_code: string;
  enum_values_text: string; // comma-separated, edited as plain text
  is_required_indicator: boolean;
  is_unique_indicator: boolean;
};

export const DATA_TYPES = ["TEXT", "LONGTEXT", "NUMBER", "DATE", "BOOLEAN", "ENUM", "USER", "URL"];

export const BLANK_FIELD: EditableField = {
  attr_code: "", attr_name_text: "", name_ar_text: "", data_type_code: "TEXT",
  enum_values_text: "", is_required_indicator: false, is_unique_indicator: false,
};

export function toApiFields(fields: EditableField[], includeUnique: boolean) {
  return fields.map((f) => ({
    attr_code: f.attr_code.trim().toUpperCase().replace(/\s+/g, "_"),
    attr_name_text: f.attr_name_text.trim(),
    name_ar_text: f.name_ar_text.trim() || null,
    data_type_code: f.data_type_code,
    enum_values_json: f.data_type_code === "ENUM"
      ? f.enum_values_text.split(",").map((v) => v.trim()).filter(Boolean)
      : null,
    is_required_indicator: f.is_required_indicator,
    ...(includeUnique ? { is_unique_indicator: f.is_unique_indicator } : {}),
  }));
}

export function AttributeSchemaEditor({
  fields, onChange, showUnique = true,
}: {
  fields: EditableField[];
  onChange: (fields: EditableField[]) => void;
  showUnique?: boolean;
}) {
  function update(idx: number, patch: Partial<EditableField>) {
    onChange(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }
  function remove(idx: number) {
    onChange(fields.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...fields, { ...BLANK_FIELD }]);
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...fields];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {fields.map((f, idx) => (
        <div key={idx} className="border border-line rounded-md p-3 grid grid-cols-12 gap-2 items-start bg-canvas-soft">
          <input className="field-input col-span-2" placeholder="CODE" value={f.attr_code}
            onChange={(e) => update(idx, { attr_code: e.target.value })} />
          <input className="field-input col-span-3" placeholder="Name (EN)" value={f.attr_name_text}
            onChange={(e) => update(idx, { attr_name_text: e.target.value })} />
          <input className="field-input col-span-2" placeholder="Name (AR)" value={f.name_ar_text}
            onChange={(e) => update(idx, { name_ar_text: e.target.value })} />
          <select className="field-input col-span-2" value={f.data_type_code}
            onChange={(e) => update(idx, { data_type_code: e.target.value })}>
            {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {f.data_type_code === "ENUM" ? (
            <input className="field-input col-span-3" placeholder="Values, comma-separated" value={f.enum_values_text}
              onChange={(e) => update(idx, { enum_values_text: e.target.value })} />
          ) : (
            <div className="col-span-3 flex items-center gap-3 text-xs text-ink-soft pt-2.5">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={f.is_required_indicator} onChange={(e) => update(idx, { is_required_indicator: e.target.checked })} />
                Required
              </label>
              {showUnique && (
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={f.is_unique_indicator} onChange={(e) => update(idx, { is_unique_indicator: e.target.checked })} />
                  Unique
                </label>
              )}
            </div>
          )}
          {f.data_type_code === "ENUM" && (
            <div className="col-span-12 flex items-center gap-3 text-xs text-ink-soft -mt-1">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={f.is_required_indicator} onChange={(e) => update(idx, { is_required_indicator: e.target.checked })} />
                Required
              </label>
              {showUnique && (
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={f.is_unique_indicator} onChange={(e) => update(idx, { is_unique_indicator: e.target.checked })} />
                  Unique
                </label>
              )}
            </div>
          )}
          <div className="col-span-12 flex justify-end gap-2 text-xs">
            <button type="button" onClick={() => move(idx, -1)} className="text-muted hover:text-ink">↑</button>
            <button type="button" onClick={() => move(idx, 1)} className="text-muted hover:text-ink">↓</button>
            <button type="button" onClick={() => remove(idx)} className="text-red-600 hover:underline">Remove</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="text-sm text-brand-purple font-semibold hover:underline">+ Add Field</button>
    </div>
  );
}
