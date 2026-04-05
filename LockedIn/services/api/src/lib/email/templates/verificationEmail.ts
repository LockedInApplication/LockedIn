type VerificationTemplateParams = {
  name?: string | null;
  url: string;
};

export function buildVerificationEmailTemplate({
  name,
  url,
}: VerificationTemplateParams) {
  const greetingName = name?.trim() ? name : "there";

  const subject = "Verify your LockedIn email";
  const text = [
    `Hi ${greetingName},`,
    "",
    "Welcome to LockedIn.",
    "Please verify your email by visiting the link below:",
    url,
    "",
    "If you did not create this account, you can ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <p>Hi ${greetingName},</p>
      <p>Welcome to LockedIn.</p>
      <p>Please verify your email by clicking the button below:</p>
      <p>
        <a href="${url}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #111; color: #fff; text-decoration: none;">
          Verify Email
        </a>
      </p>
      <p>If the button doesn't work, use this link:</p>
      <p><a href="${url}">${url}</a></p>
      <p>If you did not create this account, you can ignore this email.</p>
    </div>
  `;

  return {
    subject,
    text,
    html,
  };
}
