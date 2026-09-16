"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { AuthShell, AuthHeading, AuthMessage, authFooter, authInput, authLabel, authSubmit } from "@/components/AuthShell";

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();

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
    <AuthShell>
      <form onSubmit={handleSubmit}>
        <AuthHeading title="Welcome back" subtitle="Sign in to your venue dashboard." />

        {error && <AuthMessage>{error}</AuthMessage>}

        <label htmlFor="email" style={authLabel}>Email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@venue.com.au"
          style={authInput}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label htmlFor="password" style={authLabel}>Password</label>
          <Link href="/forgot-password" style={{ fontSize: 12, fontWeight: 600 }}>Forgot password?</Link>
        </div>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={{ ...authInput, marginBottom: 26 }}
        />

        <button type="submit" disabled={loading} style={authSubmit(loading)}>
          {loading ? "Signing in…" : "Sign in →"}
        </button>

        <div style={authFooter}>
          Need a venue account? <a href="#">Talk to our team</a>
        </div>
      </form>
    </AuthShell>
  );
}
