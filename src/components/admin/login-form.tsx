"use client";

import { useActionState, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, TriangleAlert } from "lucide-react";
import { loginAction, type LoginState } from "@/lib/admin/actions";
import { cn } from "@/lib/utils";
import { Btn, inputClasses } from "./ui";

/* ─────────────────────────────────────────────────────────────
   The studio's front door. With users in .env.local it asks for
   an email and password; on the older single-password setup, the
   password only. Rate limiting, the constant-time check and the
   session cookie all happen in loginAction on the server.
   ───────────────────────────────────────────────────────────── */

export type LoginMode = "email" | "password";

export function LoginForm({ next, mode }: { next: string; mode: LoginMode }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const withEmail = mode === "email";
  // Hidden while checking, so each new error mounts fresh and shakes again.
  const error = pending ? undefined : state.error;

  // After a failed attempt the password is cleared (the email stays): put the cursor where it's needed.
  useEffect(() => {
    if (!state.error) return;
    if (withEmail && !state.email) emailInput.current?.focus();
    else passwordInput.current?.focus();
  }, [state, withEmail]);

  const trackCaps = (event: KeyboardEvent<HTMLInputElement>) => setCaps(event.getModifierState("CapsLock"));
  const describedBy = error ? "admin-login-error" : undefined;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />

      {withEmail ? (
        <div>
          <label htmlFor="admin-email" className="text-[0.82rem] font-medium text-dim">
            Email
          </label>
          <div className="relative mt-2">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
            <input
              ref={emailInput}
              id="admin-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={320}
              required
              autoFocus
              disabled={pending}
              defaultValue={state.email}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              placeholder="you@studio.com"
              className={inputClasses(!!error, "h-12 pl-10 text-[0.95rem]")}
            />
          </div>
        </div>
      ) : (
        // Lets password managers file the credential under a name.
        <input type="text" name="username" autoComplete="username" defaultValue="studio" className="sr-only" tabIndex={-1} aria-hidden="true" readOnly />
      )}

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="admin-password" className="text-[0.82rem] font-medium text-dim">
            Password
          </label>
          {caps && (
            <span className="inline-flex items-center gap-1.5 text-[0.72rem] font-medium text-warn" role="status">
              <TriangleAlert className="size-3" aria-hidden="true" /> Caps Lock is on
            </span>
          )}
        </div>
        <div className="relative mt-2">
          <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input
            ref={passwordInput}
            id="admin-password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={512}
            required
            autoFocus={!withEmail}
            disabled={pending}
            onKeyDown={trackCaps}
            onKeyUp={trackCaps}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            placeholder="••••••••••••"
            className={inputClasses(!!error, "h-12 pl-10 pr-12 font-mono text-[0.95rem] tracking-[0.04em]")}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-faint transition-colors hover:bg-white/[0.06] hover:text-ink focus-visible:outline-2 focus-visible:outline-em"
          >
            {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {error && (
        <p
          id="admin-login-error"
          role="alert"
          className="admin-shake flex items-start gap-2.5 rounded-xl border border-danger/35 bg-danger/[0.07] px-3.5 py-3 text-[0.84rem] leading-snug text-danger"
        >
          <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <Btn type="submit" variant="primary" loading={pending} className={cn("group/unlock h-12 w-full text-[0.95rem]")}>
        {pending ? "Checking…" : withEmail ? "Sign in" : "Unlock the studio"}
        {!pending && <ArrowRight className="transition-transform duration-300 group-hover/unlock:translate-x-0.5" aria-hidden="true" />}
      </Btn>
    </form>
  );
}
