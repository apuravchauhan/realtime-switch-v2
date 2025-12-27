import { Kysely } from 'kysely';
import * as fs from 'fs';
import * as path from 'path';

export interface MigrationModule {
  up(db: Kysely<any>): Promise<MigrationStatus>;
  down(db: Kysely<any>): Promise<void>;
}

export interface Migration {
  up(db: Kysely<any>): Promise<void>;
  down(db: Kysely<any>): Promise<void>;
}

export type MigrationStatus = 'executed' | 'skipped';

export interface MigrationResult {
  name: string;
  status: MigrationStatus | 'failed';
  error?: string;
}

export class Migrator {
  private migrationsPath: string;

  constructor(private db: Kysely<any>, migrationsPath?: string) {
    this.migrationsPath = migrationsPath ?? path.join(__dirname, 'scripts');
  }

  async runAll(): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    const files = this.getMigrationFiles();
    for (const file of files) {
      const result = await this.runMigration(file);
      results.push(result);
      if (result.status === 'failed') break;
    }
    return results;
  }

  async runMigration(fileName: string): Promise<MigrationResult> {
    const name = fileName.replace(/\.(ts|js)$/, '');
    try {
      const filePath = path.join(this.migrationsPath, fileName);
      const migration: MigrationModule = await import(filePath);
      const status = await migration.up(this.db);
      return { name, status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { name, status: 'failed', error: message };
    }
  }

  async rollback(fileName: string): Promise<MigrationResult> {
    const name = fileName.replace(/\.(ts|js)$/, '');
    try {
      const filePath = path.join(this.migrationsPath, fileName);
      const migration: MigrationModule = await import(filePath);
      await migration.down(this.db);
      return { name, status: 'executed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { name, status: 'failed', error: message };
    }
  }

  private getMigrationFiles(): string[] {
    if (!fs.existsSync(this.migrationsPath)) return [];
    return fs.readdirSync(this.migrationsPath)
      .filter((f) => /^\d{4}-\d{2}-\d{2}T\d{3}-.+\.(ts|js)$/.test(f))
      .sort();
  }
}
