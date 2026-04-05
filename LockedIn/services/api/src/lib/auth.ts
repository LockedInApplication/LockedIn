import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";
import { sendEmail } from "./email.js";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      // Helpful local fallback when SMTP/provider delivery is unavailable.
      if (process.env.NODE_ENV !== "production") {
        console.log("Verification URL:", url);
      }

      try {
        await sendEmail({
          user,
          url,
        });
      } catch (error) {
        console.error("Failed to send verification email", error);
      }
    },
  },
});
