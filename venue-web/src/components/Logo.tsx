import { FONT_DISPLAY } from "@/lib/ui";

/** The Impulse mark — white rings around a dot on Impulse Red. The ground is
 *  always exactly #C80815, in either theme (brand v2; matches the mobile app). */
export function PulseMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden style={{ display: "block", borderRadius: size * 0.225 }}>
      <rect width="512" height="512" fill="#C80815" />
      <circle cx="256" cy="256" r="172" fill="none" stroke="#FFFFFF" strokeWidth="13" />
      <circle cx="256" cy="256" r="98" fill="none" stroke="#FFFFFF" strokeWidth="22" />
      <circle cx="256" cy="256" r="34" fill="#FFFFFF" />
    </svg>
  );
}

/** Pulse mark with animated pulsing rings — used on the login/brand panel. */
export function PulseMarkAnimated({ size = 44 }: { size?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, display: "grid", placeItems: "center" }}>
      <span style={{ position: "absolute", width: size, height: size, borderRadius: size * 0.225, border: "1.5px solid var(--accent)", animation: "pm-ring 3s ease-out infinite" }} />
      <span style={{ position: "absolute", width: size, height: size, borderRadius: size * 0.225, border: "1.5px solid var(--accent)", animation: "pm-ring 3s ease-out infinite 1.5s" }} />
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
      <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: textSize, letterSpacing: "-.02em", color: "var(--text)" }}>
        impulse
      </span>
    </div>
  );
}
