// Add a public place to the allowlist (REQ-X-T-104).
//   run register-place.ts --name "<memo>" --lat 35.0 --lng 139.0 --category retail --by <operator>
import { registerPlace } from "../apps/web/lib/services/admin-service.ts";
import { args, db, need } from "./lib.ts";

const a = args();
const id = await registerPlace(db(), {
  name: need(a, "name"),
  lat: Number(need(a, "lat")),
  lng: Number(need(a, "lng")),
  category: need(a, "category") as "retail" | "restaurant" | "service" | "public_facility",
  by: need(a, "by"),
});
console.log(JSON.stringify({ place_id: id }));
process.exit(0);
