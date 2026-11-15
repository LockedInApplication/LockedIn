import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  meaningChapter: { findUnique: vi.fn(), update: vi.fn() },
  meaningSelection: { upsert: vi.fn(), findMany: vi.fn() },
  meaningDefinitionProposal: { create: vi.fn(), update: vi.fn(), count: vi.fn() },
  meaningFinalApproval: { upsert: vi.fn(), count: vi.fn() },
}));
vi.mock("../../lib/prisma.js", () => ({
  prisma: { $transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx) },
}));

import {
  saveFinalApproval, saveMeaningSelection, savePersonalDefinitionProposal, saveResolvedDefinition,
} from "./atlas.service.js";

const date = new Date("2026-11-14T12:00:00Z");
const current = {
  id: "chapter-1", relationshipId: "relationship-1", wordKey: "support", createdById: "own",
  status: "CHOOSING", sharedDefinition: null, sharedDefinitionProposedById: null,
  candidateVersion: 2, createdAt: date, updatedAt: date,
  proposals: [
    { id: "proposal-1", chapterId: "chapter-1", userId: "own", kind: "PERSONAL", definition: "Steady care in action", createdAt: date, updatedAt: date },
    { id: "proposal-2", chapterId: "chapter-1", userId: "partner", kind: "PERSONAL", definition: "Intentional presence", createdAt: date, updatedAt: date },
  ],
  selections: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  tx.meaningChapter.findUnique.mockResolvedValue(current);
  tx.meaningSelection.findMany.mockResolvedValue([
    { id: "selection-1", chapterId: current.id, userId: "own", mode: "PROPOSAL", proposalId: "proposal-2", createdAt: date, updatedAt: date },
    { id: "selection-2", chapterId: current.id, userId: "partner", mode: "PROPOSAL", proposalId: "proposal-2", createdAt: date, updatedAt: date },
  ]);
});

