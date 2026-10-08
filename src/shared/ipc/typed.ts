export type InvokeFn<C extends Record<string, { req: unknown; res: unknown }>> = <
  K extends keyof C & string
>(
  channel: K,
  ...args: C[K]['req'] extends void ? [] : [C[K]['req']]
) => Promise<C[K]['res']>

export type ListenFn<E extends Record<string, unknown>> = <K extends keyof E & string>(
  channel: K,
  listener: (data: E[K]) => void
) => () => void
