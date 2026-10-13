import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Allow publication withdrawal/soft deletion even when a retained file becomes unavailable. */
export class MaterialPublicationWithdrawal1791853200000 implements MigrationInterface {
  name = 'MaterialPublicationWithdrawal1791853200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER trg_material_content ON materials');
    await q.query(`CREATE TRIGGER trg_material_content_insert BEFORE INSERT ON materials
      FOR EACH ROW EXECUTE FUNCTION guard_material_content()`);
    // Skip only a withdrawal with identical content, identity, revision and review fields.
    // Publication and all content/review changes still run the existing READY/ancestry guard.
    await q.query(`CREATE TRIGGER trg_material_content BEFORE UPDATE ON materials
      FOR EACH ROW WHEN (NOT (
        NEW.published_at IS NULL
        AND (NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
          OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL))
        AND (to_jsonb(NEW) - ARRAY['published_at','deleted_at','updated_at'])
          = (to_jsonb(OLD) - ARRAY['published_at','deleted_at','updated_at'])
      )) EXECUTE FUNCTION guard_material_content()`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER trg_material_content ON materials');
    await q.query('DROP TRIGGER trg_material_content_insert ON materials');
    await q.query(`CREATE TRIGGER trg_material_content BEFORE INSERT OR UPDATE ON materials
      FOR EACH ROW EXECUTE FUNCTION guard_material_content()`);
  }
}
