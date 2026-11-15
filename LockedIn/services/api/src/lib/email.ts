import { buildVerificationEmailTemplate } from "./email/templates/verificationEmail.js";
import { buildPasswordResetEmailTemplate } from "./email/templates/passwordResetEmail.js";
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

export async function sendPasswordResetEmail({ user, url }: SendEmailParams): Promise<void> {
  if (!user.email) {
    throw new Error("Cannot send password reset email: user.email is missing");
  }

  const { subject, text, html } = buildPasswordResetEmailTemplate({
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

type JourneyNotificationParams = {
  to: string;
  name?: string | null;
  subject: string;
  heading: string;
  message: string;
  actionLabel: string;
  url: string;
};

export async function sendJourneyNotificationEmail({
  to,
  name,
  subject,
  heading,
  message,
  actionLabel,
  url,
}: JourneyNotificationParams): Promise<void> {
  const greetingName = name?.trim() || "there";
  const text = [`Hi ${greetingName},`, "", heading, message, "", url, "", "LockedIn keeps answers private until both people choose to reveal them."].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #132238; max-width: 560px; margin: 0 auto;">
      <p style="color:#087f73;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">LockedIn</p>
      <p>Hi ${greetingName},</p>
      <h1 style="font-size:26px;line-height:1.2;">${heading}</h1>
      <p>${message}</p>
      <p><a href="${url}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#132238;color:white;text-decoration:none;font-weight:700;">${actionLabel}</a></p>
      <p style="color:#6b7789;font-size:13px;">LockedIn keeps answers private until both people choose to reveal them.</p>
    </div>
  `;

  await resendEmail({ to, subject, text, html });
}
