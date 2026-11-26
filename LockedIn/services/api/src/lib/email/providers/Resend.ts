import { Resend } from "resend";
import { requireEnv } from "../../../config/env.js";

type ResendEmailParams = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string;
};

export default async function resendEmail({
  to,
  subject,
  text,
  html,
  idempotencyKey,
}: ResendEmailParams): Promise<void> {
  const resend = new Resend(requireEnv("RESEND_API_KEY"));
  const from = requireEnv("RESEND_FROM_EMAIL");

  const result = await resend.emails.send({
    from,
    to,
    subject,
    text,
    html,
  }, idempotencyKey ? { idempotencyKey } : undefined);

  if (result.error) {
    throw new Error(
      `Resend email send failed: ${result.error.name} - ${result.error.message}`,
    );
  }

  console.log("Email queued", { messageId: result.data?.id ?? null });
}
