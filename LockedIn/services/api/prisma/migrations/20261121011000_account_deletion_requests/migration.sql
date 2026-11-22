CREATE TABLE "AccountDeletionRequest" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountDeletionRequest_userId_key" ON "AccountDeletionRequest"("userId");
CREATE INDEX "AccountDeletionRequest_requestedAt_idx" ON "AccountDeletionRequest"("requestedAt");

ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
