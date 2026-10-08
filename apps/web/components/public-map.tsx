"use client";
// S-12 みんなの地図 (01 §4.22). Leaflet with OpenStreetMap tiles; loaded in the browser only.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { useLang } from "@/lib/client/lang";
import { pick } from "@/lib/lang";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  answer: string;
  when: string;
  href: string;
  /** A plain "yes" kind of answer is drawn in teal, the rest in slate. */
  positive: boolean;
}

const TOKYO: [number, number] = [35.6812, 139.7671];

export function PublicMapView({ points }: { points: MapPoint[] }) {
  const lang = useLang();
  const el = useRef<HTMLDivElement>(null);
  const linkText = pick(lang, "確かめた記録を見る", "See the proof");

  useEffect(() => {
    let dispose = () => {};
    let gone = false;
    void import("leaflet").then(({ default: L }) => {
      if (gone || !el.current) return;
      const map = L.map(el.current, { scrollWheelZoom: false }).setView(TOKYO, 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      for (const p of points) {
        // Built as DOM nodes, never HTML strings: the question is written by a requester.
        const box = document.createElement("div");
        const title = document.createElement("p");
        title.textContent = p.title;
        title.style.margin = "0 0 4px";
        const answer = document.createElement("p");
        answer.textContent = p.answer;
        answer.style.cssText = "margin:0 0 4px;font-weight:700;font-size:15px";
        const when = document.createElement("p");
        when.textContent = p.when;
        when.style.cssText = "margin:0 0 6px;color:#64748b;font-size:12px";
        const link = document.createElement("a");
        link.href = p.href;
        link.textContent = linkText;
        box.append(title, answer, when, link);
        L.circleMarker([p.lat, p.lng], {
          radius: 9,
          color: "#ffffff",
          weight: 2,
          fillColor: p.positive ? "#0f766e" : "#475569",
          fillOpacity: 0.95,
        })
          .addTo(map)
          .bindPopup(box);
      }
      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])).pad(0.3), {
          maxZoom: 16,
        });
      }
      dispose = () => map.remove();
    });
    return () => {
      gone = true;
      dispose();
    };
  }, [points, linkText]);

  return (
    <div
      ref={el}
      role="application"
      aria-label={pick(lang, "人が確かめた事実の地図", "Map of facts checked by people")}
      className="h-[26rem] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
    />
  );
}
