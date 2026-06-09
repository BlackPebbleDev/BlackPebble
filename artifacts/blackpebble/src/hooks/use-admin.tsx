import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useXAuth } from "@/hooks/use-x-auth";

/**
 * Resolves whether the current X session belongs to an approved admin (gated
 * server-side by ADMIN_X_USER_IDS). Only queried once a user is signed in;
 * non-admins and guests resolve to false.
 */
export function useAdmin(): { isAdmin: boolean; loading: boolean } {
  const { loggedIn } = useXAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-me", loggedIn],
    queryFn: () => api.admin.me(),
    enabled: loggedIn,
    staleTime: 60_000,
  });
  return { isAdmin: !!data?.admin, loading: loggedIn ? isLoading : false };
}
