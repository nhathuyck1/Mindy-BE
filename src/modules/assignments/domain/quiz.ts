import { AssignmentException } from '../exceptions/assignment.exceptions.js';

export type OptionLabel = 'A' | 'B' | 'C' | 'D';
export interface QuizQuestion {
  readonly id: string;
  readonly position: number;
  readonly prompt: string;
  readonly options: readonly { readonly label: OptionLabel; readonly text: string }[];
}
export interface QuizAnswer {
  readonly questionId: string;
  readonly selectedOption: OptionLabel;
}
export interface QuizResult {
  readonly totalQuestions: number;
  readonly answeredCount: number;
  readonly correctCount: number;
  readonly wrongCount: number;
  readonly score: string;
  readonly maxScore: string;
  readonly results: readonly {
    readonly questionId: string;
    readonly selectedOption: OptionLabel | null;
    readonly correctOption: OptionLabel;
    readonly isCorrect: boolean;
  }[];
}

export function validateAnswers(
  questions: readonly QuizQuestion[],
  answers: readonly QuizAnswer[],
  complete: boolean,
): void {
  const ids = new Set(questions.map((q) => q.id));
  if (
    new Set(answers.map((a) => a.questionId)).size !== answers.length ||
    answers.some((a) => !ids.has(a.questionId) || !['A', 'B', 'C', 'D'].includes(a.selectedOption))
  )
    throw new AssignmentException(422, 'INVALID_QUIZ_ANSWERS');
  if (complete && answers.length !== questions.length)
    throw new AssignmentException(422, 'SUBMISSION_INCOMPLETE', {
      missingQuestionIds: questions
        .filter((q) => !answers.some((a) => a.questionId === q.id))
        .map((q) => q.id),
    });
}

export function quizExpiry(
  startedAt: Date,
  minutes: number | null,
  dueAt: Date | null,
): Date | null {
  const limits = [
    minutes === null ? null : startedAt.getTime() + minutes * 60000,
    dueAt?.getTime() ?? null,
  ].filter((n): n is number => n !== null);
  return limits.length ? new Date(Math.min(...limits)) : null;
}

export function gradeQuiz(
  questions: readonly QuizQuestion[],
  answers: readonly QuizAnswer[],
  keys: ReadonlyMap<string, OptionLabel>,
  maxScore: string,
): QuizResult {
  validateAnswers(questions, answers, false);
  if (!questions.length || questions.some((q) => !keys.has(q.id)))
    throw new Error('QUIZ_KEY_INVARIANT');
  const selected = new Map(answers.map((a) => [a.questionId, a.selectedOption]));
  const results = questions.map((q) => {
    const correctOption = keys.get(q.id);
    if (!correctOption) throw new Error('QUIZ_KEY_INVARIANT');
    const selectedOption = selected.get(q.id) ?? null;
    return {
      questionId: q.id,
      selectedOption,
      correctOption,
      isCorrect: selectedOption === correctOption,
    };
  });
  const correctCount = results.filter((r) => r.isCorrect).length;
  // Integer cents and rational rounding avoid binary floating point score drift.
  const [whole = '0', fraction = ''] = maxScore.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  const n = BigInt(questions.length);
  const score = (cents * BigInt(correctCount) * 2n + n) / (2n * n);
  return {
    totalQuestions: questions.length,
    answeredCount: answers.length,
    correctCount,
    wrongCount: questions.length - correctCount,
    score: `${score / 100n}.${String(score % 100n).padStart(2, '0')}`,
    maxScore,
    results,
  };
}
