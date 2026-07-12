import { Link, type LinkProps, useCanGoBack, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'

interface BackLinkProps {
  to: LinkProps['to']
  params?: LinkProps['params']
  /** Where the static link points when there is no in-app history (direct
   *  load, crawler) — e.g. "Model explorer". */
  fallbackLabel: ReactNode
}

/**
 * Detail-page back affordance. With in-app history it behaves like the browser
 * back button — returning to the true origin (dashboard chart, filtered
 * rankings, compare…) with its URL state intact — and labels itself "Back".
 * On a direct load it is a plain link to the parent listing, which is also
 * what crawlers see in the SSR'd HTML.
 */
export function BackLink({ to, params, fallbackLabel }: BackLinkProps) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  return (
    <Link
      to={to}
      params={params}
      className="text-[11.5px] text-mut hover:text-text"
      onClick={(e) => {
        if (canGoBack) {
          e.preventDefault()
          router.history.back()
        }
      }}
    >
      ← {canGoBack ? 'Back' : fallbackLabel}
    </Link>
  )
}
