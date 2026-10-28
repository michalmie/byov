/**
 * Outbound auth mail: one-time codes and magic links.
 *
 * Uses SMTP via nodemailer when SMTP_HOST is configured; otherwise logs the
 * message to the console so passwordless sign-in still works in development
 * (the code/link is readable in the server log). Server-only: never import
 * this module from `middleware.ts` or client components.
 */
import nodemailer from "nodemailer";

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}

function smtpPort(): number {
  const parsed = Number.parseInt(process.env.SMTP_PORT ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
}

export async function sendMail(input: SendMailInput): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    console.log(
      `[auth-mail] dev fallback — no SMTP configured. To: ${input.to} | Subject: ${input.subject}\n${input.text}`,
    );
    return;
  }

  const port = smtpPort();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    ...(user && pass ? { auth: { user, pass } } : {}),
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM?.trim() || "BYOV <no-reply@byov.local>",
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
  });
}

export function otpEmail(code: string): { subject: string; text: string } {
  return {
    subject: "Your BYOV sign-in code",
    text: `Your BYOV sign-in code is ${code}. It expires in 10 minutes.\n\nIf you did not request this code, you can ignore this email.`,
  };
}

export function magicLinkEmail(link: string): { subject: string; text: string } {
  return {
    subject: "Your BYOV sign-in link",
    text: `Sign in to BYOV with this link (expires in 10 minutes):\n\n${link}\n\nIf you did not request this link, you can ignore this email.`,
  };
}

export interface SignInEmailInput {
  code?: string;
  link?: string;
}

/**
 * The sign-in email: one message carrying both artifacts so the user picks
 * either. Falls back to the single-method template when only one method is
 * enabled. At least one of code/link is required.
 */
export function signInEmail(input: SignInEmailInput): {
  subject: string;
  text: string;
} {
  if (input.code && input.link) {
    return {
      subject: "Your BYOV sign-in code and link",
      text:
        `Your BYOV sign-in code is ${input.code}. It expires in 10 minutes.\n\n` +
        `Or sign in with this link (expires in 10 minutes):\n\n${input.link}\n\n` +
        `If you did not request this email, you can ignore it.`,
    };
  }
  if (input.code) {
    return otpEmail(input.code);
  }
  if (input.link) {
    return magicLinkEmail(input.link);
  }
  throw new Error("signInEmail needs a code, a link, or both.");
}
