"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";

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
    <main className="flex min-h-screen items-center justify-center px-4" style={{background:'var(--bg)'}}>
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight" style={{color:'var(--accent)'}}>
            Impulse
          </h1>
          <p className="mt-2 text-sm" style={{color:'var(--muted)'}}>Venue Dashboard</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl p-8"
          style={{background:'var(--surface)', border:'1px solid var(--line)'}}
        >
          <h2 className="text-lg font-semibold" style={{color:'var(--text)'}}>Sign in</h2>

          {error && (
            <p className="rounded-lg px-4 py-3 text-sm" style={{background:'rgba(255,90,77,0.12)', color:'var(--accent)'}}>
              {error}
            </p>
          )}

          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium" style={{color:'var(--muted)'}}>
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{background:'var(--ph)', border:'1px solid var(--line2)', color:'var(--text)'}}
              placeholder="you@venue.com"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium" style={{color:'var(--muted)'}}>
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{background:'var(--ph)', border:'1px solid var(--line2)', color:'var(--text)'}}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{background:'var(--accent)', color:'var(--accent-ink)'}}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
