import { useCallback, useRef } from "react";
import type { InteractiveModuleProps } from "../contract";

/**
 * Standard "first meaningful interaction" hook for calculator modules. Fires the
 * `interacted` event and marks completion exactly once, so the host records a
 * started + completed signal and guest progress the first time a user engages.
 */
export function useModuleInteraction(
  props: Pick<InteractiveModuleProps, "onEvent" | "onComplete">,
  completionType = "interaction",
): () => void {
  const done = useRef(false);
  const { onEvent, onComplete } = props;
  return useCallback(() => {
    if (done.current) return;
    done.current = true;
    onEvent({ type: "interacted" });
    onComplete({ completionType });
  }, [onEvent, onComplete, completionType]);
}
