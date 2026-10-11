// POST /v1/console/deposit — the requester's deposit reference (15 §4.3). Cookie auth, same-site Origin.
import { appContext } from "@/lib/context";
import { handleConsoleDeposit } from "@/lib/handlers/console";
import { route } from "@/lib/http";

export const POST = route(async (req) => handleConsoleDeposit(appContext(), req));
