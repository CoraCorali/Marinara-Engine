// ──────────────────────────────────────────────
// Fork: which model each side job uses (React Query)
// ──────────────────────────────────────────────
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../lib/api-client";
import { translate } from "../localization/i18n";

/** The fork's side jobs that can run on a model of their own; "" keeps the job's usual one. */
export const FORK_JOBS = ["director", "chapters", "phone", "season", "describe"] as const;
export type ForkJob = (typeof FORK_JOBS)[number];
export type ForkJobModels = Record<ForkJob, string>;

const KEY = ["fork-job-models"] as const;

export function useForkJobModels() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<{ models: ForkJobModels }>("/fork-director/job-models")).models,
    staleTime: 60_000,
  });
}

export function useSetForkJobModels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (models: ForkJobModels) =>
      (await api.put<{ models: ForkJobModels }>("/fork-director/job-models", { models })).models,
    onSuccess: (models) => queryClient.setQueryData(KEY, models),
    onError: (error) => {
      toast.error(
        error instanceof Error && error.message ? error.message : translate("ui.chat.forkjobs.couldNotSave"),
        {
          id: "fork-job-models-save",
        },
      );
    },
  });
}
