import { Link } from '@tanstack/react-router'

/** Design's not-found treatment, generalized (model detail's missing state). */
export function NotFound({ message = 'Page not found.' }: { message?: string }) {
  return (
    <div className="py-16 text-center text-[13px] text-mut">
      {message} <Link to="/">Back to dashboard</Link>
    </div>
  )
}
