"use client";

import { FormEvent, useEffect, useState } from "react";
import type { PortalUser } from "@/context/auth-context";

type ApiResult = Record<string, any>;
type Props = {
  onAuthenticated: (user: PortalUser) => void;
};

async function request<T extends ApiResult>(path: string, data?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: data ? "POST" : "GET",
    credentials: "include",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined
  });
  const result = await response.json();
  if (!response.ok || result.success === false) throw new Error(result.message || `Request failed (${response.status})`);
  return result as T;
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [phase, setPhase] = useState(1);
  const [stage, setStage] = useState<"login" | "register" | "mfa" | "email" | "setup">("login");
  const [pendingToken, setPendingToken] = useState("");
  const [enrollment, setEnrollment] = useState<ApiResult | null>(null);
  const [verificationUrl, setVerificationUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    request("/auth/config").then((config) => setPhase(Number(config.phase) || 1)).catch(() => setError("Unable to connect to the authentication service."));
    const token = new URLSearchParams(window.location.search).get("verify");
    if (token) {
      request("/auth/verify-email", { token })
        .then((result) => setMessage(result.message))
        .catch((reason: Error) => setError(reason.message));
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (stage === "login") {
        const result = await request("/auth/login", values);
        if (result.requiresMfa || result.requiresMfaSetup) {
          setPendingToken(String(result.sessionToken || ""));
          setStage(result.requiresMfaSetup ? "setup" : "mfa");
          return;
        }
        if (result.requiresEmailOtp) {
          setPendingToken(String(result.sessionToken || ""));
          setMessage(result.developmentOtp ? `Development email code: ${result.developmentOtp}` : result.message);
          setStage("email");
          return;
        }
        onAuthenticated(result.user as PortalUser);
      } else if (stage === "register") {
        const result = await request("/auth/register", values);
        setVerificationUrl(String(result.developmentVerificationUrl || ""));
        setStage("login");
        setMessage(result.message);
      } else if (stage === "mfa") {
        const result = await request("/auth/login/mfa", { ...values, sessionToken: pendingToken });
        if (result.requiresEmailOtp) {
          setMessage(result.developmentOtp ? `Development email code: ${result.developmentOtp}` : result.message);
          setStage("email");
          return;
        }
        onAuthenticated(result.user as PortalUser);
      } else if (stage === "email") {
        const result = await request("/auth/login/email-otp", { ...values, sessionToken: pendingToken });
        onAuthenticated(result.user as PortalUser);
      } else if (stage === "setup") {
        await request("/mfa/verify", values);
        const profile = await request("/users/profile");
        onAuthenticated(profile.user as PortalUser);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to complete this request.");
    } finally {
      setBusy(false);
    }
  }

  async function beginEnrollment() {
    setBusy(true);
    setError("");
    try {
      const result = await request("/mfa/enroll", {});
      setEnrollment(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start authenticator setup.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = await request("/auth/resend-verification", values);
      setVerificationUrl(String(result.developmentVerificationUrl || ""));
      setMessage(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to resend verification.");
    }
  }

  const challenge = stage === "mfa" || stage === "email" || stage === "setup";
  const stageTitle = stage === "register" ? "Create your campus account" : stage === "mfa" ? "Verify your authenticator" : stage === "email" ? "Check your email" : stage === "setup" ? "Set up your authenticator" : "Welcome back";
  const phaseLabel = phase === 3 ? "PASSWORD · AUTHENTICATOR · EMAIL" : phase === 2 ? "PASSWORD · AUTHENTICATOR" : "PASSWORD · AUTHENTICATOR IF ENABLED";

  return (
    <main className="auth-grid min-h-screen px-5 py-8 text-white md:grid md:grid-cols-[1.1fr_.9fr] md:px-12">
      <section className="relative flex min-h-[300px] flex-col justify-between overflow-hidden py-5 md:min-h-[calc(100vh-4rem)] md:px-8">
        <a className="relative z-10 flex items-center gap-3 text-lg font-bold tracking-tight" href="/">
          <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-xl">A</span>
          AuthShield <span className="text-emerald-300">360</span>
        </a>
        <div className="relative z-10 max-w-xl py-10">
          <p className="mb-5 text-xs font-bold tracking-[.24em] text-emerald-300">IDENTITY AND ACCESS</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-6xl">One secure place to move learning <span className="text-emerald-300">forward.</span></h1>
          <p className="mt-6 max-w-md text-sm leading-6 text-emerald-50/70">Protected access for students, teachers, and campus administrators.</p>
        </div>
        <p className="relative z-10 text-xs text-emerald-50/60">AUTHSHIELD 360 · PROTECTED CAMPUS ACCESS</p>
        <div className="pointer-events-none absolute -right-24 top-24 size-96 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-10 top-40 size-64 rounded-full border border-white/10" />
      </section>

      <section className="flex items-center justify-center py-8 md:py-0">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 text-[var(--ink)] shadow-2xl shadow-black/20 md:p-10">
          <p className="text-[11px] font-bold tracking-[.18em] text-[var(--green)]">{phaseLabel}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">{stageTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {stage === "register" ? "Create student access with your campus email." : stage === "setup" ? "A verified authenticator is required before portal access." : stage === "email" ? "Enter the time-limited code sent to your account." : stage === "login" && phase === 1 ? "Use your campus credentials. If you have an authenticator enrolled, you will also verify its code." : "Use your campus credentials to continue."}
          </p>

          {message && <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{message}</p>}
          {verificationUrl && <a className="mt-3 block break-all text-sm font-semibold text-[var(--green)] underline" href={verificationUrl}>Open development verification link</a>}
          {error && <p className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}

          {stage === "setup" && !enrollment ? (
            <button className="btn-primary mt-7 w-full" type="button" onClick={beginEnrollment} disabled={busy}>Create authenticator setup</button>
          ) : (
            <form className="mt-7 space-y-4" onSubmit={submit}>
              {stage === "login" && <>
                <label className="block space-y-2 text-sm font-semibold">Username<input className="field" name="username" autoComplete="username" required /></label>
                <label className="block space-y-2 text-sm font-semibold">Password<input className="field" name="password" type="password" autoComplete="current-password" required /></label>
              </>}
              {stage === "register" && <>
                <label className="block space-y-2 text-sm font-semibold">Username<input className="field" name="username" minLength={3} autoComplete="username" required /></label>
                <label className="block space-y-2 text-sm font-semibold">Campus email<input className="field" name="email" type="email" autoComplete="email" required /></label>
                <label className="block space-y-2 text-sm font-semibold">Password<input className="field" name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required /></label>
              </>}
              {(stage === "mfa" || stage === "email" || (stage === "setup" && enrollment)) && <>
                {stage === "setup" && enrollment && <div className="rounded-xl bg-[var(--paper)] p-4 text-center">
                  {enrollment.qrCode && <img className="mx-auto mb-3 size-44" src={enrollment.qrCode} alt="Authenticator enrollment QR code" />}
                  <p className="text-sm leading-5 text-[var(--muted)]">Scan this code with your authenticator app. If this page is on the same phone, open the setup link or enter the key manually.</p>
                  {enrollment.otpAuthUrl && <a className="mt-3 inline-flex rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--green)]" href={enrollment.otpAuthUrl}>Open in authenticator app</a>}
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Manual setup key</p>
                  <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-sm">{enrollment.secret}</code>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Choose time-based (TOTP), 6 digits, with a 30-second interval. Then enter the current code below.</p>
                </div>}
                <label className="block space-y-2 text-sm font-semibold">{stage === "mfa" ? "6-digit authenticator code" : stage === "email" ? "6-digit email code" : "6-digit verification code"}
                  <input className="field" name="otpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required />
                </label>
              </>}
              <button className="btn-primary w-full disabled:cursor-wait disabled:opacity-60" type="submit" disabled={busy}>
                {busy ? "Please wait…" : stage === "register" ? "Create student account" : stage === "mfa" ? "Verify authenticator" : stage === "email" ? "Verify and continue" : stage === "setup" ? "Verify and open portal" : "Sign in"}
                {!busy && <span className="ml-2" aria-hidden="true">→</span>}
              </button>
            </form>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
            {!challenge ? <span className="text-[var(--muted)]">{stage === "register" ? "Already registered?" : "New to AuthShield?"}</span> : <span className="text-[var(--muted)]">Need another step?</span>}
            {!challenge && <button className="font-bold text-[var(--green)]" type="button" onClick={() => { setStage(stage === "register" ? "login" : "register"); setError(""); setMessage(""); setVerificationUrl(""); }}>
              {stage === "register" ? "Back to sign in" : "Create a student account"}
            </button>}
            {challenge && <button className="font-bold text-[var(--green)]" type="button" onClick={() => { setStage("login"); setPendingToken(""); setEnrollment(null); setError(""); setMessage(""); }}>Back to sign in</button>}
          </div>

          {stage === "login" && phase === 3 && <form className="mt-6 border-t border-[var(--line)] pt-5" onSubmit={resendVerification}>
            <label className="mb-2 block text-xs font-semibold text-[var(--muted)]">Need another verification link?</label>
            <div className="flex gap-2"><input className="field" name="email" type="email" placeholder="Campus email" required /><button className="rounded-xl border border-[var(--line)] px-3 text-sm font-semibold" type="submit">Resend</button></div>
          </form>}

          <p className="mt-7 border-t border-[var(--line)] pt-5 text-xs leading-5 text-[var(--muted)]">Your session is protected by a server-managed HttpOnly cookie. Only basic profile details are cached in this browser.</p>
        </div>
      </section>
    </main>
  );
}
