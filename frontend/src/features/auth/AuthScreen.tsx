import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Link } from '../../components/ui/link';
import { cn } from '../../lib/utils';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { VerifyForm } from './VerifyForm';

type Mode = 'login' | 'register';

interface AuthScreenProps {
  /** Called once a session exists (sign-in or sign-up both land here). */
  onAuthenticated: () => void;
  /** Which form to show. Comes from the address bar, not from local state. */
  mode: Mode;
  /** Switching between the two is a navigation — see `AuthGate`. */
  onModeChange: (mode: Mode) => void;
}

/**
 * The way in, for somebody who has arrived at the front door and decided.
 *
 * It used to be the entire signed-out product: one card floating on a beige
 * field, with no name on it, no way back and no indication of what was on the
 * other side. It is now the second screen rather than the first, which changes
 * what it has to do — the home page has already made the case, so this only has
 * to be a form that clearly belongs to the same thing.
 *
 * Three additions, and each one is a question the old screen could not answer:
 *
 * ```text
 *   the name, linked home    "what is this, and can I go back and look?"
 *   the two modes as routes  "I meant to log in" — now the back button works
 *   the same warm light      "is this the same product?" — yes, same palette
 * ```
 *
 * ## The third state, which is not a third route
 *
 * Proving an email address is a *step inside* signing up rather than a place,
 * so it is local state here and not in the address bar. That is deliberate:
 * `/verify` would be a URL somebody could bookmark, share or reload back into,
 * and it means nothing on its own — the code it is waiting for was sent to an
 * address this screen only knows because the form above it just used it. A
 * reload correctly puts the person back at the form, where signing in again
 * will send them a fresh code.
 *
 * Both forms can reach it, and it is the same step from both:
 *
 * ```text
 *   register  ->  account created, no session, code sent      -> verify
 *   log in    ->  password right, address never confirmed     -> verify
 * ```
 */
export function AuthScreen({ onAuthenticated, mode, onModeChange }: AuthScreenProps) {
  /*
   * The address awaiting a code, and which form sent it there.
   *
   * The mode is stored alongside the address so that the step can be *derived*
   * away rather than cleared. Navigating — the back button, or the switch link
   * under either form — changes `mode`, and a pending verification that belongs
   * to the other mode simply stops being the thing rendered. No effect, no
   * cascading render, and coming forward again restores it.
   */
  const [pending, setPending] = useState<{ mode: Mode; email: string } | null>(null);
  const verifying = pending?.mode === mode ? pending.email : null;
  const awaitCode = (email: string) => setPending({ mode, email });

  const title = verifying
    ? 'Check your email'
    : mode === 'register'
      ? 'Start Your World'
      : 'Welcome Back';

  const blurb = verifying
    ? 'One code, and the door opens.'
    : mode === 'register'
      ? 'A creature, a room, and one small goal at a time.'
      : 'Your room is where you left it.';

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 25% 20%, rgba(245,223,160,0.16), transparent 60%),' +
            'radial-gradient(70% 60% at 80% 90%, rgba(232,180,200,0.12), transparent 60%)',
        }}
      />

      <header
        className={cn(
          'relative mx-auto flex w-full max-w-6xl items-center gap-3 px-5 py-3 sm:px-8',
          'pt-[max(0.75rem,env(safe-area-inset-top))]',
        )}
      >
        <Link
          to="home"
          className={cn(
            'press inline-flex items-center gap-2 rounded-lg px-2 py-1.5',
            'text-sm font-semibold tracking-tight hover:bg-muted',
          )}
        >
          <ArrowLeft aria-hidden className="size-4 text-muted-foreground" />
          Pocus
        </Link>
      </header>

      <main
        id="main"
        className="relative flex flex-1 items-center justify-center px-4 pt-4 pb-[max(3rem,env(safe-area-inset-bottom))]"
      >
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription className="text-pretty">{blurb}</CardDescription>
          </CardHeader>
          <CardContent>
            {verifying ? (
              <VerifyForm
                email={verifying}
                onVerified={onAuthenticated}
                onChangeEmail={() => setPending(null)}
              />
            ) : mode === 'register' ? (
              <RegisterForm
                onCodeSent={awaitCode}
                onSwitchToLogin={() => onModeChange('login')}
              />
            ) : (
              <LoginForm
                onSuccess={onAuthenticated}
                onNeedsVerification={awaitCode}
                onSwitchToRegister={() => onModeChange('register')}
              />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
