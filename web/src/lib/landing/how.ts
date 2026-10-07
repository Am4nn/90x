// The "How a day works" strip: three steps, one sentence each, no numbers.

export const HOW_TITLE = "How a day works.";
export const HOW_SUB = "Your day's work, planned for you.";

export interface HowStep {
  icon: "plan" | "grade" | "readiness";
  title: string;
  text: string;
}

export const HOW_STEPS: readonly HowStep[] = [
  {
    icon: "plan",
    title: "Today picks your missions.",
    text: "Each morning Today builds your session from your weakest areas and the reviews that are due.",
  },
  {
    icon: "grade",
    title: "You answer and get graded.",
    text: "Every card is checked the moment you answer, with the right answer and the reason behind it.",
  },
  {
    icon: "readiness",
    title: "Readiness moves.",
    text: "Readiness rises only for the work you did, and what you missed comes back before you forget it.",
  },
];
