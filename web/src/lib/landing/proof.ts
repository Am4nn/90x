// The numbers on the landing page's proof strip, in one place. True numbers only:
// nothing about who uses it or what they think. 3,693 and 273 are the Library's size and 44 the
// number of public sources the lessons are grounded in; PRODUCT.md states all three
// and proof.test.ts checks. Update them here and nowhere else.

export const PROOF_COUNTS = { problems: 3693, lessons: 273, sources: 44 } as const;

export const REPO_URL = "https://github.com/Am4nn/90x";

export interface ProofItem {
  value: string;
  label: string;
  href?: string;
}

const count = (n: number) => n.toLocaleString("en-US");

export const PROOF_ITEMS: readonly ProofItem[] = [
  { value: count(PROOF_COUNTS.problems), label: "problems" },
  { value: count(PROOF_COUNTS.lessons), label: "lessons" },
  { value: count(PROOF_COUNTS.sources), label: "sources" },
  { value: "Code", label: "on GitHub, MIT", href: REPO_URL },
];
