import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

type Mode = 'login' | 'register';

interface AuthScreenProps {
  /** Called once a session exists (sign-in or sign-up both land here). */
  onAuthenticated: () => void;
  initialMode?: Mode;
}

/**
 * The landing screen for a user with no session — the other half of the
 * "route to the creator vs. route to the world" decision in
 * /Docs/API-endpoints/02-user-endpoints.md §4, one level up: here it's
 * "route to auth vs. route to the app" at all.
 */
export function AuthScreen({ onAuthenticated, initialMode = 'register' }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 25% 20%, rgba(245,223,160,0.16), transparent 60%),' +
            'radial-gradient(70% 60% at 80% 90%, rgba(232,180,200,0.12), transparent 60%)',
        }}
      />

      <Card className="relative w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-2xl">
            {mode === 'register' ? 'Start your world' : 'Welcome back'}
          </CardTitle>
          <CardDescription>
            {mode === 'register'
              ? 'Create an account to name your room and, soon, your creature.'
              : 'Log in to return to your room.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === 'register' ? (
            <RegisterForm onSuccess={onAuthenticated} onSwitchToLogin={() => setMode('login')} />
          ) : (
            <LoginForm onSuccess={onAuthenticated} onSwitchToRegister={() => setMode('register')} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
