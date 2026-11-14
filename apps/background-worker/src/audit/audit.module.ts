import { Module } from "@nestjs/common"
import { EnvironmentKeyAuditRetentionService } from "./environment-key-audit-retention.service"

@Module({ providers: [EnvironmentKeyAuditRetentionService] })
export class AuditModule {}
