import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";
import { sendEmail, sendExistingAccountEmail, sendPasswordResetEmail } from "./email.js";
import { env } from "../config/env.js";
import { accountDeletionInProgress } from "../features/profile/account-deletion.state.js";

const requireEmailVerification = env.REQUIRE_EMAIL_VERIFICATION === "true";
const publicAppOrigin = env.APP_URL.replace(/\/$/, "");

function queueSignupEmail(send: () => Promise<void>) {
  // Neither sign-up response should wait on the mail provider or expose its errors.
  void send().catch(() => console.error("Could not queue a LockedIn sign-up email."));
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  // Better Auth's info logs include the address on duplicate sign-ups.
  logger: { level: "warn" },
  databaseHooks: {
    session: { create: { before: async session => !await accountDeletionInProgress(session.userId) } },
  },

  trustedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    ...(publicAppOrigin ? [publicAppOrigin] : []),
  ],

  emailAndPassword: {
    enabled: true,
    requireEmailVerification,
    revokeSessionsOnPasswordReset: true,
    onExistingUserSignUp: async ({ user }) => {
      queueSignupEmail(async () => {
        if (await accountDeletionInProgress(user.id)) return;
        await sendExistingAccountEmail(user);
      });
    },
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ user, url });
    },
  },

  emailVerification: {
    sendOnSignUp: requireEmailVerification,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60, // 1 hour

    sendVerificationEmail: async ({ user, url }, request) => {
      if (request && /^\/api\/auth\/sign-up\/email\/?$/.test(new URL(request.url).pathname)) {
        queueSignupEmail(() => sendEmail({ user, url }));
        return;
      }
      await sendEmail({ user, url });
    },
  },
});
