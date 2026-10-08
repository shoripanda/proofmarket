import { headers } from "next/headers";
import { LANG_HEADER, type Lang } from "./lang";

/** Which language this request renders in. Server components and generateMetadata only. */
export async function getLang(): Promise<Lang> {
  return (await headers()).get(LANG_HEADER) === "en" ? "en" : "ja";
}
