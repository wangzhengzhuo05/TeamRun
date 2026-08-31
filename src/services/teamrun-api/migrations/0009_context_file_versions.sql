ALTER TABLE "context_snapshots" ADD COLUMN "team_file_version_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "context_snapshots" ADD COLUMN "agent_selected_file_version_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "context_snapshots" ADD COLUMN "auto_enrichment_requested" boolean DEFAULT false NOT NULL;