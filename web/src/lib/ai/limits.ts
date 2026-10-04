// The most one model call may write, per kind of call. Without a limit a single call is
// bounded only by the model, so a prompt that coaxes a very long answer costs whatever the
// model decides. The numbers are about twice the largest output seen in production
// (2026-10-04: chat 2,369, review 1,359, lesson 722, mock score 382, grade 502, memory 671,
// weekly 335, counting any hidden thinking the provider bills as output), so normal use never
// reaches them and a runaway call stops there. A call that hits its limit fails like any other
// invalid output: the caller retries once or reports unavailable.

export const OUTPUT_TOKENS = {
  chat: 4000,
  review: 3000,
  lesson: 4000,
  lessonCheck: 2500,
  mockScore: 1500,
  weekly: 1500,
  memory: 1500,
  grade: 1000,
} as const;
