export function buildExistingAccountEmailTemplate(appUrl: string) {
  const origin = new URL(appUrl).origin;
  const login = new URL("/login", origin).href;
  const reset = new URL("/forgot-password", origin).href;
  const subject = "You already have a LockedIn account";
  const heading = "You already have a space here.";
  const message = "This email is already linked to a LockedIn account. Log in to pick up where you left off.";
  const footer = "If you didn’t try to sign up, you can ignore this email. Nothing changed on your account.";

  const text = [heading, "", message, "", `Log in: ${login}`, `Reset your password: ${reset}`, "", footer].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#301e20;background:#faf4ee;max-width:520px;margin:0 auto;padding:24px;">
      <p style="font-weight:700;color:#812e3a;">LockedIn</p>
      <h1 style="font-family:Georgia,serif;font-size:26px;line-height:1.2;">${heading}</h1>
      <p>${message}</p>
      <p><a href="${login}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#812e3a;color:white;text-decoration:none;font-weight:700;">Log in</a></p>
      <p>Forgot your password? <a href="${reset}" style="color:#812e3a;">Reset it here.</a></p>
      <p style="font-size:14px;color:#685457;">${footer}</p>
    </div>
  `;
  return { subject, text, html };
}
