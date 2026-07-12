import { queryOptions } from '@tanstack/react-query'
import { getModel } from '#/server/functions'

/** Deep model payload (C7: 1h staleTime; snapshot handles the shallow fields). */
export const modelQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ['model', slug],
    queryFn: () => getModel({ data: slug }),
    staleTime: 60 * 60 * 1000,
  })
