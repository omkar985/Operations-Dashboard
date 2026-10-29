try {
  process.loadEnvFile?.(".env.local");
  process.loadEnvFile?.();
} catch {}

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { emailSchema, passwordSchema } from "../src/lib/validation/schemas";

// Default initial credentials if none are provided
const DEFAULT_ADMIN_EMAIL = "omkar@headphonezone.in";
const DEFAULT_ADMIN_PASSWORD = "Omkar@2809";
const DEFAULT_ADMIN_NAME = "Operations Administrator";

async function main() {
  const args = process.argv.slice(2);
  const emailInput = args[0] || process.env.ADMIN_BOOTSTRAP_EMAIL || DEFAULT_ADMIN_EMAIL;
  const passwordInput = args[1] || process.env.ADMIN_BOOTSTRAP_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const nameInput = args[2] || process.env.ADMIN_BOOTSTRAP_NAME || DEFAULT_ADMIN_NAME;

  const emailRes = emailSchema.safeParse(emailInput);
  if (!emailRes.success) {
    console.error("Validation error for email:", emailRes.error.flatten().formErrors);
    process.exit(1);
  }

  const passwordRes = passwordSchema.safeParse(passwordInput);
  if (!passwordRes.success) {
    console.error("Validation error for password:", passwordRes.error.flatten().formErrors);
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("------------------------------------------------------------------");
    console.error("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    console.error("Please add your Supabase credentials into .env.local first.");
    console.error("------------------------------------------------------------------");
    process.exit(1);
  }

  if (
    supabaseUrl.includes("your-project-ref") ||
    serviceRoleKey.includes("your-supabase-service-role")
  ) {
    console.error("------------------------------------------------------------------");
    console.error("Error: Supabase credentials are still placeholder values!");
    console.error(`Current SUPABASE_URL: ${supabaseUrl}`);
    console.error("\nPlease update .env.local with your real Supabase project details:");
    console.error("  SUPABASE_URL=https://<your-project-ref>.supabase.co");
    console.error("  SUPABASE_SERVICE_ROLE_KEY=<your-service-role-secret>");
    console.error("------------------------------------------------------------------");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const email = emailRes.data;
  const password = passwordRes.data;
  const passwordHash = await bcrypt.hash(password, 12);

  console.log(`Checking existing account for ${email}...`);
  const { data: existing, error: selectErr } = await supabase
    .from("users")
    .select("id, email, role")
    .eq("email", email)
    .maybeSingle();

  if (selectErr) {
    console.error("Failed to query database:", selectErr.message);
    console.error("Please verify that your Supabase instance is online and migrations have been run.");
    process.exit(1);
  }

  if (existing) {
    console.log(`User already exists (ID: ${existing.id}). Updating to ADMIN with password...`);
    const { error: updateErr } = await supabase
      .from("users")
      .update({
        role: "ADMIN",
        password_hash: passwordHash,
        is_active: true,
        password_changed_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateErr) {
      console.error("Failed to update admin user:", updateErr.message);
      process.exit(1);
    }
  } else {
    console.log(`Creating initial root ADMIN user for ${email}...`);
    const { data: created, error: insertErr } = await supabase
      .from("users")
      .insert({
        email,
        name: nameInput,
        password_hash: passwordHash,
        role: "ADMIN",
        is_active: true,
        session_version: 1,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Failed to insert admin user:", insertErr.message);
      process.exit(1);
    }
  }

  console.log("\n========================================================");
  console.log("✓ ROOT ADMIN ACCOUNT READY");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log("  URL:      http://localhost:3000/login");
  console.log("========================================================\n");
}

main().catch((err) => {
  console.error("Unexpected error bootstrapping admin:", err);
  process.exit(1);
});
