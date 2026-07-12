import { createServerFn } from '@tanstack/react-start'

/**
 * Server-function boundary. Implementations live in sibling modules that import
 * `cloudflare:workers` and are pulled in via dynamic import INSIDE the handler — after
 * client-side stubbing nothing references them, so worker-only modules never reach the
 * client bundle (the client build fails loudly otherwise).
 */
export const getCatalog = createServerFn().handler(async () => {
  const { loadCatalog } = await import('./catalog')
  return loadCatalog()
})

export const getModel = createServerFn()
  .inputValidator((slug: unknown) => {
    if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error('invalid model slug')
    }
    return slug
  })
  .handler(async ({ data }) => {
    const { loadModel } = await import('./model')
    return loadModel(data)
  })
