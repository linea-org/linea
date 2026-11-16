import { MutationCache, QueryClient } from "@tanstack/react-query"

import { requestStepUp } from "@/components/account/step-up-store"

import { STEP_UP_REQUIRED_MESSAGE } from "./step-up-message"

export function createQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => {
        if (error.message === STEP_UP_REQUIRED_MESSAGE) requestStepUp()
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}
