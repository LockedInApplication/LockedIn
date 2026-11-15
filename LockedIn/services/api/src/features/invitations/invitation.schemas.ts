import { z } from "zod";

export const inviteSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
});
