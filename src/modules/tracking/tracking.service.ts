import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource } from 'typeorm';
import { AppHttpException } from '../../common/http/app-http.exception.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { UserRole } from '../users/user-role.enum.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { UsersService } from '../users/users.service.js';
import type {
  TrackingDetailDto,
  TrackingEventDto,
  TrackingPageDto,
  TrackingQueryDto,
} from './tracking.dto.js';

const NORMALIZED = `WITH raw_events AS (
  SELECT source,id,actor_id,occurred_at,data FROM audit_events
  UNION ALL SELECT 'attendance_recovery_audits',id,actor_id,occurred_at,to_jsonb(r) FROM attendance_recovery_audits r
), events AS (
  SELECT e.source,e.id,e.actor_id,e.occurred_at,e.data,
    COALESCE(e.data->>'action',CASE e.source WHEN 'session_lifecycle_audits' THEN 'STATUS_CHANGE'
      WHEN 'teaching_note_audits' THEN 'UPDATE_NOTE' WHEN 'teaching_assignment_audits' THEN 'ASSIGN_MENTOR'
      WHEN 'mentor_leave_audits' THEN 'LEAVE_UPDATE' WHEN 'makeup_placement_audits' THEN 'PLACEMENT_STATUS_CHANGE'
      WHEN 'class_unit_release_audit' THEN 'LEGACY_UNIT_RELEASE' WHEN 'attendance_recovery_audits' THEN 'RECOVER' ELSE 'UPDATE' END) AS action,
    CASE WHEN e.source='material_audit_events' THEN 'material'
      WHEN e.source='attendance_audits' THEN 'attendance'
      WHEN e.source='guest_attendance_audits' THEN 'guest_attendance'
      WHEN e.source='makeup_placement_audits' THEN 'makeup_placement'
      WHEN e.source='mentor_leave_audits' THEN 'mentor_leave_request'
      WHEN e.source='class_unit_release_audit' THEN 'class_unit'
      WHEN e.source='teaching_assignment_audits' AND e.data->>'session_id' IS NULL THEN 'class'
      ELSE 'session' END AS entity_type,
    COALESCE((e.data->>'material_id')::uuid,(e.data->>'attendance_id')::uuid,
      (e.data->>'placement_id')::uuid,(e.data->>'request_id')::uuid,
      (e.data->>'class_unit_id')::uuid,(e.data->>'session_id')::uuid,(e.data->>'class_id')::uuid) AS entity_id,
    COALESCE((e.data->>'class_id')::uuid,u.class_id,material.created_in_class_id) AS class_id,
    s.id AS session_id,
    COALESCE((e.data->>'version')::integer,(e.data->>'revision')::integer) AS version,
    e.data->>'reason' AS reason
  FROM raw_events e
  LEFT JOIN attendance_records a ON e.source='attendance_audits' AND a.id=(e.data->>'attendance_id')::uuid
  LEFT JOIN guest_attendance_records g ON e.source='guest_attendance_audits' AND g.id=(e.data->>'attendance_id')::uuid
  LEFT JOIN makeup_placements p ON e.source='makeup_placement_audits' AND p.id=(e.data->>'placement_id')::uuid
  LEFT JOIN class_sessions s ON s.id=COALESCE((e.data->>'session_id')::uuid,a.session_id,g.session_id,p.target_session_id)
  LEFT JOIN class_units u ON u.id=s.class_unit_id
  LEFT JOIN materials material ON e.source='material_audit_events' AND material.id=(e.data->>'material_id')::uuid
)`;
const FIELDS = `e.id,e.source,e.action,CASE WHEN e.actor_id IS NULL THEN NULL ELSE jsonb_build_object('id',e.actor_id,'displayName',actor.display_name) END AS actor,
  e.entity_type AS "entityType",e.entity_id AS "entityId",e.class_id AS "classId",e.session_id AS "sessionId",
  e.version,e.reason,e.occurred_at AS "occurredAt"`;

@Injectable()
export class TrackingService {
  constructor(
    private readonly db: DataSource,
    private readonly users: UsersService,
  ) {}
  async list(actor: AuthenticatedUser, query: TrackingQueryDto): Promise<TrackingPageDto> {
    if (query.from && query.to && new Date(query.from) >= new Date(query.to))
      throw new AppHttpException(422, 'VALIDATION_ERROR', 'from must be before to');
    return this.db.transaction('REPEATABLE READ', async (m) => {
      if (
        actor.role !== UserRole.ADMIN ||
        !(await this.users.findActiveByRole(actor.userId, UserRole.ADMIN, m))
      )
        throw new AppHttpException(403, 'ADMIN_REQUIRED', 'Active admin account required');
      const where: string[] = [];
      const params: unknown[] = [];
      const filter = (condition: string, value: unknown) => {
        params.push(value);
        where.push(condition.replace('?', `$${params.length}`));
      };
      if (query.source) filter('e.source=?', query.source);
      if (query.actorId) filter('e.actor_id=?::uuid', query.actorId);
      if (query.entityId) filter('e.entity_id=?::uuid', query.entityId);
      if (query.classId) {
        params.push(query.classId);
        const i = params.length;
        where.push(
          `(e.class_id=$${i}::uuid OR (e.source='mentor_leave_audits' AND EXISTS(SELECT 1 FROM mentor_leave_items li WHERE li.request_id=(e.data->>'request_id')::uuid AND li.class_id=$${i}::uuid)))`,
        );
      }
      if (query.sessionId) filter('e.session_id=?::uuid', query.sessionId);
      if (query.action) filter('e.action=?', query.action);
      if (query.from) filter('e.occurred_at>=?::timestamptz', query.from);
      if (query.to) filter('e.occurred_at<?::timestamptz', query.to);
      const predicate = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const counts: { total: number }[] = await m.query(
        `${NORMALIZED} SELECT count(*)::int AS total FROM events e ${predicate}`,
        params,
      );
      const items: TrackingEventDto[] = await m.query(
        `${NORMALIZED} SELECT ${FIELDS} FROM events e
        LEFT JOIN users actor ON actor.id=e.actor_id ${predicate}
        ORDER BY e.occurred_at DESC,e.id DESC,e.source ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return { items, total: counts[0]?.total ?? 0, page: query.page, pageSize: query.pageSize };
    });
  }
  async detail(actor: AuthenticatedUser, source: string, id: string): Promise<TrackingDetailDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      if (
        actor.role !== UserRole.ADMIN ||
        !(await this.users.findActiveByRole(actor.userId, UserRole.ADMIN, m))
      )
        throw new AppHttpException(403, 'ADMIN_REQUIRED', 'Active admin account required');
      const rows: Omit<TrackingDetailDto, 'evidenceItems'>[] = await m.query(
        `${NORMALIZED} SELECT ${FIELDS},e.data
        FROM events e LEFT JOIN users actor ON actor.id=e.actor_id WHERE e.source=$1 AND e.id=$2::uuid`,
        [source, id],
      );
      const row = rows[0];
      if (!row) throw new AppHttpException(404, 'AUDIT_EVENT_NOT_FOUND', 'Audit event not found');
      const evidenceItems: Record<string, unknown>[] =
        source === 'attendance_recovery_audits'
          ? await m.query(
              'SELECT * FROM attendance_recovery_audit_items WHERE recovery_audit_id=$1 ORDER BY attendance_id',
              [id],
            )
          : [];
      return { ...row, evidenceItems };
    });
  }
}
