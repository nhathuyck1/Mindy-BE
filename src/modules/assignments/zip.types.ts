export interface ZipSnapshot {
  title: string;
  description: string;
  maxScore: string;
  dueAt: string;
  instructionFiles: InstructionFile[];
}
export interface InstructionFile {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  position: number;
}
export interface ZipRow {
  id: string;
  assignment_id: string;
  student_id: string;
  enrollment_id: string;
  status: 'DRAFT' | 'SUBMITTED' | 'VOIDED';
  attempt_number: number | null;
  version: number;
  assignment_revision: number | null;
  assignment_snapshot: ZipSnapshot | null;
  submitted_at: Date | null;
  created_at: Date;
}
export interface AssignmentFileRow {
  version: number;
  id: string;
  assignment_id: string;
  owner_user_id: string;
  zip_submission_id: string | null;
  purpose: 'INSTRUCTION' | 'SUBMISSION';
  original_name: string;
  declared_mime_type: string;
  declared_size_bytes: number;
  bucket: string;
  staging_key: string;
  staging_version_id: string | null;
  object_key: string | null;
  object_version_id: string | null;
  status: 'PENDING_UPLOAD' | 'PROCESSING' | 'READY' | 'FAILED' | 'DELETING' | 'DELETED';
  intent_expires_at: Date;
  ready_at: Date | null;
  error_code: string | null;
}
export interface AssignmentFileJob {
  id: string;
  file_id: string;
  kind: 'VALIDATE' | 'CLEANUP';
  attempts: number;
  lease_token: string;
}
export interface GradeRevision {
  version: number;
  score: string;
  feedback: string;
  actorId: string;
  reason: string | null;
  createdAt: Date;
}
export interface ZipView {
  type: 'ZIP';
  id: string;
  assignmentId: string;
  studentId: string;
  status: ZipRow['status'];
  version: number;
  attemptNumber: number | null;
  submittedAt: Date | null;
  snapshot: ZipSnapshot | null;
  file: { id: string; originalFilename: string; mimeType: string; sizeBytes: number } | null;
  grade: { version: number; score: string; feedback: string } | null;
  gradeVersion?: number;
  releasedVersion?: number | null;
}
