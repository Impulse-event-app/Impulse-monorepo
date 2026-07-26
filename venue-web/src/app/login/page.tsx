"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { Wordmark } from "@/components/Logo";
import { FONT_DISPLAY, FONT_MONO, fieldInput, fieldLabel } from "@/lib/ui";

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const { theme, toggle } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* Theme toggle */}
      <button
        onClick={toggle}
        style={{
          position: "fixed", top: 18, right: 18, zIndex: 20,
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "7px 13px", borderRadius: 999,
          border: "1px solid var(--line2)", background: "var(--surface)",
          color: "var(--text)", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }} />
        {theme === "dark" ? "Dark" : "Light"}
      </button>

      <div
        className="login-grid"
        style={{ position: "relative", minHeight: "100vh", display: "grid", gridTemplateColumns: "1.05fr .95fr", overflow: "hidden" }}
      >
        {/* Left brand panel */}
        <div
          className="login-brand"
          style={{
            position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between",
            padding: "56px 60px",
            background: "radial-gradient(120% 90% at 15% 10%, color-mix(in oklab, var(--accent) 16%, var(--sunken)) 0%, var(--sunken) 55%)",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", inset: 0, opacity: 0.5, background: "radial-gradient(50% 45% at 78% 82%, var(--accent-soft), transparent 70%)" }} />

          <div style={{ position: "relative" }}>
            <Wordmark size={44} textSize={24} animated />
          </div>

          <div style={{ position: "relative", maxWidth: 440 }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 18 }}>
              Venue Partner Portal
            </div>
            <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 52, lineHeight: 1.02, letterSpacing: "-.03em", margin: "0 0 20px" }}>
              Fill the room.<br />On impulse.
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--muted)", margin: 0 }}>
              Publish a last-minute deal in under a minute and watch bookings land in real time. Your empty tables, discovered.
            </p>
          </div>

          <div style={{ position: "relative", display: "flex", gap: 28, fontFamily: FONT_MONO, fontSize: 12, color: "var(--faint)" }}>
            <span>2,400+ SEATS FILLED / WK</span>
            <span>·</span>
            <span>340 VENUES</span>
          </div>
        </div>

        {/* Right form panel */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40, background: "var(--bg)" }}>
          <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 380, animation: "fade-up .5s ease both" }}>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 28, letterSpacing: "-.02em", margin: "0 0 6px" }}>
              Welcome back
            </h2>
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 30px" }}>Sign in to your venue dashboard.</p>

            {error && (
              <p style={{ borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, background: "var(--accent-soft)", color: "var(--accent)" }}>
                {error}
              </p>
            )}

            <label htmlFor="email" style={{ ...fieldLabel, letterSpacing: ".12em", fontSize: 11, marginBottom: 8 }}>Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@venue.com.au"
              style={{ ...fieldInput, padding: "14px 16px", marginBottom: 20, borderRadius: 12, background: "var(--surface)", fontSize: 15 }}
            />

            <label htmlFor="password" style={{ ...fieldLabel, letterSpacing: ".12em", fontSize: 11, marginBottom: 8 }}>Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ ...fieldInput, padding: "14px 16px", marginBottom: 26, borderRadius: 12, background: "var(--surface)", fontSize: 15 }}
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: 15, borderRadius: 12, border: "none",
                background: "var(--accent)", color: "var(--accent-ink)",
                fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, letterSpacing: ".01em",
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
                boxShadow: "0 10px 30px var(--accent-soft)",
              }}
            >
              {loading ? "Signing in…" : "Sign in →"}
            </button>

            <div style={{ textAlign: "center", marginTop: 22, fontSize: 13, color: "var(--muted)" }}>
              Need a venue account? <a href="#">Talk to our team</a>
            </div>
          </form>
        </div>
      </div>

      {/* Collapse to a single column on narrow screens */}
      <style>{`
        @media (max-width: 820px) {
          .login-grid { grid-template-columns: 1fr !important; }
          .login-brand { display: none !important; }
        }
      `}</style>
    </div>
  );
}
