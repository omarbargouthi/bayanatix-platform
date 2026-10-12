"use client";

import type { ReactNode } from "react";

// The standard dialog for a form, in the style of the regulation form: a title bar with
// a close button, the fields, and the buttons under a rule. Use the "field" class on its
// controls and FormField (or the "form-label" class) for their captions.
export function FormDialog({ title, subtitle, onClose, footer, width = "w-[680px]", children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** The buttons, right-aligned (Cancel first, the main action last). */
  footer: ReactNode;
  /** Tailwind width class of the dialog. */
  width?: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto py-10 px-4" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl ${width} max-w-full border border-line text-[13px]`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-line">
          <div className="min-w-0">
            <h2 className="font-bold text-brand-deep text-base">{title}</h2>
            {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-ink text-xl leading-none shrink-0">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {children}
          <div className="flex justify-end items-center gap-2 pt-4 border-t border-line-soft">{footer}</div>
        </div>
      </div>
    </div>
  );
}

export function FormField({ label, required, hint, children }: { label: ReactNode; required?: boolean; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label className="form-label">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}
