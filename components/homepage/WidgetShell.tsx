"use client";

import type { ComponentType, ReactNode } from "react";

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

type Props = {
  title: string;
  Icon: ComponentType<{ className?: string }>;
  customizing: boolean;
  removeLabel: string;
  onRemove: () => void;
  draggable: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  children: ReactNode;
};

export function WidgetShell({
  title, Icon, customizing, removeLabel, onRemove,
  draggable, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd,
  children,
}: Props) {
  return (
    <div
      className={`card p-0 overflow-hidden flex flex-col transition-shadow ${isDragOver ? "ring-2 ring-brand-purple/50" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line-soft bg-canvas-soft">
        {customizing && (
          <span className="cursor-grab text-muted shrink-0" title="Drag to reorder">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="8" cy="6" r="1.4" /><circle cx="16" cy="6" r="1.4" />
              <circle cx="8" cy="12" r="1.4" /><circle cx="16" cy="12" r="1.4" />
              <circle cx="8" cy="18" r="1.4" /><circle cx="16" cy="18" r="1.4" />
            </svg>
          </span>
        )}
        <Icon className="w-4 h-4 text-brand-purple shrink-0" />
        <h3 className="text-[13px] font-bold text-brand-deep flex-1 truncate">{title}</h3>
        {customizing && (
          <button
            onClick={onRemove}
            title={removeLabel}
            className="shrink-0 w-5 h-5 grid place-items-center rounded-full text-muted hover:text-red-600 hover:bg-red-50"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>
      <div className="p-4 flex-1">{children}</div>
    </div>
  );
}
