import { FONT_DISPLAY } from "@/lib/ui";

/** The Impulse pulse mark — concentric rings around a solid dot. */
export function PulseMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden>
      <rect width="200" height="200" rx="52" fill="#0F0E0D" />
      <circle cx="100" cy="100" r="82" fill="none" stroke="#FF5A4D" strokeOpacity="0.22" strokeWidth="4" />
      <circle cx="100" cy="100" r="60" fill="none" stroke="#FF5A4D" strokeOpacity="0.45" strokeWidth="4.8" />
      <circle cx="100" cy="100" r="34" fill="#FF5A4D" />
    </svg>
  );
}

/** Pulse mark with animated pulsing rings — used on the login/brand panel. */
export function PulseMarkAnimated({ size = 44 }: { size?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, display: "grid", placeItems: "center" }}>
      <span style={{ position: "absolute", width: size, height: size, borderRadius: 15, border: "1.5px solid var(--accent)", animation: "pm-ring 3s ease-out infinite" }} />
      <span style={{ position: "absolute", width: size, height: size, borderRadius: 15, border: "1.5px solid var(--accent)", animation: "pm-ring 3s ease-out infinite 1.5s" }} />
      <div style={{ position: "relative" }}>
        <PulseMark size={size} />
      </div>
    </div>
  );
}

/** Full wordmark: pulse mark + "impulse". */
export function Wordmark({ size = 30, textSize = 20, animated = false }: { size?: number; textSize?: number; animated?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      {animated ? <PulseMarkAnimated size={size} /> : <PulseMark size={size} />}
      <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: textSize, letterSpacing: "-.02em", color: "var(--text)" }}>
        impulse
      </span>
    </div>
  );
}
