-- Deposits in any registry asset (16 §6): the asset list moves to the app, and one transaction may credit
-- several assets, so the key becomes (signature, asset). Apply before the code that writes other assets.
ALTER TABLE "deposits" DROP CONSTRAINT "deposits_asset_chk";--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_asset_chk" CHECK (asset ~ '^[A-Za-z0-9]{2,10}$');--> statement-breakpoint
ALTER TABLE "deposits" DROP CONSTRAINT "deposits_pkey";--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_signature_asset_pk" PRIMARY KEY("signature","asset");
