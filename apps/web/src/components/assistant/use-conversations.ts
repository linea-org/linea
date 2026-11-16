import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

import {
  assistantConversationsQueryOptions,
  deleteAssistantConversationFn,
  setAssistantConversationPinnedFn,
} from "@/lib/assistant-api"

export function useConversations(
  slug: string,
  workflowId: string | null,
  onDeleted: (id: string) => void
) {
  const queryClient = useQueryClient()
  const options = assistantConversationsQueryOptions(slug, workflowId)
  const list = useInfiniteQuery(options)
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: options.queryKey })
  const remove = useMutation({
    mutationFn: (id: string) => deleteAssistantConversationFn({ data: { id } }),
    onSuccess: async (_result, id) => {
      await refresh()
      onDeleted(id)
    },
  })
  const pin = useMutation({
    mutationFn: (input: { id: string; pinned: boolean }) =>
      setAssistantConversationPinnedFn({ data: input }),
    onSuccess: refresh,
  })
  return {
    // Pinned chats arrive with the first page only.
    pinned: list.data?.pages[0]?.pinned ?? [],
    recent: list.data?.pages.flatMap((page) => page.items) ?? [],
    error: list.error,
    loadMore: () => void list.fetchNextPage(),
    hasMore: list.hasNextPage && !list.isFetchingNextPage,
    remove,
    pin,
  }
}
