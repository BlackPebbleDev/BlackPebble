export type CalloutType =
  | "why"
  | "safety"
  | "example"
  | "beginner"
  | "advanced";

export type LessonDifficulty = "beginner" | "intermediate" | "advanced";

export interface LessonRelated {
  label: string;
  path: string;
}

export interface LessonCallout {
  type: CalloutType;
  text: string;
}

/** One compact academy lesson. Deep-linkable via slug at /learn#slug */
export interface AcademyLesson {
  slug: string;
  title: string;
  aliases?: string[];
  keywords?: string[];
  difficulty?: LessonDifficulty;
  what: string;
  why: string;
  example?: string;
  related?: LessonRelated;
  callout?: LessonCallout;
}

export type CategoryIcon =
  | "compass"
  | "trending"
  | "bar-chart"
  | "shield"
  | "link"
  | "wallet"
  | "rocket"
  | "alert"
  | "sparkles"
  | "users"
  | "hand-coins"
  | "message";

export interface AcademyCategory {
  id: string;
  title: string;
  icon: CategoryIcon;
  lessons: AcademyLesson[];
}
