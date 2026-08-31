CREATE TYPE "public"."team_file_proposal_status" AS ENUM('running', 'ready', 'applied', 'failed');--> statement-breakpoint
CREATE TABLE "team_file_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"team_file_id" uuid NOT NULL,
	"base_version" integer NOT NULL,
	"team_agent_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"instructions_markdown" text NOT NULL,
	"proposed_content_base64" text,
	"status" "team_file_proposal_status" DEFAULT 'running' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"error_code" text,
	"applied_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_file_proposals" ADD CONSTRAINT "team_file_proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_file_proposals" ADD CONSTRAINT "team_file_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_file_proposals" ADD CONSTRAINT "team_file_proposals_team_file_id_team_files_id_fk" FOREIGN KEY ("team_file_id") REFERENCES "public"."team_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_file_proposals" ADD CONSTRAINT "team_file_proposals_team_agent_id_team_agents_id_fk" FOREIGN KEY ("team_agent_id") REFERENCES "public"."team_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_file_proposals" ADD CONSTRAINT "team_file_proposals_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_file_proposals" ADD CONSTRAINT "team_file_proposals_applied_version_id_team_file_versions_id_fk" FOREIGN KEY ("applied_version_id") REFERENCES "public"."team_file_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_file_proposals_request" ON "team_file_proposals" USING btree ("requested_by_user_id","team_file_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "team_file_proposals_file_created" ON "team_file_proposals" USING btree ("team_file_id","created_at");