import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserDocument } from './user-document.entity';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';

@Module({
  imports:     [TypeOrmModule.forFeature([UserDocument])],
  controllers: [DocumentsController],
  providers:   [DocumentsService],
  exports:     [DocumentsService],
})
export class DocumentsModule implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  // Idempotent self-heal so SYNC_DB is never needed. The id has no DB
  // default: the service generates UUIDs, keeping this CREATE free of
  // extension dependencies (uuid-ossp/pgcrypto).
  async onModuleInit() {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS "user_documents" (
          "id"            uuid PRIMARY KEY,
          "userId"        uuid NOT NULL,
          "title"         character varying(200) NOT NULL,
          "category"      character varying(24) NOT NULL DEFAULT 'other',
          "body"          text,
          "fileUrl"       text,
          "sentByAdminId" uuid,
          "sentByName"    character varying(120),
          "createdAt"     timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS "user_documents_userid_idx" ON "user_documents" ("userId")`,
      );
    } catch { /* table exists or DB briefly unavailable; both fine */ }
  }
}
