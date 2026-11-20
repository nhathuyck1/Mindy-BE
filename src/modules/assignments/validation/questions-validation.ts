import type { ValidationError } from 'class-validator';
import { ReplaceQuestionsInput } from '../dtos/assignment-input.dto.js';
import { AssignmentException } from '../exceptions/assignment.exceptions.js';

export interface QuestionFieldError {
  readonly path: string;
  readonly code: string;
}

/** Keep the existing global validation envelope for every other DTO. */
export function questionsValidationException(
  errors: ValidationError[],
): AssignmentException | undefined {
  if (!errors.some((error) => error.target instanceof ReplaceQuestionsInput)) return undefined;
  const fields: QuestionFieldError[] = [];
  function visit(items: ValidationError[], parent = ''): void {
    for (const error of items) {
      // Unknown field names and rejected values can themselves contain private content.
      const property = error.constraints?.whitelistValidation ? '$unknown' : error.property;
      const path = parent ? `${parent}.${property}` : property;
      for (const code of Object.keys(error.constraints ?? {})) fields.push({ path, code });
      visit(error.children ?? [], path);
    }
  }
  visit(errors);
  return new AssignmentException(422, 'INVALID_QUIZ_QUESTIONS', { fields });
}
