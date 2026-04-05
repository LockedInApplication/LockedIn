import { buildVerificationEmailTemplate } from "./email/templates/verificationEmail.js";
import resendEmail from "./email/providers/Resend.js";

export type SendEmailParams = {
  user: {
    email?: string | null;
    name?: string | null;
  };
  url: string;
};

export async function sendEmail({ user, url }: SendEmailParams): Promise<void> {
  if (!user.email) {
    throw new Error("Cannot send email: user.email is missing");
  }

  const { subject, text, html } = buildVerificationEmailTemplate({
    name: user.name ?? null,
    url,
  });

  await resendEmail({
    to: user.email,
    subject,
    text,
    html,
  });
}
