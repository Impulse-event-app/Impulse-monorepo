"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { AuthShell, AuthHeading, AuthMessage, authFooter, authInput, authLabel, authSubmit } from "@/components/AuthShell";

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't send the reset email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <AuthHeading title="Reset your password" subtitle="Enter the email you sign in with and we'll send you a link to set a new password." />

      {sent ? (
        // Worded the same whether or not the account exists — Supabase doesn't
        // say either, and the page shouldn't reveal which emails are venues.
        <AuthMessage tone="success">
          If there&apos;s an account for <strong>{email.trim()}</strong>, a reset link is on its way. It can take a few
          minutes — check your spam folder too. Use the newest email if you asked more than once.
        </AuthMessage>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && <AuthMessage>{error}</AuthMessage>}

          <label htmlFor="email" style={authLabel}>Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@venue.com.au"
            style={{ ...authInput, marginBottom: 26 }}
          />

          <button type="submit" disabled={loading} style={authSubmit(loading)}>
            {loading ? "Sending…" : "Send reset link →"}
          </button>
        </form>
      )}

      <div style={authFooter}>
        <Link href="/login">← Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
