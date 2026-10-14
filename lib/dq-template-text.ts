"use client";

import { useLang } from "@/lib/lang-context";

// Translated names, descriptions and setting labels for the rule templates in
// lib/dq-templates.ts (keys dq.templates.*, dq.templateDescriptions.*, dq.templateFields.*).
// Falls back to the English text in the template definition.
export function useDqTemplateText() {
  const { t } = useLang();
  const names = t.dq.templates as Record<string, string | undefined>;
  const descs = t.dq.templateDescriptions as Record<string, string | undefined>;
  const fields = t.dq.templateFields as Record<string, string | undefined>;
  return {
    templateName: (code: string | null | undefined, fallback?: string) => (code && names[code]) || fallback || code || "",
    templateDescription: (code: string, fallback: string) => descs[code] || fallback,
    fieldLabel: (key: string, fallback: string) => fields[key] || fallback,
  };
}
