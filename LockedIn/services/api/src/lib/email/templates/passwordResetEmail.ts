type PasswordResetTemplateParams = {
  name?: string | null;
  url: string;
};

export function buildPasswordResetEmailTemplate({
  name,
  url,
}: PasswordResetTemplateParams) {
  const greetingName = name?.trim() ? name : "there";

  const subject = "Reset your LockedIn password";
  const text = [
    `Hi ${greetingName},`,
    "",
    "We received a request to reset your LockedIn password.",
    "Use the link below to choose a new password:",
    url,
    "",
    "If you did not request this, you can safely ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <p>Hi ${greetingName},</p>
      <p>We received a request to reset your LockedIn password.</p>
      <p>
        <a href="${url}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #111; color: #fff; text-decoration: none;">
          Reset Password
        </a>
      </p>
      <p>If the button does not work, use this link:</p>
      <p><a href="${url}">${url}</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  return { subject, text, html };
}
