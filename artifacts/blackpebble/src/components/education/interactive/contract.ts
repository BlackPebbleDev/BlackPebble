import type { NormalizedLesson } from "@/lib/education/normalize";
import type { InteractiveModuleId } from "@/lib/education/types";
import type { AcademySourceSurface } from "@/lib/analytics";

/**
 * Runtime contract passed to every interactive module. Modules are pure UI over
 * this contract: they receive lesson context and typed config, and communicate
 * back exclusively through the callbacks. This lets a module be reused across
 * lessons, embedded multiple times, or lifted into a standalone tool later
 * without changing its implementation.
 */

export type { AcademySourceSurface };

/** Guest/account progress for a single module instance. */
export interface InteractiveProgress {
  started: boolean;
  completed: boolean;
}

/** Lifecycle signal a module emits; the host maps these onto analytics. */
export type AcademyInteractiveEventType =
  | "started"
  | "interacted"
  | "completed"
  | "reset"
  | "practice";

export interface AcademyInteractiveEvent {
  type: AcademyInteractiveEventType;
  /** Non-sensitive, human-meaningful marker (e.g. which scenario/answer). */
  detail?: string;
}

export interface InteractiveCompletionResult {
  /** Free-form, non-sensitive completion classifier (e.g. "quiz", "interaction"). */
  completionType?: string;
}

export interface InteractiveModuleProps<TConfig = unknown> {
  lesson: NormalizedLesson;
  moduleId: InteractiveModuleId;
  config: TConfig;
  sourceSurface: AcademySourceSurface;
  progress?: InteractiveProgress;
  /** Emit a lifecycle signal. Host handles analytics + progress. */
  onEvent: (event: AcademyInteractiveEvent) => void;
  /** Mark the module meaningfully completed. */
  onComplete: (result?: InteractiveCompletionResult) => void;
  /** Optional reset hook (host may clear progress UI). */
  onReset?: () => void;
}
