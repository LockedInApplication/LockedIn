import { z } from "zod";

export const conversationChoiceSchema = z.object({
  packKey: z.string().nullable(),
});
