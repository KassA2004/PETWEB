import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, FormEvent, KeyboardEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { authClient } from '../../lib/auth-client';
import { cn } from '../../lib/utils';
import { authErrorMessage } from './error-messages';

/** Six, and the server agrees (`Backend/src/auth/auth.ts`, `otpLength`). */
const LENGTH = 6;

/**
 * How long before the code can be asked for again, in seconds.
 *
 * Matches the server's own limit on `send-verification-otp` — two in sixty
 * seconds — with a little room, so pressing the button always does something
 * rather than being refused by a rule the user cannot see.
 */
const RESEND_COOLDOWN = 35;

interface VerifyFormProps {
  /** The address the code went to. Shown, and sent back with the code. */
  email: string;
  /** A session now exists: Better Auth signs the user in on success. */
  onVerified: () => void;
  /** Go back and use a different address. */
  onChangeEmail: () => void;
}

/**
 * The last step of signing up: proving the address is yours.
 *
 * An account exists at this point and cannot be signed in to. That is the
 * whole point — `requireEmailVerification` on the server means there is no
 * state in which a made-up address is a usable account — and it is why this is
 * a *step* rather than a banner somebody can dismiss.
 *
 * ## Six boxes, not one field
 *
 * Because the thing being typed is not a word. Six separate inputs advance by
 * themselves, make a wrong digit a single backspace to fix, and read as "this
 * is a code" without a sentence explaining it. The costs are real and are paid
 * here rather than left as bugs:
 *
 * ```text
 *   paste          a code copied out of a mail client arrives in one box.
 *                  `onPaste` spreads it across all six
 *   autofill       one input carries `autocomplete="one-time-code"`, which is
 *                  what iOS and Android read to offer the code from the SMS or
 *                  mail they just received; the browser fills it whole, so it
 *                  goes through the same spreading path as a paste
 *   backspace      on an empty box, moves to the previous one and clears it,
 *                  which is what everybody expects and nothing does by default
 *   screen readers one group with one label, and the boxes are numbered
 * ```
 *
 * ## What it never says
 *
 * Whether the address exists, whether the account exists, or how many guesses
 * are left. A wrong code is a wrong code. The server counts the attempts (five)
 * and expires the code (ten minutes); saying more here would only help somebody
 * who is not the owner of the mailbox.
 */
export function VerifyForm({ email, onVerified, onChangeEmail }: VerifyFormProps) {
  const [digits, setDigits] = useState<string[]>(() => Array<string>(LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  /*
   * The resend timer.
   *
   * Starts immediately rather than on the first press: the code was already
   * sent — by the sign-up, or by the sign-in that found the address unverified —
   * so the user is already inside the window when they get here.
   */
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    boxes.current[0]?.focus();
  }, []);

  const code = digits.join('');

  const submit = async (value: string) => {
    setError(null);
    setNotice(null);
    setSubmitting(true);

    const { error: failure } = await authClient.emailOtp.verifyEmail({
      email,
      otp: value,
    });

    setSubmitting(false);

    if (failure) {
      setDigits(Array<string>(LENGTH).fill(''));
      boxes.current[0]?.focus();
      setError(
        authErrorMessage(failure, 'That code is not right. Check it and try again.'),
      );
      return;
    }

    // `autoSignInAfterVerification` on the server means a session exists now,
    // so this lands in the world rather than back at a login form.
    onVerified();
  };

  /** Put a run of digits into the boxes from `at`, and submit if that fills them. */
  const fill = (at: number, incoming: string) => {
    const clean = incoming.replace(/\D/g, '');
    if (!clean) return;

    const next = [...digits];
    for (let i = 0; i < clean.length && at + i < LENGTH; i += 1) {
      next[at + i] = clean[i];
    }
    setDigits(next);

    const landed = Math.min(at + clean.length, LENGTH - 1);
    boxes.current[landed]?.focus();

    const whole = next.join('');
    if (whole.length === LENGTH && !whole.includes('')) void submit(whole);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      boxes.current[index - 1]?.focus();
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      boxes.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < LENGTH - 1) {
      event.preventDefault();
      boxes.current[index + 1]?.focus();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>, index: number) => {
    event.preventDefault();
    fill(index, event.clipboardData.getData('text'));
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    setCooldown(RESEND_COOLDOWN);

    const { error: failure } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: 'email-verification',
    });

    if (failure) {
      setError(authErrorMessage(failure, 'We could not send another code just now.'));
      return;
    }
    setNotice('Sent. It can take a minute to arrive.');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (code.length === LENGTH) void submit(code);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        We sent a six-digit code to <span className="text-foreground">{email}</span>. Enter
        it to finish setting up your world.
      </p>

      <div
        role="group"
        aria-label="Verification code"
        className="flex items-center justify-between gap-1.5"
      >
        <Label htmlFor="code-1" className="sr-only">
          Verification code
        </Label>
        {digits.map((digit, index) => (
          <input
            key={index}
            id={`code-${index + 1}`}
            ref={(node) => {
              boxes.current[index] = node;
            }}
            // `text` with a numeric mode rather than `type="number"`: a number
            // input brings spinners, accepts "e" and "-", and silently drops a
            // leading zero. `inputMode` is what actually raises the digit pad.
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            // One box carries it, not all six: the browser fills the field it
            // is on with the whole code, and `fill` spreads it from there.
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${index + 1} of ${LENGTH}`}
            value={digit}
            disabled={submitting}
            onChange={(event) => fill(index, event.target.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            onPaste={(event) => onPaste(event, index)}
            onFocus={(event) => event.target.select()}
            className={cn(
              'h-12 w-full min-w-0 rounded-lg border border-border bg-card text-center',
              'text-lg font-semibold tabular-nums text-card-foreground',
              'outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:opacity-60',
              error && 'border-destructive',
            )}
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      <Button type="submit" disabled={submitting || code.length < LENGTH} className="mt-1">
        {submitting ? 'Checking…' : 'Verify and continue'}
      </Button>

      <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
        <button
          type="button"
          disabled={cooldown > 0 || submitting}
          onClick={() => void resend()}
          className={cn(
            'font-medium text-primary underline-offset-4 hover:underline',
            'disabled:text-muted-foreground disabled:no-underline',
          )}
        >
          {cooldown > 0 ? `Send another code in ${cooldown}s` : 'Send another code'}
        </button>
        <button
          type="button"
          onClick={onChangeEmail}
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Use a different email
        </button>
      </div>
    </form>
  );
}
