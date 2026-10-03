// POST /v1/console/logout — end the console session (01 §4.14).
import { appContext } from "@/lib/context";
import { handleConsoleLogout } from "@/lib/handlers/console";
import { route } from "@/lib/http";

export const POST = route(async (req) => handleConsoleLogout(appContext(), req));
