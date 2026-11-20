import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssignmentZip1793577600000 } from '../../src/database/migrations/1793577600000-assignment-zip.js';
import { ConsolidateAssignments1793836800002 } from '../../src/database/migrations/1793836800002-consolidate-assignments.js';
import { gradeQuiz, type QuizQuestion } from '../../src/modules/assignments/domain/quiz.js';
import { AssignmentAccessService } from '../../src/modules/assignments/services/assignment-access.service.js';
import { AssignmentsService } from '../../src/modules/assignments/services/assignments.service.js';
import { QuizAttemptsService } from '../../src/modules/assignments/services/quiz-attempts.service.js';
import { ZipAccessService } from '../../src/modules/assignments/services/zip-access.service.js';
import { ZipReceiptsService } from '../../src/modules/assignments/services/zip-receipts.service.js';
import { ZipSubmissionsService } from '../../src/modules/assignments/services/zip-submissions.service.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { TrackingService } from '../../src/modules/tracking/tracking.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { CHAT_MIGRATIONS } from '../helpers/chat-migrations.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('assignment_consolidation'))(
  'Assignment consolidation upgrade',
  () => {
    let db: DataSource, f: ReturnType<typeof paymentFixture>;
    let student: AuthenticatedUser, mentor: AuthenticatedUser, admin: AuthenticatedUser;
    let classId: string, sessionId: string;
    let assignments: AssignmentsService, attempts: QuizAttemptsService, zip: ZipSubmissionsService;
    const migration = new ConsolidateAssignments1793836800002();
    const ids = Object.fromEntries(
      [
        'quiz',
        'zip',
        'question',
        'quizSubmission',
        'zipSubmission',
        'instruction',
        'file',
        'grade',
        'key',
        'copyToken',
      ].map((name) => [name, randomUUID()]),
    ) as Record<string, string>;
    const question: QuizQuestion = {
      id: ids.question ?? '',
      position: 1,
      prompt: 'Câu hỏi cũ',
      options: (['A', 'B', 'C', 'D'] as const).map((label) => ({ label, text: `Đáp án ${label}` })),
    };
    const result = gradeQuiz(
      [question],
      [{ questionId: question.id, selectedOption: 'B' }],
      new Map([[question.id, 'B']]),
      '10.00',
    );
    const legacy: Record<string, unknown[]> = {};
    const legacyAuditData: Record<string, unknown[]> = {};
    const tables = [
      'assignment_audits',
      'assignment_zip_audits',
      'assignment_receipts',
      'assignment_zip_receipts',
      'assignment_zip_grade_revisions',
      'assignment_zip_instruction_snapshots',
    ];
    const zipReceipt = { type: 'ZIP', id: ids.zipSubmission, status: 'SUBMITTED', version: 2 };

    beforeAll(async () => {
      db = await paymentDatabase('assignment_consolidation', {
        migrations: [
          ...CHAT_MIGRATIONS.filter((m) => m.name !== 'MentorLeave1792195200000'),
          AssignmentZip1793577600000,
        ],
      });
      f = paymentFixture(db);
      const order = await f.order();
      classId = order.classIds[0] ?? '';
      sessionId = (await f.read.getDetail(classId)).units[0]?.sessions[0]?.id ?? '';
      student = { userId: order.student.id, role: UserRole.STUDENT, sessionId: randomUUID() };
      mentor = { userId: order.mentor.id, role: UserRole.MENTOR, sessionId: randomUUID() };
      admin = {
        userId: (await f.user(UserRole.ADMIN)).id,
        role: UserRole.ADMIN,
        sessionId: randomUUID(),
      };
      await db.query(
        "UPDATE enrollments SET status='ACTIVE',enrolled_at=clock_timestamp() WHERE class_id=$1",
        [classId],
      );
      const enrollment = (
        await db.query('SELECT id FROM enrollments WHERE class_id=$1 AND student_id=$2', [
          classId,
          student.userId,
        ])
      )[0].id;
      await db.transaction(async (m) => {
        for (const type of ['QUIZ', 'ZIP'])
          await m.query(
            `INSERT INTO assignments(id,session_id,purpose,type,title,max_score,due_at,status,created_by)
          VALUES($1,$2,'TEST',$3,$3,10,clock_timestamp()+interval '7 days','DRAFT',$4)`,
            [type === 'QUIZ' ? ids.quiz : ids.zip, sessionId, type, mentor.userId],
          );
        await m.query(
          'INSERT INTO assignment_questions(id,assignment_id,position,prompt) VALUES($1,$2,1,$3)',
          [question.id, ids.quiz, question.prompt],
        );
        for (const o of question.options)
          await m.query(
            'INSERT INTO assignment_question_options(question_id,label,text) VALUES($1,$2,$3)',
            [question.id, o.label, o.text],
          );
        await m.query(
          "INSERT INTO assignment_answer_keys(question_id,correct_option) VALUES($1,'B')",
          [question.id],
        );
        await m.query(
          `INSERT INTO assignment_submissions(id,assignment_id,student_id,enrollment_id,assignment_revision,status,started_at,submitted_at,submission_source,assignment_snapshot,answers,result)
        VALUES($1,$2,$3,$4,1,'GRADED',clock_timestamp(),clock_timestamp(),'MANUAL',$5,$6,$7)`,
          [
            ids.quizSubmission,
            ids.quiz,
            student.userId,
            enrollment,
            JSON.stringify({ title: 'QUIZ', maxScore: '10.00', questions: [question] }),
            JSON.stringify([{ questionId: question.id, selectedOption: 'B' }]),
            JSON.stringify(result),
          ],
        );
        await m.query(
          'INSERT INTO assignment_zip_submissions(id,assignment_id,student_id,enrollment_id) VALUES($1,$2,$3,$4)',
          [ids.zipSubmission, ids.zip, student.userId, enrollment],
        );
        for (const purpose of ['INSTRUCTION', 'SUBMISSION']) {
          const fileId = purpose === 'INSTRUCTION' ? ids.instruction : ids.file;
          await m.query(
            `INSERT INTO assignment_files(id,assignment_id,owner_user_id,zip_submission_id,purpose,original_name,declared_mime_type,declared_size_bytes,bucket,staging_key,object_key,object_version_id,mime_type,size_bytes,status,intent_expires_at,ready_at)
          VALUES($1::uuid,$2,$3,$4,$5::text,$5::text,'application/zip',100,'legacy-test',$1::text,$1::text,'v1','application/zip',100,'READY',clock_timestamp()+interval '1 day',clock_timestamp())`,
            [
              fileId,
              ids.zip,
              purpose === 'INSTRUCTION' ? mentor.userId : student.userId,
              purpose === 'INSTRUCTION' ? null : ids.zipSubmission,
              purpose,
            ],
          );
        }
        await m.query(
          'INSERT INTO assignment_instruction_files(assignment_id,file_id,position) VALUES($1,$2,1)',
          [ids.zip, ids.instruction],
        );
        await m.query(
          "INSERT INTO assignment_zip_submission_files(submission_id,assignment_id,student_id,file_id,object_version_id) VALUES($1,$2,$3,$4,'v1')",
          [ids.zipSubmission, ids.zip, student.userId, ids.file],
        );
        await m.query(
          "INSERT INTO assignment_zip_instruction_snapshots(submission_id,file_id,object_version_id,position) VALUES($1,$2,'v1',1)",
          [ids.zipSubmission, ids.instruction],
        );
        await m.query(
          `UPDATE assignment_zip_submissions SET status='SUBMITTED',attempt_number=1,version=2,assignment_revision=1,
        assignment_snapshot='{"title":"ZIP","maxScore":"10.00"}',submitted_at=clock_timestamp() WHERE id=$1`,
          [ids.zipSubmission],
        );
        await m.query('INSERT INTO assignment_zip_grades(id,submission_id) VALUES($1,$2)', [
          ids.grade,
          ids.zipSubmission,
        ]);
        await m.query(
          "INSERT INTO assignment_zip_grade_revisions(grade_id,version,score,feedback,actor_id) VALUES($1,1,8,'Điểm đã công bố',$2)",
          [ids.grade, mentor.userId],
        );
        await m.query(
          'UPDATE assignment_zip_grades SET current_version=1,released_version=1 WHERE id=$1',
          [ids.grade],
        );
        await m.query(
          "INSERT INTO assignment_audits(assignment_id,submission_id,actor_id,action,version) VALUES($1,$2,$3,'SUBMIT',1)",
          [ids.quiz, ids.quizSubmission, student.userId],
        );
        await m.query(
          "INSERT INTO assignment_zip_audits(assignment_id,submission_id,grade_id,actor_id,action,version) VALUES($1,$2,$3,$4,'RELEASE',1)",
          [ids.zip, ids.zipSubmission, ids.grade, mentor.userId],
        );
        const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
        await m.query(
          'INSERT INTO assignment_receipts(actor_id,route,idempotency_key,request_hash,resource_id) VALUES($1,$2,$3,$4,$5)',
          [student.userId, `start:${ids.quiz}`, ids.key, hash({ revision: 1 }), ids.quizSubmission],
        );
        await m.query(
          'INSERT INTO assignment_zip_receipts(actor_id,route,key,request_hash,outcome) VALUES($1,$2,$3,$4,$5)',
          [
            student.userId,
            `submit:${ids.zipSubmission}`,
            ids.key,
            hash({ expectedVersion: 2 }),
            JSON.stringify(zipReceipt),
          ],
        );
        // Both old stores allowed the same actor/route/key; namespaces must retain both.
        await m.query(
          "INSERT INTO assignment_receipts(actor_id,route,idempotency_key,request_hash,resource_id) VALUES($1,'collision',$2,'quiz-hash',$3)",
          [student.userId, ids.key, ids.quizSubmission],
        );
        await m.query(
          "INSERT INTO assignment_zip_receipts(actor_id,route,key,request_hash,outcome) VALUES($1,'collision',$2,'zip-hash','{}')",
          [student.userId, ids.key],
        );
        await m.query(
          "INSERT INTO assignment_file_jobs(file_id,kind,status) VALUES($1,'VALIDATE','DONE')",
          [ids.file],
        );
        await m.query(
          'INSERT INTO assignment_file_copies(file_id,token,object_key) VALUES($1,$2,$3)',
          [ids.file, ids.copyToken, `legacy/${ids.copyToken}`],
        );
      });
      await db.query("UPDATE assignments SET status='PUBLISHED' WHERE id=ANY($1::uuid[])", [
        [ids.quiz, ids.zip],
      ]);
      for (const table of tables)
        legacy[table] = await db.query(`SELECT * FROM ${table} ORDER BY 1`);
      for (const source of ['assignment_audits', 'assignment_zip_audits'])
        legacyAuditData[source] = await db.query(
          `SELECT to_jsonb(a) AS data FROM ${source} a ORDER BY id`,
        );
      const teaching = new TeachingReadService(
        db,
        f.config,
        f.users,
        new ScheduleReservationsService(),
      );
      const access = new AssignmentAccessService(teaching, f.users, f.enrollments);
      assignments = new AssignmentsService(db, access, f.workspace, f.enrollments);
      attempts = new QuizAttemptsService(db, access, assignments, teaching, f.enrollments);
      zip = new ZipSubmissionsService(
        db,
        new ZipAccessService(
          access,
          new ConfigService({ ASSIGNMENT_ZIP_ENABLED: true, MINIO_ENABLED: true }),
        ),
        new ZipReceiptsService(),
      );
    }, 30000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });

    it('rolls back the complete upgrade if copying an audit fails, then preserves populated history', async () => {
      await db.query(`CREATE FUNCTION test_upgrade_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.source='assignment_zip_audits' THEN RAISE EXCEPTION 'upgrade audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_upgrade_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION test_upgrade_failure()`);
      try {
        await expect(rehearseMigration(db, migration, 'up')).rejects.toThrow(
          'upgrade audit failure',
        );
        for (const table of tables)
          expect(await db.query(`SELECT * FROM ${table} ORDER BY 1`)).toEqual(legacy[table]);
        expect(
          (await db.query('SELECT count(*)::int AS count FROM assignment_answer_keys'))[0].count,
        ).toBe(1);
      } finally {
        await db.query(
          'DROP TRIGGER test_upgrade_failure ON audit_events; DROP FUNCTION test_upgrade_failure()',
        );
      }
      await rehearseMigration(db, migration, 'up');
      const relations = await db.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND (table_name='assignments' OR table_name LIKE 'assignment\\_%' ESCAPE '\\') ORDER BY table_name",
      );
      expect(relations.map((r: { table_name: string }) => r.table_name)).toEqual([
        'assignment_file_jobs',
        'assignment_files',
        'assignment_finalization_jobs',
        'assignment_instruction_files',
        'assignment_questions',
        'assignment_submissions',
        'assignment_zip_grade_revisions',
        'assignment_zip_instruction_snapshots',
        'assignment_zip_submissions',
        'assignments',
      ]);
      for (const source of ['assignment_audits', 'assignment_zip_audits']) {
        const events = await db.query('SELECT data FROM audit_events WHERE source=$1 ORDER BY id', [
          source,
        ]);
        expect(events).toEqual(legacyAuditData[source]);
      }
      for (const table of [
        'assignment_zip_grade_revisions',
        'assignment_zip_instruction_snapshots',
      ])
        expect(await db.query(`SELECT * FROM ${table} ORDER BY 1`)).toEqual(legacy[table]);
      expect((await assignments.get(mentor, ids.quiz ?? '')).questions).toEqual([
        { ...question, correctOption: 'B' },
      ]);
      expect((await attempts.get(student, ids.quizSubmission ?? '', true)).result).toEqual(result);
      expect(await zip.get(student, ids.zipSubmission ?? '')).toMatchObject({
        file: { id: ids.file },
        grade: { version: 1, score: '8.00', feedback: 'Điểm đã công bố' },
      });
      const copies = await db.query(
        "SELECT copy_candidates FROM assignment_file_jobs WHERE file_id=$1 AND kind='VALIDATE'",
        [ids.file],
      );
      expect(copies[0].copy_candidates).toEqual([
        { token: ids.copyToken, object_key: `legacy/${ids.copyToken}` },
      ]);
    });

    it('replays old receipts with unchanged hashes and keeps namespaces separate', async () => {
      expect((await attempts.start(student, ids.quiz ?? '', 1, ids.key)).attempt.attemptId).toBe(
        ids.quizSubmission,
      );
      expect(
        await zip.submit(student, ids.zipSubmission ?? '', { expectedVersion: 2 }, ids.key),
      ).toEqual(zipReceipt);
      const receipts = await db.query(
        "SELECT namespace,payload_hash FROM mutation_receipts WHERE route='collision' ORDER BY namespace",
      );
      expect(receipts).toEqual([
        { namespace: 'assignment_quiz', payload_hash: 'quiz-hash' },
        { namespace: 'assignment_zip', payload_hash: 'zip-hash' },
      ]);
      await expect(
        zip.submit(student, ids.zipSubmission ?? '', { expectedVersion: 3 }, ids.key),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('allows grade revisions without changing submitted content or the released grade', async () => {
      const graded = await zip.grade(
        mentor,
        ids.zipSubmission ?? '',
        { expectedVersion: 1, score: '9.00', feedback: 'Điểm sửa', reason: 'Chấm lại' },
        randomUUID(),
      );
      expect(graded).toMatchObject({
        gradeVersion: 2,
        releasedVersion: 1,
        grade: { score: '9.00' },
      });
      expect((await zip.get(student, ids.zipSubmission ?? '')).grade?.score).toBe('8.00');
      await expect(
        db.query(
          'UPDATE assignment_zip_submissions SET file_id=NULL,object_version_id=NULL,current_version=1 WHERE id=$1',
          [ids.zipSubmission],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        db.query(
          "UPDATE assignment_zip_submissions SET assignment_snapshot='{}',released_version=2 WHERE id=$1",
          [ids.zipSubmission],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        db.query('UPDATE assignment_zip_submissions SET current_version=99 WHERE id=$1', [
          ids.zipSubmission,
        ]),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        db.query('UPDATE assignment_zip_grade_revisions SET score=1 WHERE grade_id=$1', [
          ids.grade,
        ]),
      ).rejects.toThrow('append only');
      await zip.release(
        mentor,
        ids.zipSubmission ?? '',
        { expectedVersion: 2, gradeVersion: 2 },
        randomUUID(),
      );
      expect((await zip.get(student, ids.zipSubmission ?? '')).grade?.score).toBe('9.00');
    });

    it('keeps database validation, audit foreign keys and append-only protection', async () => {
      for (const options of [
        [
          { label: 'A', text: 'one' },
          { label: 'A', text: 'duplicate' },
        ],
        [{ label: 'B', text: '' }],
        [{ label: 'E', text: 'invalid' }],
      ])
        await expect(
          db.query('UPDATE assignment_questions SET options=$2 WHERE id=$1', [
            question.id,
            JSON.stringify(options),
          ]),
        ).rejects.toMatchObject({ code: '23514' });
      await expect(
        db.query("UPDATE assignment_questions SET correct_option='E' WHERE id=$1", [question.id]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        db.query('DELETE FROM audit_events WHERE ref_assignment_id=$1', [ids.quiz]),
      ).rejects.toThrow('append only');
      await expect(
        db.query("DELETE FROM mutation_receipts WHERE namespace='assignment_zip'"),
      ).rejects.toThrow('append only');
      await expect(
        db.query(
          "INSERT INTO audit_events(source,id,actor_id,data) SELECT 'assignment_zip_audits',id,NULL,jsonb_build_object('id',id,'actor_id',NULL,'assignment_id',$1::uuid,'version',1,'action','BAD','created_at',now()) FROM (SELECT gen_random_uuid() id) e",
          [randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(rehearseMigration(db, migration, 'down')).rejects.toThrow('forward migration');
    });

    it('includes assignment events in system tracking with class/session/entity filters', async () => {
      const tracking = new TrackingService(db, f.users);
      const page = await tracking.list(admin, {
        page: 1,
        pageSize: 20,
        source: 'assignment_zip_audits',
        classId,
        sessionId,
        entityId: ids.zipSubmission,
      });
      expect(page.total).toBe(3);
      expect(page.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'GRADE',
            entityType: 'assignment_submission',
            entityId: ids.zipSubmission,
            classId,
            sessionId,
          }),
        ]),
      );
      const event = page.items[0];
      if (!event) throw new Error('Missing assignment audit');
      expect((await tracking.detail(admin, event.source, event.id)).data.assignment_id).toBe(
        ids.zip,
      );
      await expect(tracking.list(student, { page: 1, pageSize: 20 })).rejects.toMatchObject({
        status: 403,
      });
    });
  },
);
