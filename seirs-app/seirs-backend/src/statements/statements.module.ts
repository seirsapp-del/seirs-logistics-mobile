import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StatementRecord } from './statement-record.entity';
import { StatementsService } from './statements.service';
import { StatementsController } from './statements.controller';

@Module({
  imports:     [TypeOrmModule.forFeature([StatementRecord])],
  providers:   [StatementsService],
  controllers: [StatementsController],
  exports:     [StatementsService],
})
export class StatementsModule implements OnModuleInit {
  private readonly logger = new Logger(StatementsModule.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Production runs with schema sync off, so a new table has to be
   * created by hand or every read against it fails. Same self-heal
   * pattern the other modules use.
   */
  async onModuleInit() {
    try {
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "statement_records" (
          "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "code"            varchar(24) NOT NULL,
          "subjectType"     varchar(16) NOT NULL,
          "subjectId"       uuid NOT NULL,
          "subjectName"     varchar NOT NULL,
          "periodFrom"      timestamptz NOT NULL,
          "periodTo"        timestamptz NOT NULL,
          "totalPaidNgn"    numeric(12,2) NOT NULL DEFAULT 0,
          "totalPendingNgn" numeric(12,2) NOT NULL DEFAULT 0,
          "lineCount"       int NOT NULL DEFAULT 0,
          "issuedBy"        varchar(32) NOT NULL DEFAULT 'self',
          "createdAt"       timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.ds.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "statement_records_code_idx" ON "statement_records" ("code")`,
      );
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "statement_records_subject_idx" ON "statement_records" ("subjectId")`,
      );
    } catch (e: any) {
      this.logger.error(`statements self-heal FAILED: ${e?.message ?? e}`);
    }
  }
}
