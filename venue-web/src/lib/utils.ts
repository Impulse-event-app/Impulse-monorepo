import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** What a deal left unnamed is called: "Flight Club · $15 pp". Mirrors
 *  auto_title in backend/deal_schedules.py, which sets the stored title. */
export function autoDealTitle(venueName: string, dealPrice: number | null, unit: string | null | undefined): string {
  if (dealPrice === null || isNaN(dealPrice)) return venueName;
  dealPrice = Math.round(dealPrice * 100) / 100;
  const amount = Number.isInteger(dealPrice) ? `$${dealPrice}` : `$${dealPrice.toFixed(2)}`;
  const u = (unit || "pp").trim();
  return `${venueName} · ${amount}${u.startsWith("/") ? u : ` ${u}`}`;
}
