import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getSmtpConfig } from "@/lib/env";
import { log } from "@/lib/logger";

export class EmailDeliveryError extends Error {
  constructor(
    public readonly code: "NOT_CONFIGURED" | "REJECTED" | "TRANSPORT",
    message: string,
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

let transporter: Transporter | undefined;
let transporterKey = "";

function getTransporter(): { transport: Transporter; from: string } {
  const cfg = getSmtpConfig();
  if (!cfg) throw new EmailDeliveryError("NOT_CONFIGURED", "SMTP is not configured on this deployment.");
  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`;
  if (!transporter || transporterKey !== key) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.password },
      requireTLS: !cfg.secure,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    transporterKey = key;
  }
  return { transport: transporter, from: cfg.from };
}

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends one message. Resolves ONLY after the SMTP server has accepted the recipient, so callers can
 * safely mark a notification as "sent" afterwards. Credentials are never logged.
 */
export async function sendMail(mail: OutgoingMail): Promise<{ messageId: string | null }> {
  const { transport, from } = getTransporter();
  try {
    const info = await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    const accepted = (info.accepted ?? []).map((a: unknown) =>
      String(typeof a === "string" ? a : (a && typeof a === "object" && "address" in a ? (a as { address: unknown }).address : a)).toLowerCase()
    );
    if (!accepted.includes(mail.to.toLowerCase())) {
      throw new EmailDeliveryError("REJECTED", "The mail server did not accept the recipient address.");
    }
    return { messageId: info.messageId ?? null };
  } catch (err) {
    if (err instanceof EmailDeliveryError) throw err;
    const message = err instanceof Error ? err.message : "SMTP error";
    log.warn("smtp_send_failed", { message });
    throw new EmailDeliveryError("TRANSPORT", message.slice(0, 300));
  }
}

export async function verifySmtp(): Promise<void> {
  const { transport } = getTransporter();
  await transport.verify();
}
