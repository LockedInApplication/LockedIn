import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";
import { sendEmail, sendPasswordResetEmail } from "./email.js";
import { env } from "../config/env.js";

const requireEmailVerification = env.REQUIRE_EMAIL_VERIFICATION === "true";
const publicAppOrigin = env.APP_URL.replace(/\/$/, "");

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

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
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ user, url });
    },
  },

  emailVerification: {
    sendOnSignUp: requireEmailVerification,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60, // 1 hour

    sendVerificationEmail: async ({ user, url }) => {
      if (process.env.NODE_ENV !== "production") {
        console.log("Verification URL:", url);
      }

      await sendEmail({ user, url });
    },
  },
});
