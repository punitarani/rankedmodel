import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { catalogQueryOptions } from '#/lib/catalog'

/**
 * Fixed sidebar per the design (210px, λ mark, mono icons, footer stats) with the D16
 * nav extension: the design's four items plus Hardware / Benchmarks / Methodology.
 */
const NAV: { label: string; to: string; icon: string; exact?: boolean }[] = [
  { label: 'Dashboard', to: '/', icon: '◧', exact: true },
  { label: 'Rankings', to: '/rankings', icon: '↕' },
  { label: 'Model Explorer', to: '/models', icon: '▤' },
  { label: 'Compare', to: '/compare', icon: '⇄' },
  { label: 'Hardware', to: '/hardware', icon: '⌗' },
  { label: 'Benchmarks', to: '/benchmarks', icon: '◫' },
  { label: 'Methodology', to: '/methodology', icon: '§' },
]

export function Sidebar() {
  const { data } = useSuspenseQuery(catalogQueryOptions)
  const orgCount = new Set(data.models.map((m) => m.orgSlug)).size

  return (
    <aside className="sticky top-0 flex h-screen w-[210px] flex-none flex-col border-r border-border bg-panel">
      <Link to="/" className="flex items-center gap-[9px] px-4 pt-4 pb-3.5 text-text no-underline">
        <span className="flex size-[22px] items-center justify-center rounded-md bg-acc font-mono text-[11px] font-semibold text-[#0b0b0d]">
          λ
        </span>
        <span className="text-sm font-semibold tracking-[-0.01em]">RankedModel</span>
      </Link>
      <nav className="flex flex-col gap-px px-2 py-0.5">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact ?? false }}
            className="flex items-center gap-2 rounded-md px-2.5 py-[7px] text-[13px] text-mut no-underline hover:bg-hover hover:no-underline"
            activeProps={{
              className: 'bg-panel2 font-semibold text-text',
            }}
          >
            {({ isActive }) => (
              <>
                <span
                  className={`w-3.5 font-mono text-[11px] ${isActive ? 'text-acc' : 'text-dim'}`}
                >
                  {item.icon}
                </span>
                {item.label}
              </>
            )}
          </Link>
        ))}
      </nav>
      <div className="mt-auto border-t border-border px-4 py-3.5">
        <div className="font-mono text-[10px] leading-relaxed text-dim" data-testid="footer-stats">
          {data.models.length} models · {orgCount} orgs
          <br />
          snapshot v{data.version} · {data.asOf}
        </div>
        <div className="mt-1.5 text-[10px] leading-normal text-dim">
          Curated dataset — numbers are point-in-time approximations, not live feeds.
        </div>
      </div>
    </aside>
  )
}
