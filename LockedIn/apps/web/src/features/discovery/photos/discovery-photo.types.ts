export type PhotoCard = { id: string; src: string; width: number; height: number };
export type PhotoState = "PROCESSING" | "APPROVED" | "NEEDS_REVIEW" | "REJECTED" | "CHECK_FAILED";
export type OwnPhoto = { id: string; src?: string; state: PhotoState; reason: string; decisionRevision: number; canAppeal: boolean };
export type OwnPhotos = { items: OwnPhoto[]; draftIds: string[]; publishedIds: string[] };
type ScreeningLabel = { name: string; parent: string; confidence: number };
export type PhotoReview = { id: string; state: PhotoState; reason: string; decisionRevision: number; appealed: boolean; reported: boolean; removed: boolean; canApprove: boolean; canPreview: boolean; failedJobs: string[]; audits: { action: string; reason: string; createdAt: string }[]; screening?: { policyVersion: string | null; providerStatus: "approved" | "rejected" | null; labels: ScreeningLabel[]; triggers: { rule: string; label: ScreeningLabel | null }[] } | null };
