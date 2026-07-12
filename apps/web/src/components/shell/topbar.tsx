import { useLocation } from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'
import { getTheme, toggleTheme } from '#/lib/theme'
import { TopbarSearch } from './topbar-search'

const TITLES: [prefix: string, title: string][] = [
  ['/rankings', 'Global Rankings'],
  ['/models/', 'Model'],
  ['/models', 'Model Explorer'],
  ['/compare', 'Compare'],
  ['/hardware', 'Hardware'],
  ['/benchmarks', 'Benchmarks'],
  ['/methodology', 'Methodology'],
  ['/organizations', 'Organization'],
  ['/families', 'Family'],
  ['/search', 'Search'],
  ['/saved', 'Saved comparisons'],
]

function pageTitle(pathname: string): string {
  return TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Dashboard'
}

// theme as an external store: identical 'dark' on server + first client render, real
// value after subscription — no hydration mismatch, no flash (class is set pre-paint).
let themeListeners: (() => void)[] = []
const subscribeTheme = (cb: () => void) => {
  themeListeners.push(cb)
  return () => {
    themeListeners = themeListeners.filter((l) => l !== cb)
  }
}

export function Topbar() {
  const { pathname } = useLocation()
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'dark' as const)

  return (
    <div className="sticky top-0 z-40 flex items-center gap-3.5 border-b border-border bg-bg px-6 py-2.5">
      <div
        className="whitespace-nowrap text-[13px] font-semibold tracking-[-0.01em]"
        data-testid="page-title"
      >
        {pageTitle(pathname)}
      </div>
      <TopbarSearch />
      <button
        type="button"
        onClick={() => {
          toggleTheme()
          for (const l of themeListeners) l()
        }}
        className="cursor-pointer whitespace-nowrap rounded-[7px] border border-border bg-panel2 px-[11px] py-1.5 text-[11.5px] text-mut hover:border-border2 hover:text-text"
        data-testid="theme-toggle"
      >
        {theme === 'dark' ? '◐ Light' : '◑ Dark'}
      </button>
    </div>
  )
}
