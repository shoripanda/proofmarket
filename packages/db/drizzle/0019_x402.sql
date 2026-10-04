-- x402 payments (01 §4.19): a wallet that pays per request instead of holding an issued API key.
CREATE TABLE "x402_wallets" (
	"pubkey" text PRIMARY KEY NOT NULL,
	"principal_id" text NOT NULL REFERENCES "principals"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x402_payments" (
	"signature" text PRIMARY KEY NOT NULL,
	"payer" text NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"state" text NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"credential_id" text REFERENCES "requester_credentials"("id"),
	"verification_id" text REFERENCES "verification_requests"("id"),
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "x402_payments_state_chk" CHECK (state in ('PENDING','CONFIRMED','FAILED'))
);
--> statement-breakpoint
ALTER TABLE "x402_wallets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "x402_payments" ENABLE ROW LEVEL SECURITY;
