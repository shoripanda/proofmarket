-- One language everywhere (13 §7): a push subscription remembers the language its worker reads in, so the
-- notification text matches the app. Existing rows were made from the Japanese app.
ALTER TABLE "push_subscriptions" ADD COLUMN "lang" text NOT NULL DEFAULT 'ja';--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_lang_chk" CHECK (lang in ('ja','en'));
