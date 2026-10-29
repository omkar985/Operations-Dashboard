/**
 * Branded transactional email templates (Command Centre).
 *
 * Email clients do not support CSS variables or external stylesheets, so these templates are the one
 * place where literal brand hex values are unavoidable. They intentionally mirror the light-theme tokens.
 */

const C = {
  canvas: "#EEF2F5",
  card: "#FFFFFF",
  ink: "#172B40",
  muted: "#596B7D",
  line: "#E0E7ED",
  primary: "#1588C9",
  primaryText: "#FFFFFF",
};

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function layout(opts: { preheader: string; heading: string; paragraphs: string[]; cta: { label: string; url: string }; footnote: string }): string {
  const paras = opts.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.ink};">${escapeHtml(p)}</p>`)
    .join("");
  const url = escapeHtml(opts.cta.url);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.canvas};font-family:'DM Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};padding:32px 12px;"><tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${C.card};border:1px solid ${C.line};border-radius:10px;overflow:hidden;">
    <tr><td style="height:4px;background:${C.primary};line-height:4px;font-size:0;">&nbsp;</td></tr>
    <tr><td style="padding:28px 32px 4px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${C.primary};">Operations Dashboard</div>
      <h1 style="margin:10px 0 18px;font-family:'DM Serif Display',Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.15;color:${C.ink};">${escapeHtml(opts.heading)}</h1>
      ${paras}
    </td></tr>
    <tr><td style="padding:6px 32px 8px;">
      <a href="${url}" style="display:inline-block;background:${C.primary};color:${C.primaryText};text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:6px;">${escapeHtml(opts.cta.label)}</a>
    </td></tr>
    <tr><td style="padding:18px 32px 6px;">
      <p style="margin:0;font-size:12.5px;line-height:1.6;color:${C.muted};">If the button does not work, copy and paste this address into your browser:</p>
      <p style="margin:6px 0 0;font-size:12.5px;line-height:1.5;word-break:break-all;"><a href="${url}" style="color:${C.primary};">${url}</a></p>
    </td></tr>
    <tr><td style="padding:20px 32px 28px;">
      <hr style="border:0;border-top:1px solid ${C.line};margin:0 0 14px;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:${C.muted};">${escapeHtml(opts.footnote)}</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC";

export function renderInvitationEmail(input: { url: string; inviterName: string | null; role: "ADMIN" | "USER"; expiresAt: string }): RenderedEmail {
  const who = input.inviterName ? `${input.inviterName} has` : "An administrator has";
  const roleText = input.role === "ADMIN" ? "an administrator" : "a team member";
  const subject = "You’ve been invited to Operations Dashboard";
  const body = [
    `${who} invited you to join Operations Dashboard as ${roleText}.`,
    `Choose a password to activate your account. This invitation can be used once and expires on ${fmtDate(input.expiresAt)}.`,
  ];
  const footnote = "If you were not expecting this invitation you can safely ignore this email — no account is created until you accept.";
  return {
    subject,
    text: `${subject}\n\n${body.join("\n\n")}\n\nActivate your account:\n${input.url}\n\n${footnote}\n`,
    html: layout({ preheader: "Activate your Operations Dashboard account.", heading: "Join Operations Dashboard", paragraphs: body, cta: { label: "Activate account", url: input.url }, footnote }),
  };
}

export function renderPasswordResetEmail(input: { url: string; expiresAt: string }): RenderedEmail {
  const subject = "Reset your Operations Dashboard password";
  const body = [
    "We received a request to reset the password for your account.",
    `Use the button below to choose a new password. The link can be used once and expires on ${fmtDate(input.expiresAt)}. Resetting signs you out of all devices.`,
  ];
  const footnote = "If you did not request this, you can ignore this email — your password will not change.";
  return {
    subject,
    text: `${subject}\n\n${body.join("\n\n")}\n\nReset your password:\n${input.url}\n\n${footnote}\n`,
    html: layout({ preheader: "Reset your password.", heading: "Reset your password", paragraphs: body, cta: { label: "Choose a new password", url: input.url }, footnote }),
  };
}

export function renderAdminNoticeEmail(input: { subject: string; message: string; url: string; cta: string }): RenderedEmail {
  return {
    subject: input.subject,
    text: `${input.subject}\n\n${input.message}\n\n${input.cta}: ${input.url}\n`,
    html: layout({ preheader: input.message.slice(0, 90), heading: input.subject, paragraphs: [input.message], cta: { label: input.cta, url: input.url }, footnote: "This is an automated message from Operations Dashboard." }),
  };
}
