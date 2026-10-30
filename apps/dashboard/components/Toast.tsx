"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ToastState {
  kind: "success" | "error";
  message: string;
}

const TOAST_MS = 3500;

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((kind: ToastState["kind"], message: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ kind, message });
    timerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { toast, show };
}

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      className={`slide-in fixed bottom-6 right-6 z-40 border px-4 py-2.5 text-[13px] font-medium ${
        toast.kind === "success"
          ? "border-moss bg-paper text-moss"
          : "border-signal bg-paper text-signal"
      }`}
    >
      {toast.message}
    </div>
  );
}
