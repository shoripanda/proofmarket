"use client";
// Site motion (2026-10-16, "move like rentahuman.ai"). One observer, mounted in SiteShell, drives every page:
//   [data-reveal]  fades and rises into place the first time it scrolls into view (globals.css)
//   [data-count]   counts its leading number up from 0 when it comes into view ("12 requests", "3.50 USDC", "5 min")
// Server components only add the attributes, so pages stay server-rendered. Nothing moves when the reader asks
// for reduced motion, and the CSS shows everything anyway if this script never runs (globals.css fallback).
import { useEffect, useState } from "react";

const NUMBER = /\d[\d,]*(?:\.\d+)?/;

function countUp(el: HTMLElement) {
  const text = el.dataset.count ?? el.textContent ?? "";
  const m = NUMBER.exec(text);
  if (!m) return;
  const raw = m[0];
  const target = Number(raw.replaceAll(",", ""));
  if (!Number.isFinite(target) || target === 0) return;
  const decimals = raw.split(".")[1]?.length ?? 0;
  const grouped = raw.includes(",");
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + raw.length);
  const fmt = (v: number) =>
    grouped
      ? v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : v.toFixed(decimals);
  const ms = 1100;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = before + fmt(target * eased) + after;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function MotionObserver() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = () =>
      document.querySelectorAll<HTMLElement>(
        "[data-reveal]:not(.is-in), [data-stagger]:not(.is-in), [data-count]:not(.is-counted)",
      );
    if (reduce || !("IntersectionObserver" in window)) {
      for (const el of targets()) el.classList.add("is-in", "is-counted");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          if (el.hasAttribute("data-count") && !el.classList.contains("is-counted")) {
            el.classList.add("is-counted");
            countUp(el);
          }
          el.classList.add("is-in");
          window.setTimeout(() => el.classList.add("is-settled"), 1200);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    const watch = () => {
      for (const el of targets()) io.observe(el);
    };
    watch();
    // Client navigation and streamed sections add nodes after the first pass.
    const mo = new MutationObserver(watch);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}

/** Cycles through short phrases in the hero, one at a time. Static (the first phrase) under reduced motion. */
export function RotatingWords({ words, intervalMs = 2200 }: { words: string[]; intervalMs?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (words.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % words.length), intervalMs);
    return () => window.clearInterval(id);
  }, [words.length, intervalMs]);
  return (
    <span className="rotating-words" aria-live="off">
      <span key={i} className="rotating-word">
        {words[i]}
      </span>
    </span>
  );
}
