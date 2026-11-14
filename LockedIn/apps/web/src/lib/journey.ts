export const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export type IntentionQuestion = {
  key: string;
  label: string;
  helper: string;
  options: Array<{ value: string; label: string }>;
};

export type AlignmentItem = {
  key: string;
  label: string;
  ownAnswer: string;
  partnerAnswer: string;
  aligned: boolean;
  ownContext?: string | null;
  partnerContext?: string | null;
  trend?:
    | "shared-this-time"
    | "still-shared"
    | "new-shared"
    | "changed"
    | "worth-discussing";
};

export type ConversationPack = {
  key: string;
  title: string;
  description: string;
  icon: string;
  accent: string;
  questionCount: number;
};

export type CheckInSnapshot = {
  id: string;
  topic: string;
  createdAt: string;
  revealedAt: string;
  alignment: AlignmentItem[];
};

export type MeaningCheckStatus = "PENDING" | "CONFIRMED" | "ALMOST" | "MISSING";

export type AtlasResponse = {
  id: string;
  definition: string;
  example: string;
  notMeaning: string;
  heardSummary: string | null;
  heardStatus: MeaningCheckStatus | null;
};

export type AtlasChapter = {
  id: string;
  status:
    | "COLLECTING"
    | "DISCOVERING"
    | "CHECKING"
    | "PROPOSING"
    | "CHOOSING"
    | "RESOLVING"
    | "PROPOSED"
    | "SHARED";
  createdAt: string;
  sharedDefinition: string | null;
  candidateVersion: number;
  ownFinalApproval: boolean;
  partnerFinalApproval: boolean;
  proposedByCurrentUser: boolean;
  proposedByName: string | null;
  proposals: Array<{
    id: string;
    definition: string;
    proposedByCurrentUser: boolean;
    proposedByName: string;
  }>;
  ownSelection: {
    mode: "PROPOSAL" | "BLEND" | "KEEP_BOTH";
    proposalId: string | null;
  } | null;
  partnerSelection: {
    mode: "PROPOSAL" | "BLEND" | "KEEP_BOTH";
    proposalId: string | null;
  } | null;
  ownResponse: AtlasResponse | null;
  partnerResponse: {
    submitted: boolean;
    name: string;
    id?: string;
    definition?: string;
    example?: string;
    notMeaning?: string;
    heardSummary?: string | null;
    heardStatus?: MeaningCheckStatus | null;
  };
};

export type AtlasWord = {
  key: string;
  title: string;
  icon: string;
  color: "coral" | "sage" | "gold";
  description: string;
  mysteryPrompt: string;
  versionCount: number;
  previousDefinitions?: Array<{
    id: string;
    definition: string | null;
    sharedAt: string;
  }>;
  chapter: AtlasChapter | null;
};

export type JourneyProposal = {
  id: string;
  title: string;
  details: string | null;
  targetDate: string | null;
  proposedByCurrentUser: boolean;
  proposedByName: string;
  status?: "REVISED" | "DECLINED";
};

export type JourneyNextStep = {
  id: string;
  title: string;
  details: string | null;
  targetDate: string | null;
  reflectionAvailable: boolean;
  reflectionOpensAt: string | null;
  status: "ACCEPTED" | "COMPLETED" | "PAUSED" | "REVISED";
  proposedByCurrentUser: boolean;
  proposedByName: string;
  ownReflection: { outcome: string; note: string | null } | null;
  partnerReflection: { submitted: boolean; outcome: string | null };
};

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
  user: { id: string; email: string; name: string };
  pendingInvites: Array<{
    id: string;
    token: string;
    expiresAt: string;
    inviter: { name: string; email: string };
  }>;
  relationship: {
    id: string;
    partner: { name: string; email: string };
  } | null;
  session: JourneySession | null;
  checkInHistory: CheckInSnapshot[];
  conversationPacks: ConversationPack[];
  conversationSelection: {
    ownChoice: { submitted: boolean; packKey: string | null };
    partnerChoice: { submitted: boolean; packKey: string | null; name: string };
  } | null;
  atlas: { words: AtlasWord[] };
};

export class JourneyApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function journeyRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  const data = (await response.json().catch(() => null)) as { error?: string } | T | null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : "Something went wrong.";
    throw new JourneyApiError(message, response.status);
  }

  return data as T;
}
