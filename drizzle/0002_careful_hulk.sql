CREATE TABLE "business_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"source" text DEFAULT 'ai' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"target_customer" text,
	"price_range" text,
	"currency" text,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_profile_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"source" text DEFAULT 'ai' NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"evidence_message_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"evidence_thread_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_name" text,
	"business_type" text,
	"industry" text,
	"profession" text,
	"role" text,
	"description" text,
	"website" text,
	"country" text,
	"location" text,
	"timezone" text,
	"preferred_currency" text,
	"target_customer_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"target_industries" text[] DEFAULT '{}'::text[] NOT NULL,
	"target_markets" text[] DEFAULT '{}'::text[] NOT NULL,
	"accepted_enquiry_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"excluded_enquiry_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"business_goals" text[] DEFAULT '{}'::text[] NOT NULL,
	"inbox_purpose" text,
	"typical_deal_size" text,
	"sales_cycle" text,
	"payment_terms" text,
	"business_hours" text,
	"communication_tone" text,
	"email_signature" text,
	"profile_status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_profiles_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "email_intelligence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"thread_id" uuid,
	"primary_category" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"summary" text,
	"sender_classification" text,
	"communication_intent" text,
	"importance" text DEFAULT 'low' NOT NULL,
	"action_required" boolean DEFAULT false NOT NULL,
	"recommended_action" text,
	"business_relevance" text DEFAULT 'none' NOT NULL,
	"offering_id" uuid,
	"relevance_explanation" text,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"analysis_status" text DEFAULT 'pending' NOT NULL,
	"analysis_version" text DEFAULT '1' NOT NULL,
	"analysed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_intelligence_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "business_insights" ADD CONSTRAINT "business_insights_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_offerings" ADD CONSTRAINT "business_offerings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_offerings" ADD CONSTRAINT "business_offerings_profile_id_business_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."business_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profile_facts" ADD CONSTRAINT "business_profile_facts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profile_facts" ADD CONSTRAINT "business_profile_facts_profile_id_business_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."business_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_intelligence" ADD CONSTRAINT "email_intelligence_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_intelligence" ADD CONSTRAINT "email_intelligence_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_intelligence" ADD CONSTRAINT "email_intelligence_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_intelligence" ADD CONSTRAINT "email_intelligence_offering_id_business_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."business_offerings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_insights_ws_idx" ON "business_insights" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "business_offerings_profile_idx" ON "business_offerings" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_profile_facts_profile_key" ON "business_profile_facts" USING btree ("profile_id","category","key");--> statement-breakpoint
CREATE INDEX "business_profiles_ws_idx" ON "business_profiles" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "email_intelligence_ws_idx" ON "email_intelligence" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "email_intelligence_thread_idx" ON "email_intelligence" USING btree ("thread_id");