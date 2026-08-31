CREATE TYPE "public"."team_file_availability" AS ENUM('available', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."team_file_kind" AS ENUM('document', 'code', 'file');--> statement-breakpoint
CREATE TABLE "team_file_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"team_file_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"content_base64" text NOT NULL,
	"availability" "team_file_availability" DEFAULT 'available' NOT NULL,
	"quarantine_reason" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"path" text NOT NULL,
	"kind" "team_file_kind" NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"current_mime_type" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_file_versions" ADD CONSTRAINT "team_file_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_file_versions" ADD CONSTRAINT "team_file_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_file_versions" ADD CONSTRAINT "team_file_versions_team_file_id_team_files_id_fk" FOREIGN KEY ("team_file_id") REFERENCES "public"."team_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_file_versions" ADD CONSTRAINT "team_file_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_files" ADD CONSTRAINT "team_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_files" ADD CONSTRAINT "team_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_files" ADD CONSTRAINT "team_files_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_file_versions_file_version" ON "team_file_versions" USING btree ("team_file_id","version");--> statement-breakpoint
CREATE INDEX "team_file_versions_project_created" ON "team_file_versions" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_files_project_path" ON "team_files" USING btree ("project_id","path") WHERE "team_files"."deleted_at" is null;