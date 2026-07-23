CREATE TABLE "launchpad_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"launchpad_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verification_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "launchpad_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "launchpads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"owner_address" text NOT NULL,
	"config" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "launchpads_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "launchpad_domains" ADD CONSTRAINT "launchpad_domains_launchpad_id_launchpads_id_fk" FOREIGN KEY ("launchpad_id") REFERENCES "public"."launchpads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "launchpad_domains_launchpad_idx" ON "launchpad_domains" USING btree ("launchpad_id");--> statement-breakpoint
CREATE INDEX "launchpad_domains_verified_idx" ON "launchpad_domains" USING btree ("verified");--> statement-breakpoint
CREATE INDEX "launchpads_owner_idx" ON "launchpads" USING btree ("owner_address");--> statement-breakpoint
CREATE INDEX "launchpads_status_idx" ON "launchpads" USING btree ("status");