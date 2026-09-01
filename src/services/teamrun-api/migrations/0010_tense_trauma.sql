CREATE TABLE "model_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"model" text NOT NULL,
	"key_configured" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_agent_reply_invocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"team_agent_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"result_message_id" uuid,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_server_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"endpoint" text NOT NULL,
	"runtime_id" text NOT NULL,
	"paired_device_id" text,
	"encrypted_pairing_offer" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"enrolled_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_agents" ADD COLUMN "model_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "team_agents" ADD COLUMN "yolo_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "model_connections" ADD CONSTRAINT "model_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_connections" ADD CONSTRAINT "model_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_connections" ADD CONSTRAINT "model_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_agent_reply_invocations" ADD CONSTRAINT "team_agent_reply_invocations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_agent_reply_invocations" ADD CONSTRAINT "team_agent_reply_invocations_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_agent_reply_invocations" ADD CONSTRAINT "team_agent_reply_invocations_team_agent_id_team_agents_id_fk" FOREIGN KEY ("team_agent_id") REFERENCES "public"."team_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_agent_reply_invocations" ADD CONSTRAINT "team_agent_reply_invocations_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_agent_reply_invocations" ADD CONSTRAINT "team_agent_reply_invocations_result_message_id_channel_messages_id_fk" FOREIGN KEY ("result_message_id") REFERENCES "public"."channel_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_server_bindings" ADD CONSTRAINT "team_server_bindings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_server_bindings" ADD CONSTRAINT "team_server_bindings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_server_bindings" ADD CONSTRAINT "team_server_bindings_enrolled_by_user_id_users_id_fk" FOREIGN KEY ("enrolled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_connections_project_name" ON "model_connections" USING btree ("project_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "team_agent_reply_invocations_request" ON "team_agent_reply_invocations" USING btree ("requested_by_user_id","channel_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "team_agent_reply_invocations_channel_created" ON "team_agent_reply_invocations" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_server_bindings_organization" ON "team_server_bindings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_server_bindings_project" ON "team_server_bindings" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "team_agents" ADD CONSTRAINT "team_agents_model_connection_id_model_connections_id_fk" FOREIGN KEY ("model_connection_id") REFERENCES "public"."model_connections"("id") ON DELETE restrict ON UPDATE no action;