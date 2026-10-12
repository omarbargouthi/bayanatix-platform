"use client";

import { useLang } from "@/lib/lang-context";
import { NewRequestForm, type NewRequestType, type RequestTarget } from "@/components/requests/NewRequestForm";

// The "New Request" form in a dialog, opened from an asset (table page, requests drawer).
export function RaiseRequestModal({
  prefilledTarget,
  entities,
  initialRequestType,
  onClose,
  onSaved,
}: {
  prefilledTarget?:     RequestTarget;
  entities?:            { entityId: number; entityName: string }[];
  initialRequestType?:  NewRequestType;
  onClose:              () => void;
  onSaved:              () => void;
}) {
  const { t } = useLang();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-line max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-line sticky top-0 bg-white z-10">
          <h2 className="font-bold text-brand-deep">{t.catalog.raiseRequestTitle}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <NewRequestForm
          variant="modal"
          prefilledTarget={prefilledTarget}
          entities={entities}
          initialRequestType={initialRequestType}
          onCancel={onClose}
          onSaved={() => onSaved()}
        />
      </div>
    </div>
  );
}
