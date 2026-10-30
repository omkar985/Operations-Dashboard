try {
  process.loadEnvFile?.(".env.local");
  process.loadEnvFile?.();
} catch {}

import { getSmtpConfig } from "../src/lib/env";
import { verifySmtp, sendMail } from "../src/server/integrations/smtp";

async function main() {
  const smtpConfig = getSmtpConfig();
  if (!smtpConfig) {
    console.error("Missing SMTP credentials in environment.");
    console.error("Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL");
    process.exit(1);
  }

  console.log(`Connecting to SMTP server at ${smtpConfig.host}:${smtpConfig.port} as ${smtpConfig.user}...`);
  try {
    await verifySmtp();
    console.log("✓ SMTP connection established successfully!");
  } catch (err) {
    console.error("✗ SMTP verification failed:", err);
    process.exit(1);
  }

  const testRecipient = process.argv[2];
  if (testRecipient) {
    console.log(`Dispatching test verification email to ${testRecipient}...`);
    try {
      const result = await sendMail({
        to: testRecipient,
        subject: "Operations Dashboard Headphone Zone — SMTP Verification Test",
        html: `
          <div style="font-family: sans-serif; padding: 24px; background: #f8fafc; color: #1e293b;">
            <div style="max-width: 500px; margin: 0 auto; background: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <h2 style="color: #1588C9; margin-top: 0;">Operations Dashboard Headphone Zone</h2>
              <p>This is a verification email to confirm that your SMTP email dispatch is operating normally.</p>
              <p style="font-size: 12px; color: #64748b;">Timestamp: ${new Date().toISOString()}</p>
            </div>
          </div>
        `,
        text: `Operations Dashboard Headphone Zone — SMTP verification confirmed at ${new Date().toISOString()}`,
      });

      console.log(`✓ Test email delivered to ${testRecipient} (Message ID: ${result.messageId}).`);
    } catch (err) {
      console.error("✗ Failed to dispatch test email:", err);
      process.exit(1);
    }
  } else {
    console.log("Tip: Run `npx tsx scripts/verify-smtp.ts your-email@company.com` to send an actual test message.");
  }
}

main().catch((err) => {
  console.error("SMTP verification error:", err);
  process.exit(1);
});
