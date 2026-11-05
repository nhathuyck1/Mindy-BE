import { ConsolidateTracking1792627200002 } from '../../src/database/migrations/1792627200002-consolidate-tracking.js';
import { AssignmentsQuiz1792713600000 } from '../../src/database/migrations/1792713600000-assignments-quiz.js';
import { AssignmentZip1793577600000 } from '../../src/database/migrations/1793577600000-assignment-zip.js';
import { ConsolidateAssignments1793836800002 } from '../../src/database/migrations/1793836800002-consolidate-assignments.js';

export const ASSIGNMENT_MIGRATIONS = [
  ConsolidateTracking1792627200002,
  AssignmentsQuiz1792713600000,
  AssignmentZip1793577600000,
  ConsolidateAssignments1793836800002,
];
