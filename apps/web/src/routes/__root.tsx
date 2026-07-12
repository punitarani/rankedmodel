import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

import { NotFound } from '#/components/shell/not-found'
import { Sidebar } from '#/components/shell/sidebar'
import { Topbar } from '#/components/shell/topbar'
import { catalogQueryOptions } from '#/lib/catalog'
import { THEME_INIT_SCRIPT } from '#/lib/theme'
import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'RankedModel — LLM rankings, benchmarks & hardware fit' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  // Every screen consumes the catalog (sidebar stats at minimum) — ensure it once here.
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQueryOptions),
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: () => (
    <div className="p-6">
      <NotFound />
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="p-6 py-16 text-center text-[13px] text-mut">
      Something went wrong: {error.message}
    </div>
  ),
})

function RootLayout() {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <Outlet />
      </main>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static pre-hydration theme script (D12) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[{ name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> }]}
        />
        <Scripts />
      </body>
    </html>
  )
}
