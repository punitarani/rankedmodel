import { Link, useLocation } from '@tanstack/react-router'
import {
  BookOpenText,
  BrainCircuit,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  ListOrdered,
  type LucideIcon,
  MemoryStick,
  SlidersHorizontal,
} from 'lucide-react'
import { useEffect } from 'react'
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  Sidebar as SidebarRoot,
  useSidebar,
} from '#/components/ui/sidebar'
import { BrandMark } from './logo'
import { ThemeToggle } from './theme-toggle'

/**
 * Fixed sidebar per the design (210px, brand mark, mono icons) with the D16 nav
 * extension: the design's four items plus Hardware / Benchmarks / Methodology.
 */
const NAV: { label: string; to: string; icon: LucideIcon; exact?: boolean }[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, exact: true },
  { label: 'Rankings', to: '/rankings', icon: ListOrdered },
  { label: 'Model Explorer', to: '/models', icon: BrainCircuit },
  { label: 'Compare', to: '/compare', icon: GitCompareArrows },
  { label: 'Hardware', to: '/hardware', icon: MemoryStick },
  { label: 'Fine-tune', to: '/finetune', icon: SlidersHorizontal },
  { label: 'Benchmarks', to: '/benchmarks', icon: FlaskConical },
  { label: 'Methodology', to: '/methodology', icon: BookOpenText },
]

/**
 * Wraps the shadcn Sidebar system: on desktop (≥md) it renders a static, in-flow
 * `<aside>` (collapsible="none" — identical to the previous design); below md it
 * becomes an off-canvas Sheet drawer, closed by default and toggled from the topbar.
 * `isMobile` is false during SSR / first client render, so the desktop layout is what
 * gets server-rendered (no hydration mismatch); `hidden md:flex` keeps the static aside
 * out of the mobile paint so phones never flash the full sidebar before the drawer takes over.
 */
export function Sidebar() {
  const { isMobile, setOpenMobile } = useSidebar()
  const { pathname } = useLocation()

  // Close the mobile drawer whenever the route changes — one place covers nav links, the brand
  // link, and browser back/forward. `pathname` is an intentional trigger dependency even though
  // the body doesn't read it. No-op on desktop (the drawer isn't mounted there).
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger, by design.
  useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])

  return (
    <SidebarRoot
      collapsible={isMobile ? 'offcanvas' : 'none'}
      className="hidden flex-none border-r border-sidebar-border md:flex md:sticky md:top-0 md:h-screen"
    >
      <SidebarHeader className="p-0">
        <Link
          to="/"
          className="flex items-center gap-[9px] px-4 pt-4 pb-3.5 text-text no-underline"
        >
          <span className="flex size-[22px] items-center justify-center rounded-md bg-acc text-[#0b0b0d]">
            <BrandMark className="w-[13px]" />
          </span>
          <span className="text-sm font-semibold tracking-[-0.01em]">Model Beats</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="gap-px px-2 py-0.5">
          {NAV.map((item) => (
            <SidebarMenuItem key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: item.exact ?? false }}
                className="flex items-center gap-2 rounded-md px-2.5 py-[7px] text-[13px] text-mut no-underline hover:bg-hover hover:no-underline"
                activeProps={{
                  className: 'bg-panel2 font-semibold text-text',
                }}
              >
                {({ isActive }) => {
                  const Icon = item.icon

                  return (
                    <>
                      <span
                        className={`w-3.5 font-mono text-[11px] ${isActive ? 'text-acc' : 'text-dim'}`}
                      >
                        <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
                      </span>
                      {item.label}
                    </>
                  )
                }}
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      {/* Mobile only: the theme toggle sits at the bottom of the drawer. On desktop it stays in the
          topbar (this footer is display:none there). A distinct testId avoids colliding with the
          topbar toggle's `theme-toggle` in the e2e strict-mode selector. */}
      <SidebarFooter className="mt-auto border-t border-sidebar-border md:hidden">
        <ThemeToggle variant="nav" testId="theme-toggle-sidebar" />
      </SidebarFooter>
    </SidebarRoot>
  )
}
