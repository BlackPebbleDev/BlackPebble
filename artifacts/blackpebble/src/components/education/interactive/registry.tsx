import { lazy, Suspense, type ComponentType } from "react";
import type { InteractiveModuleId } from "@/lib/education/types";

/**
 * Interactive-module registry. Content refers to an interactive lesson module by
 * a typed id; this registry maps that id to a lazily-loaded component so heavy
 * interactive UI never ships in the initial bundle. Future modules (slippage
 * simulator, liquidity-pool simulator, market-cap/FDV explorer, etc.) are added
 * here without changing lesson content or the lesson-page layout.
 *
 * Content data never stores executable component code — only a safe id.
 */
const MODULES: Record<InteractiveModuleId, ComponentType> = {
  "pnl-simulator": lazy(() =>
    import("./pnl-simulator").then((m) => ({ default: m.PnlSimulator })),
  ),
};

export function hasInteractiveModule(id: string): id is InteractiveModuleId {
  return Object.prototype.hasOwnProperty.call(MODULES, id);
}

export function InteractiveModule({ id }: { id: InteractiveModuleId }) {
  const Component = MODULES[id];
  if (!Component) return null;
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground">
          Loading interactive module…
        </div>
      }
    >
      <Component />
    </Suspense>
  );
}
