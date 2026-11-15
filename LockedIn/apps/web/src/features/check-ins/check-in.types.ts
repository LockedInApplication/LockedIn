import type { AlignmentItem } from "@/features/conversations/conversation.types";

export type CheckInSnapshot = {
  id: string;
  topic: string;
  createdAt: string;
  revealedAt: string;
  alignment: AlignmentItem[];
};
