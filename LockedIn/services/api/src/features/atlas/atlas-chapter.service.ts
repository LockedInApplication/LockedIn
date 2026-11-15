import { prisma } from "../../lib/prisma.js";
import { atlasWords } from "./atlas.catalog.js";

type SavedResponse = {
  id: string;
  definition: string;
  example: string;
  notMeaning: string;
  heardSummary: string | null;
  heardStatus: string | null;
};

function responseView(response: SavedResponse | undefined) {
  if (!response) return null;
  return {
    id: response.id,
    definition: response.definition,
    example: response.example,
    notMeaning: response.notMeaning,
    heardSummary: response.heardSummary,
    heardStatus: response.heardStatus,
  };
}

export async function getCompletedAtlasChapter(chapterId: string, userId: string) {
  const chapter = await prisma.meaningChapter.findFirst({
    where: {
      id: chapterId,
      status: "SHARED",
      relationship: { members: { some: { userId } } },
    },
    include: {
      responses: {
        select: {
          id: true, userId: true, definition: true, example: true,
          notMeaning: true, heardSummary: true, heardStatus: true,
        },
      },
      relationship: {
        include: {
          members: { include: { user: { select: { name: true, displayName: true } } } },
        },
      },
    },
  });
  if (!chapter) return null;

  const word = atlasWords.find((item) => item.key === chapter.wordKey);
  if (!word) return null;

  const partner = chapter.relationship.members.find((member) => member.userId !== userId);
  const ownResponse = chapter.responses.find((response) => response.userId === userId);
  const partnerResponse = partner
    ? chapter.responses.find((response) => response.userId === partner.userId)
    : undefined;

  return {
    id: chapter.id,
    word: { key: word.key, title: word.title, icon: word.icon, color: word.color },
    createdAt: chapter.createdAt,
    sharedAt: chapter.updatedAt,
    sharedDefinition: chapter.sharedDefinition,
    ownResponse: responseView(ownResponse),
    partner: {
      name: partner?.user.displayName ?? partner?.user.name ?? "Your partner",
      response: responseView(partnerResponse),
    },
  };
}
