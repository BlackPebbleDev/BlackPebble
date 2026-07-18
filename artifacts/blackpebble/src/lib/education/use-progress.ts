import { useSyncExternalStore } from "react";
import { academyProgress, type ProgressService } from "./progress";

/**
 * Subscribe a component to Academy progress. Returns the shared service; the
 * hook re-renders on any mutation via a monotonic snapshot token so callers can
 * read fresh values through the service methods.
 */
export function useAcademyProgress(): ProgressService {
  useSyncExternalStore(
    (cb) => academyProgress.subscribe(cb),
    () => academyProgress.getSnapshotToken(),
    () => academyProgress.getSnapshotToken(),
  );
  return academyProgress;
}
