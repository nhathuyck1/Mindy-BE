import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CodeLanguagesPythonCsharp1793750400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO code_languages(key, display_name, runtime_version, editor_mode, time_multiplier, enabled)
      VALUES ('python3', 'Python', 'Python 3.13', 'python', 3, false),
             ('csharp', 'C#', '.NET 10', 'csharp', 2, false)
      ON CONFLICT (key) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Existing submissions and authoring data may reference these rows.
    await queryRunner.query(`
      UPDATE code_languages SET enabled = false WHERE key IN ('python3', 'csharp')
    `);
  }
}
