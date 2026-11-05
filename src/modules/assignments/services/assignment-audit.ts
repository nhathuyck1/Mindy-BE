import type { EntityManager } from 'typeorm';

/** Assignment events share the system's append-only audit store. */
export async function writeAssignmentAudit(
  m: EntityManager,
  source: 'assignment_audits' | 'assignment_zip_audits',
  assignmentId: string,
  actorId: string | null,
  action: string,
  version: number,
  reason: string | null = null,
  submissionId: string | null = null,
  gradeId: string | null = null,
): Promise<void> {
  await m.query(
    `WITH event AS (SELECT gen_random_uuid() AS id,clock_timestamp() AS created_at)
    INSERT INTO audit_events(source,id,actor_id,occurred_at,data)
    SELECT $1,id,$3::uuid,created_at,jsonb_build_object(
      'id',id,'assignment_id',$2::uuid,'actor_id',$3::uuid,'action',$4::text,
      'version',$5::integer,'reason',$6::text,'submission_id',$7::uuid,
      'grade_id',$8::uuid,'created_at',created_at) FROM event`,
    [source, assignmentId, actorId, action, version, reason, submissionId, gradeId],
  );
}
