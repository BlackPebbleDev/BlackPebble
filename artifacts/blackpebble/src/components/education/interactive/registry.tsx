import {
  lazy,
  Suspense,
  useMemo,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import type {
  AcademyInteractiveModuleRef,
  InteractiveModuleId,
} from "@/lib/education/types";
import type { NormalizedLesson } from "@/lib/education/normalize";
import { ErrorBoundary } from "@/components/error-boundary";
import { academyProgress } from "@/lib/education/progress";
import {
  trackAcademyInteractiveStarted,
  trackAcademyInteractiveCompleted,
  trackAcademyPracticeStarted,
  type AcademySourceSurface,
} from "@/lib/analytics";
import type {
  AcademyInteractiveEvent,
  InteractiveCompletionResult,
  InteractiveModuleProps,
} from "./contract";

/**
 * Interactive-module registry. Lesson content refers to interactive UI by a
 * typed id; this registry maps that id to a lazily-loaded component so heavy
 * interactive code is code-split out of the initial bundle. Content data never
 * stores executable component code — only a safe id + serializable config.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ModuleComponent = LazyExoticComponent<ComponentType<InteractiveModuleProps<any>>>;

const MODULES: Record<InteractiveModuleId, ModuleComponent> = {
  "pnl-simulator": lazy(() =>
    import("./modules/pnl-simulator").then((m) => ({ default: m.PnlSimulator })),
  ),
  "market-cap-calculator": lazy(() =>
    import("./modules/market-cap-calculator").then((m) => ({
      default: m.MarketCapCalculator,
    })),
  ),
  "market-cap-fdv-simulator": lazy(() =>
    import("./modules/market-cap-fdv-simulator").then((m) => ({
      default: m.MarketCapFdvSimulator,
    })),
  ),
  "liquidity-price-impact-simulator": lazy(() =>
    import("./modules/liquidity-price-impact-simulator").then((m) => ({
      default: m.LiquidityPriceImpactSimulator,
    })),
  ),
  "slippage-simulator": lazy(() =>
    import("./modules/slippage-simulator").then((m) => ({
      default: m.SlippageSimulator,
    })),
  ),
  "order-type-challenge": lazy(() =>
    import("./modules/order-type-challenge").then((m) => ({
      default: m.OrderTypeChallenge,
    })),
  ),
  "stop-loss-take-profit-planner": lazy(() =>
    import("./modules/stop-loss-take-profit-planner").then((m) => ({
      default: m.StopLossTakeProfitPlanner,
    })),
  ),
  "position-size-calculator": lazy(() =>
    import("./modules/position-size-calculator").then((m) => ({
      default: m.PositionSizeCalculator,
    })),
  ),
  "wallet-signing-challenge": lazy(() =>
    import("./modules/wallet-signing-challenge").then((m) => ({
      default: m.WalletSigningChallenge,
    })),
  ),
  "seed-phrase-safety-exercise": lazy(() =>
    import("./modules/seed-phrase-safety-exercise").then((m) => ({
      default: m.SeedPhraseSafetyExercise,
    })),
  ),
  "holder-concentration-explorer": lazy(() =>
    import("./modules/holder-concentration-explorer").then((m) => ({
      default: m.HolderConcentrationExplorer,
    })),
  ),
  "memecoin-launch-lifecycle": lazy(() =>
    import("./modules/memecoin-launch-lifecycle").then((m) => ({
      default: m.MemecoinLaunchLifecycle,
    })),
  ),
  "bonding-curve-simulator": lazy(() =>
    import("./modules/bonding-curve-simulator").then((m) => ({
      default: m.BondingCurveSimulator,
    })),
  ),
  "rug-pull-scenario": lazy(() =>
    import("./modules/rug-pull-scenario").then((m) => ({
      default: m.RugPullScenario,
    })),
  ),
  "trading-psychology-scenarios": lazy(() =>
    import("./modules/trading-psychology-scenarios").then((m) => ({
      default: m.TradingPsychologyScenarios,
    })),
  ),
};

export function hasInteractiveModule(id: string): id is InteractiveModuleId {
  return Object.prototype.hasOwnProperty.call(MODULES, id);
}

export function interactiveModuleIds(): InteractiveModuleId[] {
  return Object.keys(MODULES) as InteractiveModuleId[];
}

/**
 * Host for a single interactive module. Resolves the component, delivers the
 * runtime contract (lesson context, config, callbacks), and maps lifecycle
 * events onto analytics + guest progress. Failures are caught locally so a
 * broken module never takes down the lesson page.
 */
export function InteractiveModuleHost({
  lesson,
  moduleRef,
  sourceSurface = "lesson-page",
}: {
  lesson: NormalizedLesson;
  moduleRef: AcademyInteractiveModuleRef;
  sourceSurface?: AcademySourceSurface;
}) {
  const { id } = moduleRef;
  const Component = hasInteractiveModule(id) ? MODULES[id] : null;

  const progress = useMemo(
    () => ({
      started: false,
      completed: academyProgress.isInteractiveCompleted(lesson.slug, id),
    }),
    [lesson.slug, id],
  );

  if (!Component) return null;

  const baseProps = {
    lessonSlug: lesson.slug,
    categoryId: lesson.categoryId,
    moduleId: id,
    chainScope: lesson.chainScope,
    sourceSurface,
  };

  function handleEvent(event: AcademyInteractiveEvent) {
    if (event.type === "started" || event.type === "interacted") {
      trackAcademyInteractiveStarted(baseProps);
    } else if (event.type === "practice") {
      trackAcademyPracticeStarted(baseProps);
    }
  }

  function handleComplete(result?: InteractiveCompletionResult) {
    academyProgress.markInteractiveCompleted(lesson.slug, id);
    trackAcademyInteractiveCompleted({
      ...baseProps,
      completionType: result?.completionType ?? "interaction",
    });
  }

  return (
    <ErrorBoundary
      title="This interactive could not load"
      description="The lesson content is still available above. You can retry the interactive below."
    >
      <Suspense
        fallback={
          <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground">
            Loading interactive module…
          </div>
        }
      >
        <Component
          lesson={lesson}
          moduleId={id}
          config={moduleRef.config ?? {}}
          sourceSurface={sourceSurface}
          progress={progress}
          onEvent={handleEvent}
          onComplete={handleComplete}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
