CREATE UNIQUE INDEX "publications_agent_run_finalized" ON "publications" USING btree ("agent_run_id") WHERE "publications"."state" = 'finalized';
