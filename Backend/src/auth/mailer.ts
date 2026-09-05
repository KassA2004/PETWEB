import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * The one thing that leaves this server addressed to a person.
 *
 * There is exactly one kind of message — a six-digit code — so this file is a
 * transport and one template rather than a mail subsystem. That is the whole
 * of the design: a product that sends one email does not need a queue, a
 * templating language or a provider abstraction, and adding them would be
 * three things to keep working for no message anybody would otherwise receive.
 *
 * ## Configuration
 *
 * SMTP, from the environment (`Backend/.env.example`):
 *
 * ```text
 *   SMTP_URL          smtp://user:pass@host:587  — everything in one string
 *   MAIL_FROM         "Pocus <hello@your-domain>"
 * ```
 *
 * A URL rather than five separate variables because that is what a mail
 * provider gives you, and splitting it up is an opportunity to get one of the
 * five wrong. `smtps://` selects implicit TLS on 465; `smtp://` on 587 upgrades
 * with STARTTLS, which nodemailer does by default and which this does not turn
 * off.
 *
 * ## When it is not configured
 *
 * Development, mostly, and the honest answer there is not to pretend. The
 * transport is null, `sendVerificationCode` writes the code to the server log
 * with a loud warning, and it **says so in the log every time** rather than
 * once — a server quietly printing verification codes is a thing you want to
 * notice you have running.
 *
 * It does not fail closed, and that is a deliberate, narrow exception: failing
 * closed would mean nobody can register locally without a mail account, and the
 * check that actually matters — that the address is real — is still enforced by
 * `email-address.ts` and by the code having to be typed back in. In production
 * `MAIL_REQUIRED=1` turns the exception off and a missing transport becomes a
 * refusal, which is what a deployment should set.
 */

const logger = new Logger('Mailer');

/**
 * Built once, lazily, and kept.
 *
 * A transporter holds a connection pool; building one per message would open a
 * TCP connection and do a TLS handshake for every code sent.
 */
let transport: Transporter | null | undefined;

function mailer(): Transporter | null {
  if (transport !== undefined) return transport;

  const url = process.env.SMTP_URL;
  if (!url) {
    transport = null;
    return null;
  }

  transport = nodemailer.createTransport({
    url,
    // A verification code is worthless in ninety seconds, so a mail server that
    // is not answering should surface as a failed send rather than as a request
    // that hangs until the browser gives up on it.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
    pool: true,
    maxConnections: 3,
  });

  return transport;
}

/** Whether a real mail server is configured. */
export function mailerConfigured(): boolean {
  return mailer() !== null;
}

const FROM = process.env.MAIL_FROM ?? 'Pocus <no-reply@pocus.local>';

/** How long a code is good for, in words, so the email and the UI agree. */
export const CODE_LIFETIME_MINUTES = 10;

/**
 * What a verification code is being asked for.
 *
 * Better Auth's own vocabulary, passed straight through, because the four
 * cases genuinely read differently to the person receiving one: "finish
 * signing up" and "somebody is trying to change your email" are not the same
 * message and must not look like it.
 */
export type CodePurpose =
  | 'sign-in'
  | 'email-verification'
  | 'forget-password'
  | 'change-email';

const SUBJECTS: Record<CodePurpose, string> = {
  'email-verification': 'Your Pocus verification code',
  'sign-in': 'Your Pocus sign-in code',
  'forget-password': 'Reset your Pocus password',
  'change-email': 'Confirm your new Pocus address',
};

const LEADS: Record<CodePurpose, string> = {
  'email-verification': 'Here is the code that finishes setting up your world.',
  'sign-in': 'Here is the code to sign in.',
  'forget-password': 'Here is the code to set a new password.',
  'change-email': 'Here is the code to confirm this address.',
};

/**
 * The message.
 *
 * Table-based, inline-styled and with a plain-text twin, because that is what
 * survives a mail client. No images and no web fonts — the same rule the
 * product holds itself to, and here it is also what keeps the message out of a
 * spam filter and readable with images turned off.
 */
function body(code: string, purpose: CodePurpose): { text: string; html: string } {
  const lead = LEADS[purpose];
  const spaced = code.split('').join(' ');

  const text = [
    lead,
    '',
    `    ${spaced}`,
    '',
    `This code expires in ${CODE_LIFETIME_MINUTES} minutes and can be used once.`,
    'If you did not ask for it, you can ignore this email — nothing has changed.',
    '',
    'Pocus',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:#f7e8d6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7e8d6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fffaf3;border-radius:16px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#3b2c31;">
        <tr><td style="font-size:18px;font-weight:600;letter-spacing:-0.01em;padding-bottom:16px;">Pocus</td></tr>
        <tr><td style="font-size:15px;line-height:1.55;padding-bottom:24px;">${lead}</td></tr>
        <tr><td align="center" style="font-size:32px;font-weight:700;letter-spacing:0.32em;padding:16px 0 16px 12px;background:#f2e2cf;border-radius:12px;">${code}</td></tr>
        <tr><td style="font-size:13px;line-height:1.55;color:#7a6a6f;padding-top:24px;">
          This code expires in ${CODE_LIFETIME_MINUTES} minutes and can be used once.<br />
          If you did not ask for it, you can ignore this email — nothing has changed.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { text, html };
}

/**
 * Send somebody their code.
 *
 * Throws when the mail could not be handed to a server, so the caller can tell
 * the person their code is not coming rather than leaving them staring at an
 * empty inbox. Better Auth calls this from inside `sendVerificationOTP`, where
 * a throw becomes a failed request — which is the correct outcome: an account
 * that cannot be verified should not appear to have been created.
 */
export async function sendVerificationCode(
  email: string,
  code: string,
  purpose: CodePurpose,
): Promise<void> {
  const transporter = mailer();

  if (!transporter) {
    if (process.env.MAIL_REQUIRED === '1') {
      throw new Error('No SMTP_URL is configured, so no verification code can be sent.');
    }

    logger.warn(
      `SMTP is not configured. The ${purpose} code for ${email} is ${code} — ` +
        'printed here because there is nowhere to send it. Set SMTP_URL.',
    );
    return;
  }

  const { text, html } = body(code, purpose);

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: SUBJECTS[purpose],
    text,
    html,
  });
}
