/** Skeleton-route body used while screens land milestone by milestone. */
export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="animate-fadeup px-6 py-5 pb-10">
      <div className="text-lg font-semibold tracking-[-0.02em]">{title}</div>
      <div className="mt-0.5 text-xs text-mut">{note}</div>
      <div className="mt-4 grid max-w-3xl grid-cols-3 gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-[10px] border border-border bg-card" />
        ))}
      </div>
    </div>
  )
}