describe("Atlas transactional transitions", () => {
  it.each([
    ["proposal", () => savePersonalDefinitionProposal({ chapterId: current.id, userId: "own", definition: "Steady care in action" })],
    ["selection", () => saveMeaningSelection({ chapterId: current.id, userId: "own", mode: "BLEND", proposalId: null })],
    ["revision", () => saveResolvedDefinition({ chapterId: current.id, userId: "own", definition: "A revised definition", kind: "REVISION", expectedVersion: 2 })],
    ["approval", () => saveFinalApproval({ chapterId: current.id, userId: "own", candidateVersion: 2 })],
  ] as const)("locks before reading chapter state for a %s transaction", async (_name, action) => {
    await action();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.calls[0][0].join("?")).toBe('SELECT "id" FROM "MeaningChapter" WHERE "id" = ? FOR UPDATE');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.meaningChapter.findUnique.mock.invocationCallOrder[0]);
  });

  it("preserves selection of an existing legacy proposal even when its stored definition is empty", async () => {
    tx.meaningChapter.findUnique.mockResolvedValue({
      ...current,
      proposals: current.proposals.map((proposal) => ({ ...proposal, definition: "" })),
    });
    expect(await saveMeaningSelection({ chapterId: current.id, userId: "own", mode: "PROPOSAL", proposalId: "proposal-2" }))
      .toEqual({ conflict: false, resolved: true });
    expect(tx.meaningChapter.update).toHaveBeenCalledWith({
      where: { id: current.id },
      data: { status: "PROPOSED", sharedDefinition: "", sharedDefinitionProposedById: null, candidateVersion: { increment: 1 } },
    });
  });

  it("locks the chapter before reading and writing a selection, then versions the exact chosen definition", async () => {
    const result = await saveMeaningSelection({ chapterId: current.id, userId: "own", mode: "PROPOSAL", proposalId: "proposal-2" });
    expect(result).toEqual({ conflict: false, resolved: true });
    const [sql, chapterId] = tx.$queryRaw.mock.calls[0];
    expect(sql.join("?")).toBe('SELECT "id" FROM "MeaningChapter" WHERE "id" = ? FOR UPDATE');
    expect(chapterId).toBe(current.id);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.meaningChapter.findUnique.mock.invocationCallOrder[0]);
    expect(tx.meaningChapter.findUnique.mock.invocationCallOrder[0]).toBeLessThan(tx.meaningSelection.upsert.mock.invocationCallOrder[0]);
    expect(tx.meaningChapter.update).toHaveBeenCalledWith({
      where: { id: current.id },
      data: { status: "PROPOSED", sharedDefinition: "Intentional presence", sharedDefinitionProposedById: null, candidateVersion: { increment: 1 } },
    });
    expect(tx.meaningDefinitionProposal.update).not.toHaveBeenCalled();
  });

  it("rejects a selection after another transaction has already moved the chapter forward", async () => {
    tx.meaningChapter.findUnique.mockResolvedValue({ ...current, status: "RESOLVING" });
    expect(await saveMeaningSelection({ chapterId: current.id, userId: "own", mode: "BLEND", proposalId: null }))
      .toEqual({ conflict: true, resolved: false });
    expect(tx.meaningSelection.upsert).not.toHaveBeenCalled();
  });

  it("preserves the first private selection without advancing before the second selection arrives", async () => {
    tx.meaningSelection.findMany.mockResolvedValue([{ userId: "own", mode: "BLEND", proposalId: null }]);
    expect(await saveMeaningSelection({ chapterId: current.id, userId: "own", mode: "BLEND", proposalId: null }))
      .toEqual({ conflict: false, resolved: false });
    expect(tx.meaningChapter.update).not.toHaveBeenCalled();
  });

  it("rejects stale revisions before saving a replacement or incrementing the version", async () => {
    tx.meaningChapter.findUnique.mockResolvedValue({ ...current, status: "PROPOSED" });
    expect(await saveResolvedDefinition({ chapterId: current.id, userId: "own", definition: "A revised definition", kind: "REVISION", expectedVersion: 1 }))
      .toEqual({ conflict: true });
    expect(tx.meaningDefinitionProposal.create).not.toHaveBeenCalled();
    expect(tx.meaningChapter.update).not.toHaveBeenCalled();
  });

  it("rejects approval of an older candidate version", async () => {
    tx.meaningChapter.findUnique.mockResolvedValue({ ...current, status: "PROPOSED", sharedDefinition: "A shared definition" });
    expect(await saveFinalApproval({ chapterId: current.id, userId: "own", candidateVersion: 1 }))
      .toEqual({ conflict: true, complete: false });
    expect(tx.meaningFinalApproval.upsert).not.toHaveBeenCalled();
  });

  it.each([1, 2])("requires two approvals on the current version (approval count %i)", async (count) => {
    tx.meaningChapter.findUnique.mockResolvedValue({ ...current, status: "PROPOSED", sharedDefinition: "A shared definition" });
    tx.meaningFinalApproval.count.mockResolvedValue(count);
    expect(await saveFinalApproval({ chapterId: current.id, userId: "own", candidateVersion: 2 }))
      .toEqual({ conflict: false, complete: count === 2 });
    expect(tx.meaningFinalApproval.count).toHaveBeenCalledWith({ where: { chapterId: current.id, candidateVersion: 2 } });
    expect(tx.meaningChapter.update).toHaveBeenCalledTimes(count === 2 ? 1 : 0);
  });

  it("preserves personal proposals once selection has begun", async () => {
    tx.meaningChapter.findUnique.mockResolvedValue({ ...current, selections: [{ userId: "partner", mode: "PROPOSAL", proposalId: "proposal-1" }] });
    expect(await savePersonalDefinitionProposal({ chapterId: current.id, userId: "own", definition: "Replacement wording" }))
      .toEqual({ conflict: true, count: 0 });
    expect(tx.meaningDefinitionProposal.update).not.toHaveBeenCalled();
    expect(tx.meaningDefinitionProposal.create).not.toHaveBeenCalled();
  });
});
