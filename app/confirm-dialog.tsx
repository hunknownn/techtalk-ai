"use client";

import { useEffect } from "react";

/** 네이티브 confirm() 대체: UI 톤에 맞는 확인 다이얼로그 (Esc/백드롭으로 취소) */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "확인",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-sm rounded-xl border border-neutral-200 bg-background p-5 shadow-lg dark:border-neutral-800"
      >
        <h2 className="mb-1 text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mb-4 text-sm text-neutral-500">{description}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={`rounded px-3 py-1.5 text-sm font-medium text-white ${
              danger
                ? "bg-red-600 hover:bg-red-500"
                : "bg-blue-600 hover:bg-blue-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
