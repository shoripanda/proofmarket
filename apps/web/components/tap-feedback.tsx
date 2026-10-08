"use client";
// iOS Safari shows :active styles on touch only when something on the page listens for touchstart. Mounted once
// in the root layout; renders nothing. The styles themselves live in globals.css (@media (hover: none)).
import { useEffect } from "react";

export function TapFeedback() {
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  return null;
}
