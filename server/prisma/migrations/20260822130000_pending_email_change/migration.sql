-- Keep a single hashed, expiring confirmation token per user while the
-- existing account email remains active until the token is consumed.
CREATE TABLE "PendingEmailChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pendingEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingEmailChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingEmailChange_userId_key"
    ON "PendingEmailChange"("userId");
CREATE UNIQUE INDEX "PendingEmailChange_tokenHash_key"
    ON "PendingEmailChange"("tokenHash");
CREATE INDEX "PendingEmailChange_expiresAt_idx"
    ON "PendingEmailChange"("expiresAt");

ALTER TABLE "PendingEmailChange"
    ADD CONSTRAINT "PendingEmailChange_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
