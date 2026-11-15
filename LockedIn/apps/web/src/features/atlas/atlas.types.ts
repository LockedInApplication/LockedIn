export type MeaningCheckStatus = "PENDING" | "CONFIRMED" | "ALMOST" | "MISSING";

export type AtlasResponse = {
  id: string;
  definition: string;
  example: string;
  notMeaning: string;
  heardSummary: string | null;
  heardStatus: MeaningCheckStatus | null;
};

export type AtlasCompletedChapter = {
  id: string;
  word: { key: string; title: string; icon: string; color: "coral" | "sage" | "gold" };
  createdAt: string;
  sharedAt: string;
  sharedDefinition: string | null;
  ownResponse: AtlasResponse | null;
  partner: { name: string; response: AtlasResponse | null };
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
