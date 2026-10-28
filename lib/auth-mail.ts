/**
 * Outbound auth mail: one-time codes and magic links.
 *
 * Sends through the default sending account (Settings-saved wins, else
 * SMTP_* env); otherwise logs the message to the console so
 * passwordless sign-in still works in development (the code/link is
 * readable in the server log). Server-only: never import this module
 * from `middleware.ts` or client components.
 */
import nodemailer from "nodemailer";
import {
  DEFAULT_FROM,
  getEffectiveMailAccount,
  type EffectiveMailAccount,
} from "./mail-config";

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function isMailConfigured(): boolean {
  return getEffectiveMailAccount() !== null;
}

function transportSecurity(account: EffectiveMailAccount): {
  secure: boolean;
  requireTLS?: true;
} {
  if (account.security === "ssl") {
    return { secure: true };
  }
  if (account.security === "starttls") {
    return { secure: false, requireTLS: true };
  }
  return { secure: account.port === 465 };
}

export async function sendMail(input: SendMailInput): Promise<void> {
  const account = getEffectiveMailAccount();
  if (!account) {
    console.log(
      `[auth-mail] dev fallback — no sending account configured. To: ${input.to} | Subject: ${input.subject}\n${input.text}`,
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    ...transportSecurity(account),
    ...(account.user && account.pass
      ? { auth: { user: account.user, pass: account.pass } }
      : {}),
  });

  await transporter.sendMail({
    from: account.from || DEFAULT_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
  });
}

export interface AuthEmail {
  subject: string;
  text: string;
  html: string;
}

/** Escape text for HTML email bodies. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Branded HTML shell for auth emails: table layout with inline styles only,
 * since mail clients ignore stylesheets. The hex palette mirrors the BYOV
 * CSS tokens (paper, card, near-black action), which clients cannot parse
 * as oklch(). The heading is escaped; bodyHtml must already be safe —
 * build it with the helpers below, never from raw user input.
 */
export function emailShell({
  heading,
  bodyHtml,
  footer = "This code and link expire in 10 minutes. If you did not request this email, you can ignore it.",
}: {
  heading: string;
  bodyHtml: string;
  footer?: string;
}): string {
  return (
    `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f2f2f0;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">` +
    `<tr><td align="center">` +
    `<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e3e3e0;border-radius:8px;">` +
    `<tr><td style="padding:32px 32px 8px 32px;">` +
    `<div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#1c1c1c;">BYOV</div>` +
    `<div style="font-size:13px;color:#737373;">Bring Your Own Vibe</div>` +
    `</td></tr>` +
    `<tr><td style="padding:16px 32px 8px 32px;">` +
    `<h1 style="margin:0;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:#1c1c1c;">${escapeHtml(heading)}</h1>` +
    `</td></tr>` +
    `<tr><td style="padding:8px 32px 32px 32px;font-size:14px;line-height:1.6;color:#3d3d3d;">${bodyHtml}</td></tr>` +
    `<tr><td style="padding:0 32px 28px 32px;font-size:12px;line-height:1.6;color:#8a8a8a;">` +
    `${escapeHtml(footer)}` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

/** The 6-digit code in a large letter-spaced mono well. */
function codeHtml(code: string): string {
  return (
    `<div style="margin:16px 0;padding:18px 12px 18px 22px;background:#f2f2f0;border-radius:6px;text-align:center;` +
    `font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:10px;color:#1c1c1c;">` +
    `${escapeHtml(code)}</div>`
  );
}

/** Near-black sign-in button plus a plain-URL fallback for clipboards. */
function ctaHtml(link: string, label: string): string {
  const safeLink = escapeHtml(link);
  return (
    `<div style="margin:20px 0 8px 0;text-align:center;">` +
    `<a href="${safeLink}" style="display:inline-block;padding:12px 28px;background:#262626;color:#ffffff;` +
    `border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(label)}</a>` +
    `</div>` +
    `<div style="margin:12px 0 4px 0;font-size:12px;line-height:1.6;color:#737373;overflow-wrap:anywhere;">` +
    `Or paste this link into your browser:<br><a href="${safeLink}" style="color:#525252;">${safeLink}</a>` +
    `</div>`
  );
}

export function otpEmail(code: string): AuthEmail {
  return {
    subject: "Your BYOV sign-in code",
    text: `Your BYOV sign-in code is ${code}. It expires in 10 minutes.\n\nIf you did not request this code, you can ignore this email.`,
    html: emailShell({
      heading: "Your sign-in code",
      bodyHtml:
        `<p style="margin:0 0 4px 0;">Enter this 6-digit code on the sign-in page:</p>` +
        codeHtml(code),
    }),
  };
}

export function magicLinkEmail(link: string): AuthEmail {
  return {
    subject: "Your BYOV sign-in link",
    text: `Sign in to BYOV with this link (expires in 10 minutes):\n\n${link}\n\nIf you did not request this link, you can ignore this email.`,
    html: emailShell({
      heading: "Your sign-in link",
      bodyHtml:
        `<p style="margin:0;">Sign in to BYOV with one click:</p>` +
        ctaHtml(link, "Sign in to BYOV"),
    }),
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
export function signInEmail(input: SignInEmailInput): AuthEmail {
  if (input.code && input.link) {
    const { code, link } = input;
    return {
      subject: "Your BYOV sign-in code and link",
      text:
        `Your BYOV sign-in code is ${code}. It expires in 10 minutes.\n\n` +
        `Or sign in with this link (expires in 10 minutes):\n\n${link}\n\n` +
        `If you did not request this email, you can ignore it.`,
      html: emailShell({
        heading: "Your sign-in code and link",
        bodyHtml:
          `<p style="margin:0 0 4px 0;">Enter this 6-digit code on the sign-in page:</p>` +
          codeHtml(code) +
          `<p style="margin:20px 0 0 0;">Or sign in with one click:</p>` +
          ctaHtml(link, "Sign in to BYOV"),
      }),
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

/** The admin test email (Settings → Email → Send test) in the same shell. */
export function testEmailHtml(sendingAccountLabel: string): string {
  return emailShell({
    heading: "BYOV test email",
    bodyHtml:
      `<p style="margin:0;">This test email was sent from your BYOV workspace ` +
      `(${escapeHtml(sendingAccountLabel)} sending account). ` +
      `If you received it, notifications will reach your users.</p>`,
    footer: "Sent from Settings → Email to check the sending account.",
  });
}
