import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { authClient } from '../../lib/auth-client';
import { authErrorMessage } from './error-messages';
import { loginSchema } from './schemas';

interface LoginFormProps {
  onSuccess: () => void;
  /**
   * The account exists but its address has never been proved.
   *
   * Better Auth refuses the sign-in and sends a fresh code, so this is not an
   * error to display — it is the rest of a sign-up somebody abandoned, and the
   * caller shows `VerifyForm` to finish it.
   */
  onNeedsVerification: (email: string) => void;
  onSwitchToRegister: () => void;
}

type FieldErrors = Partial<Record<'email' | 'password', string>>;

export function LoginForm({
  onSuccess,
  onNeedsVerification,
  onSwitchToRegister,
}: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    const { error } = await authClient.signIn.email({
      email: result.data.email,
      password: result.data.password,
    });

    setSubmitting(false);

    if (error) {
      // The one failure that is not a failure: the password was right and the
      // address was never confirmed. The server has just sent another code.
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        onNeedsVerification(result.data.email);
        return;
      }

      setFormError(authErrorMessage(error, 'Could not log you in. Please try again.'));
      return;
    }

    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!fieldErrors.email}
          disabled={submitting}
        />
        {fieldErrors.email && <p className="text-sm text-destructive">{fieldErrors.email}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!fieldErrors.password}
          disabled={submitting}
        />
        {fieldErrors.password && <p className="text-sm text-destructive">{fieldErrors.password}</p>}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={submitting} className="mt-2">
        {submitting ? 'Opening the door…' : 'Log in'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </button>
      </p>
    </form>
  );
}
