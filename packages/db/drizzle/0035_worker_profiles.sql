-- Stage 8 (docs/architecture 14): opt-in public worker profiles, a requester's preferred and blocked workers,
-- ratings of released seats, and who sees a general task. Everything stays hidden while tasks_enabled is off.
CREATE TABLE "worker_profiles" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"indexable" boolean DEFAULT false NOT NULL,
	"display_name" text NOT NULL,
	"city" text,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "worker_profiles_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "wp_name_chk" CHECK (char_length(display_name) between 2 and 40),
	CONSTRAINT "wp_city_chk" CHECK (city is null or (char_length(city) between 1 and 40 and city !~ '[0-9０-９]')),
	CONSTRAINT "wp_skills_chk" CHECK (cardinality(skills) <= 10),
	CONSTRAINT "wp_languages_chk" CHECK (cardinality(languages) <= 5)
);--> statement-breakpoint
CREATE TABLE "requester_worker_prefs" (
	"principal_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "requester_worker_prefs_principal_id_worker_id_pk" PRIMARY KEY("principal_id","worker_id"),
	CONSTRAINT "rwp_kind_chk" CHECK (kind in ('prefer','block'))
);--> statement-breakpoint
CREATE TABLE "seat_reviews" (
	"seat_id" text PRIMARY KEY NOT NULL,
	"principal_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"rating" smallint NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"flags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sr_rating_chk" CHECK (rating between 1 and 5),
	CONSTRAINT "sr_comment_chk" CHECK (char_length(comment) <= 500)
);--> statement-breakpoint
ALTER TABLE "market_tasks" ADD COLUMN "audience" text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "market_tasks" ADD CONSTRAINT "mt_audience_chk" CHECK (audience in ('everyone','preferred'));--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requester_worker_prefs" ADD CONSTRAINT "requester_worker_prefs_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requester_worker_prefs" ADD CONSTRAINT "requester_worker_prefs_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_reviews" ADD CONSTRAINT "seat_reviews_seat_id_task_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."task_seats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_reviews" ADD CONSTRAINT "seat_reviews_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_reviews" ADD CONSTRAINT "seat_reviews_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wp_public_idx" ON "worker_profiles" USING btree ("updated_at" DESC NULLS LAST) WHERE public;--> statement-breakpoint
CREATE INDEX "rwp_worker_kind_idx" ON "requester_worker_prefs" USING btree ("worker_id","kind");--> statement-breakpoint
CREATE INDEX "sr_worker_idx" ON "seat_reviews" USING btree ("worker_id");--> statement-breakpoint
ALTER TABLE "worker_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "requester_worker_prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seat_reviews" ENABLE ROW LEVEL SECURITY;
