-- Self-service deposits (15 §4.3): each requester gets a Solana Pay reference; tick finds finalized transfers to
-- the treasury carrying it and credits a TOPUP. One row per transaction signature, so nothing is counted twice.
ALTER TABLE "requester_credentials" ADD COLUMN "deposit_reference" text;--> statement-breakpoint
ALTER TABLE "requester_credentials" ADD COLUMN "deposit_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requester_credentials" ADD CONSTRAINT "requester_credentials_deposit_reference_unique" UNIQUE("deposit_reference");--> statement-breakpoint
CREATE TABLE "deposits" (
	"signature" text PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL REFERENCES "requester_credentials"("id"),
	"asset" text NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"slot" bigint NOT NULL,
	"from_pubkey" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_asset_chk" CHECK (asset in ('USDC','SOL')),
	CONSTRAINT "deposits_amount_chk" CHECK (amount > 0)
);
--> statement-breakpoint
CREATE INDEX "deposits_credential_idx" ON "deposits" USING btree ("credential_id","created_at");--> statement-breakpoint
ALTER TABLE "deposits" ENABLE ROW LEVEL SECURITY;
