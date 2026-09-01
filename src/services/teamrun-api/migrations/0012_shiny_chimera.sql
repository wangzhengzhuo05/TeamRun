CREATE TYPE "public"."agent_run_execution_target" AS ENUM('personal', 'team_server');--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "execution_target" "agent_run_execution_target" DEFAULT 'personal' NOT NULL;
