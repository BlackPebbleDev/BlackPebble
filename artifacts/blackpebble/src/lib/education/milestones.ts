import type { AcademyProgressSummary } from "./progress";

/**
 * Academy milestones celebrate *real* understanding, not vanity badges. Each
 * milestone maps to a genuine learning action (finishing a lesson, trying an
 * interactive, passing a knowledge check, completing the guided path). Pure and
 * data-driven so it can be unit tested and reused on the home + journey surfaces.
 */
export interface MilestoneInput {
  summary: AcademyProgressSummary;
  /** 0–100 completion of the primary beginner path, if known. */
  pathPct?: number;
  pathComplete?: boolean;
}

export interface Milestone {
  id: string;
  label: string;
  description: string;
  done: boolean;
  /** True for the first not-yet-done milestone (the natural next goal). */
  next: boolean;
}

export function computeMilestones(input: MilestoneInput): Milestone[] {
  const { summary, pathPct = 0, pathComplete = false } = input;
  const raw: Omit<Milestone, "next">[] = [
    {
      id: "first-lesson",
      label: "First lesson opened",
      description: "You started learning.",
      done: summary.lessonsViewed >= 1,
    },
    {
      id: "first-complete",
      label: "First lesson completed",
      description: "You finished a full lesson.",
      done: summary.lessonsCompleted >= 1,
    },
    {
      id: "first-interactive",
      label: "First interactive tried",
      description: "You learned by doing, not just reading.",
      done: summary.interactivesCompleted >= 1,
    },
    {
      id: "first-quiz",
      label: "First knowledge check passed",
      description: "You checked your own understanding.",
      done: summary.quizzesCompleted >= 1,
    },
    {
      id: "five-lessons",
      label: "Five lessons completed",
      description: "You're building real momentum.",
      done: summary.lessonsCompleted >= 5,
    },
    {
      id: "path-half",
      label: "Halfway through the essentials",
      description: "You're over the hump.",
      done: pathPct >= 50,
    },
    {
      id: "path-complete",
      label: "Beginner Essentials complete",
      description: "You understand the fundamentals.",
      done: pathComplete || pathPct >= 100,
    },
  ];

  const firstUndone = raw.findIndex((m) => !m.done);
  return raw.map((m, i) => ({ ...m, next: i === firstUndone }));
}

export function milestonesEarned(milestones: Milestone[]): number {
  return milestones.filter((m) => m.done).length;
}
