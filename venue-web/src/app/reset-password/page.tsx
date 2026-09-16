"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { AuthShell, AuthHeading, AuthMessage, authFooter, authInput, authLabel, authSubmit } from "@/components/AuthShell";

const MIN_LENGTH = 8;

/**
 * Landing page for the reset email, and the change-password screen for anyone
 * already signed in. supabase-js exchanges the recovery token in the URL for a
 * session while AuthProvider is loading, so by the time `loading` clears a
 * valid link has signed the user in and an expired one has not.
 */
export default function ResetPasswordPage() {
  const { session, loading, updatePassword } = useAuth();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) { setError(`Use at least ${MIN_LENGTH} characters.`); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }

    setSaving(true);
    try {
      await updatePassword(password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't update your password");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AuthShell>
        <p style={{ color: "var(--faint)", fontSize: 14 }}>Loading…</p>
      </AuthShell>
    );
  }

  if (!session) {
    return (
      <AuthShell>
        <AuthHeading
          title="This link has expired"
          subtitle="Reset links only work once and stop working after a while. Ask for a new one and use the most recent email."
        />
        <Link href="/forgot-password" style={{ ...authSubmit(false), display: "block", textAlign: "center", color: "var(--accent-ink)" }}>
          Send a new link →
        </Link>
        <div style={authFooter}>
          <Link href="/login">← Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Set a new password"
        subtitle={<>For <strong>{session.user.email}</strong>. Pick something you don&apos;t use anywhere else.</>}
      />

      <form onSubmit={handleSubmit}>
        {error && <AuthMessage>{error}</AuthMessage>}

        <label htmlFor="password" style={authLabel}>New password</label>
        <input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`At least ${MIN_LENGTH} characters`}
          style={authInput}
        />

        <label htmlFor="confirm" style={authLabel}>Confirm new password</label>
        <input
          id="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          style={{ ...authInput, marginBottom: 26 }}
        />

        <button type="submit" disabled={saving} style={authSubmit(saving)}>
          {saving ? "Saving…" : "Save password →"}
        </button>
      </form>

      <div style={authFooter}>
        <Link href="/dashboard">← Back to dashboard</Link>
      </div>
    </AuthShell>
  );
}
