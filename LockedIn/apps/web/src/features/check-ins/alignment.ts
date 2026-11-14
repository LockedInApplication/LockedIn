import type { AlignmentItem } from "@/features/conversations/conversation.types";

export function alignmentBadge(item: AlignmentItem): string {
  switch (item.trend) {
    case "still-shared":
      return "Still shared";
    case "new-shared":
      return "New shared ground";
    case "changed":
      return "Something changed";
    case "worth-discussing":
      return "Worth discussing now";
    default:
      return item.aligned ? "Shared this time" : "Worth discussing now";
  }
}
