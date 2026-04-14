import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/services/api/settings";
import { toast } from "@/store/useUIStore";

export function useSystemSettings() {
  return useQuery({
    queryKey: ["system-settings"],
    queryFn: () => settingsApi.getAll(),
    staleTime: 30_000,
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      settingsApi.update(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast.success("Setting saved", "Your changes have been saved.");
    },
    onError: () => {
      toast.error("Save failed", "Could not save the setting. Please try again.");
    },
  });
}
