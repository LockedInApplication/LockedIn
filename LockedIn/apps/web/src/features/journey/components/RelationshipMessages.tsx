import Link from "next/link";
import type { JourneyOverview } from "../journey.types";
export default function RelationshipMessages({ messaging }: { messaging: JourneyOverview["messaging"] }) {
  return messaging?.enabled && messaging.conversationId ? <nav aria-label="Shared messages"><Link href={`/messages/${encodeURIComponent(messaging.conversationId)}`}>Messages →</Link></nav> : null;
}
