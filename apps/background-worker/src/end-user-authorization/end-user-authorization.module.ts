import { Module } from "@nestjs/common"
import { EndUserAuthorizationSweepService } from "./end-user-authorization-sweep.service"

@Module({ providers: [EndUserAuthorizationSweepService] })
export class EndUserAuthorizationModule {}
