import type { AtlasWord } from "@/features/atlas/atlas.types";
import type { DirectInboxChat, DirectLockInState } from "@/features/messaging/messaging.types";
import type { CheckInSnapshot } from "@/features/check-ins/check-in.types";
import type {
  AlignmentItem,
  ConversationPack,
  IntentionQuestion,
} from "@/features/conversations/conversation.types";
import type { JourneyNextStep, JourneyProposal, SimplePlan } from "@/features/roadmap/roadmap.types";

export type JourneySession = {
  id: string;
  topic: string;
  packKey: string;
  createdAt: string;
  status: string;
  questions: IntentionQuestion[];
  ownResponse: {
    answers: Record<string, string>;
    shareKeys: string[];
    contextNotes: Record<string, string>;
    contextShareKeys: string[];
    revealConsented: boolean;
  } | null;
  partnerState: {
    name: string;
    submitted: boolean;
    revealConsented: boolean;
  };
  bothRevealed: boolean;
  alignment: AlignmentItem[];
  proposals: JourneyProposal[];
  proposalHistory: JourneyProposal[];
  nextSteps: JourneyNextStep[];
  nextStep: JourneyNextStep | null;
};

export type JourneyOverview = {
  messaging?: { enabled: boolean; conversationId: string | null };
  directChats?: DirectInboxChat[];
  hasInboxActivity?: boolean;
  canInviteToChat?: boolean;
  lockIn?: DirectLockInState;
  user: { id: string; email: string; name: string; avatarPreset?:string };
  pendingInvites: Array<{
    id: string;
    token: string;
    expiresAt: string;
    inviter: { name: string; email: string };
  }>;
  relationship: {
    id: string;
    isMutuallyLockedIn?: boolean;
    mutuallyLockedInAt?: string;
    partner: { name: string; email: string; avatarPreset?:string };
  } | null;
  session: JourneySession | null;
  simplePlans?: SimplePlan[] | null;
  checkInHistory: CheckInSnapshot[];
  conversationPacks: ConversationPack[];
  conversationSelection: {
    ownChoice: { submitted: boolean; packKey: string | null };
    partnerChoice: { submitted: boolean; packKey: string | null; name: string };
  } | null;
  atlas: { words: AtlasWord[] };
};
