-- The conversation of a general-task seat (docs/architecture 13 §5.2): requester and worker, flagged when a
-- message looks like contact details or payment outside ProofMarket. Deleted with the seat's evidence.
CREATE TABLE "task_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"seat_id" text NOT NULL,
	"sender" text NOT NULL,
	"body" text NOT NULL,
	"flags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tm_sender_chk" CHECK (sender in ('requester','worker')),
	CONSTRAINT "tm_body_chk" CHECK (char_length(body) between 1 and 2000)
);--> statement-breakpoint
ALTER TABLE "task_messages" ADD CONSTRAINT "task_messages_seat_id_task_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."task_seats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tm_seat_created_idx" ON "task_messages" USING btree ("seat_id","created_at");--> statement-breakpoint
ALTER TABLE "task_messages" ENABLE ROW LEVEL SECURITY;
