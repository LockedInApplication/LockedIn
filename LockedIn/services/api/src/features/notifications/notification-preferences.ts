import { prisma } from "../../lib/prisma.js";
export async function activityEmailAllowed(email: string) {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { activityEmails: true },
  });
  return user?.activityEmails ?? true;
}
export async function inAppActivityAllowed(
  tx: {
    user: {
      findUnique: (args: {
        where: { id: string };
        select: { inAppActivity: true };
      }) => Promise<{ inAppActivity: boolean } | null>;
    };
  },
  userId: string,
) {
  return (
    (
      await tx.user.findUnique({
        where: { id: userId },
        select: { inAppActivity: true },
      })
    )?.inAppActivity ?? true
  );
}
