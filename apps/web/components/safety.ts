// Shared by the worker app (client) and the public site (server), so it must not live in a "use client" file.
import type { Lang } from "@/lib/lang";

export const SAFETY_NOTES = [
  "店頭・看板・営業時間の掲示を写してください。",
  "人の顔が大きく写らないようにしてください。",
  "店内や立入禁止の場所には入らないでください。",
  "危ないと感じたら、いつでもやめて構いません。",
];

const SAFETY_NOTES_EN = [
  "Photograph the shop front, sign or opening-hours notice.",
  "Keep people's faces out of the frame.",
  "Do not enter the premises or any restricted area.",
  "If anything feels unsafe, stop. You can quit at any time.",
];

export const safetyNotes = (lang: Lang) => (lang === "en" ? SAFETY_NOTES_EN : SAFETY_NOTES);
