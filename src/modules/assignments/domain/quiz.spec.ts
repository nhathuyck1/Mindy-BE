import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { gradeQuiz, type QuizQuestion, quizExpiry, validateAnswers } from './quiz.js';

const questions: QuizQuestion[] = Array.from({ length: 40 }, (_, i) => ({
  id: randomUUID(),
  position: i + 1,
  prompt: `Question ${i + 1}`,
  options: [
    { label: 'A', text: 'A' },
    { label: 'B', text: 'B' },
    { label: 'C', text: 'C' },
    { label: 'D', text: 'D' },
  ],
}));
describe('Quiz rules', () => {
  it('grades all 40 answers once, with 33 correct and decimal 82.50', () => {
    const answers = questions.map((q, i) => ({
      questionId: q.id,
      selectedOption: i < 33 ? ('A' as const) : ('B' as const),
    }));
    expect(
      gradeQuiz(questions, answers, new Map(questions.map((q) => [q.id, 'A'])), '100.00'),
    ).toMatchObject({
      totalQuestions: 40,
      answeredCount: 40,
      correctCount: 33,
      wrongCount: 7,
      score: '82.50',
    });
  });
  it('rejects incomplete manual submission but counts unanswered timeout questions as wrong', () => {
    expect(() => validateAnswers(questions, [], true)).toThrow();
    expect(
      gradeQuiz(questions, [], new Map(questions.map((q) => [q.id, 'A'])), '100.00'),
    ).toMatchObject({ correctCount: 0, wrongCount: 40, score: '0.00' });
  });
  it('rejects duplicates and foreign questions without returning keys', () => {
    const answer = { questionId: questions[0]?.id ?? '', selectedOption: 'A' as const };
    expect(() => validateAnswers(questions, [answer, answer], false)).toThrow();
    expect(() =>
      validateAnswers(questions, [{ ...answer, questionId: randomUUID() }], false),
    ).toThrow();
  });
  it('uses the earlier deadline or timer, with no artificial timer when disabled', () => {
    const start = new Date('2026-10-22T01:00:00Z');
    expect(quizExpiry(start, null, null)).toBeNull();
    expect(quizExpiry(start, 30, null)?.toISOString()).toBe('2026-10-22T01:30:00.000Z');
    expect(quizExpiry(start, 30, new Date('2026-10-22T01:10:00Z'))?.toISOString()).toBe(
      '2026-10-22T01:10:00.000Z',
    );
  });
  it('rounds rational cent scores only once including half cents', () => {
    const q = questions.slice(0, 2);
    expect(
      gradeQuiz(
        q,
        [{ questionId: q[0]?.id ?? '', selectedOption: 'A' }],
        new Map(q.map((v) => [v.id, 'A'])),
        '0.01',
      ).score,
    ).toBe('0.01');
  });
});
