// POST /v1/console/session — exchange an API key for a console session cookie (01 §4.14).
import { appContext } from "@/lib/context";
import { handleConsoleLogin } from "@/lib/handlers/console";
import { route } from "@/lib/http";

export const POST = route(async (req) => handleConsoleLogin(appContext(), req));
