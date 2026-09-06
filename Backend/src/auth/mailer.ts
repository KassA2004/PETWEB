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
 * Development, mostly, and there the useful thing is not a refusal — it is
 * being able to *see the email*. So with no `SMTP_URL` this falls back to
 * **Ethereal**, nodemailer's own throwaway SMTP service: it creates a test
 * account on the fly, accepts the message, delivers it nowhere, and hands back
 * a URL where the rendered mail can be read. Zero configuration, and it answers
 * the question a logged six-digit code cannot ("does the message look right").
 *
 * The code is written to the log as well, every time, in both modes — because
 * Ethereal needs the network and the log does not, and because a server quietly
 * printing verification codes is a thing you want to keep noticing you have
 * running.
 *
 * None of this fails closed, and that is a deliberate, narrow exception:
 * failing closed would mean nobody can register locally without a mail account,
 * and the check that actually matters — that the address is real — is still
 * enforced by `email-address.ts` and by the code having to be typed back in.
 *
 * **`MAIL_REQUIRED=1` turns the exception off**, and every deployment should
 * set it: no `SMTP_URL` then becomes a refusal, Ethereal is never reached for,
 * and the code is never logged.
 */

const logger = new Logger('Mailer');

/** How this process is sending mail. Decided once, reported at boot. */
export type MailMode = 'smtp' | 'ethereal' | 'log' | 'refuse';

export function mailMode(): MailMode {
  if (process.env.SMTP_URL) return 'smtp';
  return process.env.MAIL_REQUIRED === '1' ? 'refuse' : 'ethereal';
}

/**
 * One line at boot saying which of the four this is.
 *
 * Worth a line of startup noise because the failure it prevents is the one
 * that wastes an afternoon: sign-up succeeds, the code never arrives, and
 * nothing anywhere says that no mail server was ever configured. Called from
 * `main.ts`.
 */
export function describeMailer(): string {
  switch (mailMode()) {
    case 'smtp':
      return `Mail: SMTP, from ${FROM}.`;
    case 'refuse':
      return 'Mail: NOT CONFIGURED and MAIL_REQUIRED=1 — sign-up will be refused. Set SMTP_URL.';
    default:
      return (
        'Mail: no SMTP_URL, so verification codes go to a throwaway Ethereal ' +
        'inbox and are printed below. Set SMTP_URL before deploying.'
      );
  }
}

/**
 * Built once, lazily, and kept.
 *
 * A transporter holds a connection pool; building one per message would open a
 * TCP connection and do a TLS handshake for every code sent.
 *
 * The promise, not the transporter, is what is cached: building the Ethereal
 * one is a network round trip, and two sign-ups landing at the same moment must
 * not each create a throwaway account.
 */
let building: Promise<Transporter | null> | undefined;

function mailer(): Promise<Transporter | null> {
  building ??= build().catch((error) => {
    // Reset, so a transport that failed to build because the network was down
    // is retried on the next send rather than being null for the process's life.
    building = undefined;
    logger.warn(`Could not build a mail transport: ${error}`);
    return null;
  });

  return building;
}

async function build(): Promise<Transporter | null> {
  const url = process.env.SMTP_URL;

  if (url) {
    return nodemailer.createTransport({
      url,
      // A verification code is worthless in ninety seconds, so a mail server
      // that is not answering should surface as a failed send rather than as a
      // request that hangs until the browser gives up on it.
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
      pool: true,
      maxConnections: 3,
    });
  }

  if (mailMode() !== 'ethereal') return null;

  /*
   * No configuration: a throwaway inbox, so the message can be looked at.
   *
   * `createTestAccount` registers with Ethereal and returns SMTP credentials
   * for a mailbox that accepts everything and delivers nothing. The point is
   * the preview URL logged after each send — the rendered email, exactly as a
   * client would show it, which is the one thing a logged code cannot tell you.
   *
   * Not pooled: this is one developer's occasional sign-up, and a pool held
   * open against a service that will forget the account tomorrow is a
   * connection kept for nothing.
   */
  const account = await nodemailer.createTestAccount();
  logger.log(`Ethereal test inbox: ${account.user}`);

  return nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
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
  if (mailMode() === 'refuse') {
    throw new Error('No SMTP_URL is configured, so no verification code can be sent.');
  }

  /*
   * The code, in the log, before anything is attempted.
   *
   * Only when there is no real mail server — a production process must never
   * write a live credential to its logs — but in that case it goes out *first*,
   * so it is there whether the send works, fails, or times out against a
   * network that is not available. It is the path that cannot break.
   */
  if (mailMode() !== 'smtp') {
    logger.warn(`No SMTP_URL. The ${purpose} code for ${email} is ${code}`);
  }

  const transporter = await mailer();
  if (!transporter) return;

  const { text, html } = body(code, purpose);

  const info = await transporter.sendMail({
    from: FROM,
    to: email,
    subject: SUBJECTS[purpose],
    text,
    html,
  });

  // Ethereal only: where to read the message that was just "sent".
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) logger.log(`Read it here: ${preview}`);
}
