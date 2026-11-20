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
export type SimplePlan = {
  id: string;
  title: string;
  note: string | null;
  day: string | null;
  status: "PENDING" | "ACCEPTED" | "PASSED" | "WITHDRAWN" | "DONE" | "CANCELED";
  version: number;
  yours: boolean;
  proposerName: string;
  resolvedBy: string | null;
};
