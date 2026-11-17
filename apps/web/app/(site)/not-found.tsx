// notFound() from a public page (for example /legal/<unknown>): the (site) layout already draws the header and
// footer, so only the body goes here (UX pass F4).
import { NotFoundBody } from "@/components/not-found-body";
import { getLang } from "@/lib/lang-server";

export default async function SiteNotFound() {
  return <NotFoundBody lang={await getLang()} />;
}
