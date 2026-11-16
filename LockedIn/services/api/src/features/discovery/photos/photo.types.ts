import type { DiscoveryResult } from "../discovery.types.js";

export type PhotoState = "PROCESSING" | "APPROVED" | "NEEDS_REVIEW" | "REJECTED" | "CHECK_FAILED";
export type PhotoAsset = { assetId: string; publicId: string; version: number; format: "jpg" };
export type PhotoCard = { id: string; src: string; width: number; height: number };
export type OwnPhoto = { id: string; state: PhotoState; reason: string; decisionRevision: number; canAppeal: boolean; src?: string; width: number | null; height: number | null };
export type PhotoScreeningLabel = { name: string; confidence: number; parent: string };
export type PhotoProviderStatus = "approved" | "rejected";
export type PhotoDecision = { state: PhotoState; reason: string; labels: PhotoScreeningLabel[]; providerStatus?: PhotoProviderStatus; policyVersion: string; complete: boolean };
export type PhotoResult<T> = DiscoveryResult<T>;
export interface PhotoProvider {
  upload(input: { photoId: string; jpeg: Buffer; requestId: string }): Promise<{ asset: PhotoAsset; screening: unknown }>;
  inspect(asset: Pick<PhotoAsset, "publicId">): Promise<{ asset: PhotoAsset; screening: unknown } | null>;
  read(asset: PhotoAsset): Promise<Buffer>;
  destroy(asset: Pick<PhotoAsset, "publicId">): Promise<"destroyed" | "missing" | void>;
  override(asset: PhotoAsset, approved: boolean, requestId: string): Promise<void>;
}
