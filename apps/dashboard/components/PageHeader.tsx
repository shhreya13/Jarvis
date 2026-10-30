import type { ReactNode } from "react";

export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="fade-up mb-8 flex items-end justify-between gap-4">
      <div>
        <h1 className="page-title">{title}</h1>
        {meta ? <div className="mt-1 text-[13px] text-ink-60">{meta}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
