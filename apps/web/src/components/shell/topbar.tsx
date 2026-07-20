import { useLocation } from '@tanstack/react-router'
import { SidebarTrigger } from '#/components/ui/sidebar'
import { ThemeToggle } from './theme-toggle'
import { TopbarSearch } from './topbar-search'

const TITLES: [prefix: string, title: string][] = [
  ['/rankings', 'Global Rankings'],
  ['/models/', 'Model'],
  ['/models', 'Model Explorer'],
  ['/compare', 'Compare'],
  ['/hardware', 'Hardware'],
  ['/finetune', 'Fine-tune'],
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

export function Topbar() {
  const { pathname } = useLocation()

  return (
    <div className="sticky top-0 z-40 flex items-center gap-3.5 border-b border-border bg-bg px-6 py-2.5">
      {/* Mobile-only: opens the off-canvas nav drawer. Hidden on desktop where the sidebar is persistent. */}
      <SidebarTrigger
        className="-ml-2 -mr-0.5 shrink-0 text-mut md:hidden"
        aria-label="Open navigation"
      />
      <div
        className="whitespace-nowrap text-[13px] font-semibold tracking-[-0.01em]"
        data-testid="page-title"
      >
        {pageTitle(pathname)}
      </div>
      <TopbarSearch />
      {/* Desktop only: on mobile the theme toggle lives at the bottom of the sidebar drawer, so the
          mobile topbar is just the menu icon, the page title, and the search. */}
      <ThemeToggle className="hidden md:inline-flex" testId="theme-toggle" />
    </div>
  )
}
