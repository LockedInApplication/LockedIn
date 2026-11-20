CREATE TYPE "MatchGender" AS ENUM ('WOMAN', 'MAN', 'NONBINARY', 'ANOTHER_GENDER');

CREATE TABLE "DiscoveryMatchPreferences" (
    "ownerId" TEXT PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "birthDate" DATE NOT NULL,
    "gender" "MatchGender" NOT NULL,
    "meetAllGenders" BOOLEAN NOT NULL,
    "meetGenders" "MatchGender"[] NOT NULL,
    "minAge" INTEGER NOT NULL,
    "maxAge" INTEGER,
    "revision" UUID NOT NULL,
    CONSTRAINT "DiscoveryMatchPreferences_adult_range" CHECK (
        ("minAge" = 18 AND "maxAge" IS NULL) OR ("minAge" >= 18 AND "maxAge" BETWEEN "minAge" AND 120 AND "maxAge" IS NOT NULL)
    ),
    CONSTRAINT "DiscoveryMatchPreferences_gender_choices" CHECK (
        cardinality("meetGenders") BETWEEN 1 AND 4 AND (NOT "meetAllGenders" OR cardinality("meetGenders") = 4)
    )
);
CREATE INDEX "DiscoveryMatchPreferences_gender_birthDate_idx" ON "DiscoveryMatchPreferences"("gender", "birthDate");

CREATE TABLE "DiscoveryMatchPreferenceGuard" (
    "ownerId" TEXT PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "correctionUntil" TIMESTAMP(3),
    "reenrollUntil" TIMESTAMP(3)
);
CREATE INDEX "DiscoveryMatchPreferenceGuard_correctionUntil_reenrollUntil_idx" ON "DiscoveryMatchPreferenceGuard"("correctionUntil", "reenrollUntil");
