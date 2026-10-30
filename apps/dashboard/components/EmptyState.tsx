export function EmptyState({ glyph, message }: { glyph: string; message: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5 py-6">
      <span aria-hidden="true" className="font-mono text-2xl text-ink-60">
        {glyph}
      </span>
      <p className="text-[13px] text-ink-60">{message}</p>
    </div>
  );
}
