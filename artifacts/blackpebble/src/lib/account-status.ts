/**
 * Account status — ONE of three separate identity axes (see lib/tiers.ts for the
 * full model). This axis answers a single question: does this person have a
 * registered BlackPebble account?
 *
 *   - "guest"  — exploring without signing in (client-only, no server account)
 *   - "member" — a registered account (signed in with X)
 *
 * There is intentionally no paid/"Premium" status: membership is binary. The
 * single source of truth for the *current* viewer is `useAccount().isGuest`
 * (false ⇒ member). Any public user shown in the app necessarily has a profile,
 * so they are always a "member".
 */

export type AccountStatus = "guest" | "member";

export interface AccountStatusMeta {
  status: AccountStatus;
  label: string;
  description: string;
}

export const ACCOUNT_STATUS_META: Record<AccountStatus, AccountStatusMeta> = {
  guest: {
    status: "guest",
    label: "Guest",
    description: "Exploring without an account. Sign in with X to save progress.",
  },
  member: {
    status: "member",
    label: "Member",
    description: "Registered BlackPebble member.",
  },
};

/** Map the current viewer's guest flag to an account status. */
export function accountStatusFromGuest(isGuest: boolean): AccountStatus {
  return isGuest ? "guest" : "member";
}
