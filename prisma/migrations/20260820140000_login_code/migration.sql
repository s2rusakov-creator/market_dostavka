-- CreateTable
CREATE TABLE "LoginCode" (
    "code" TEXT NOT NULL,
    "telegramId" BIGINT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "LoginCode_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "LoginCode_expiresAt_idx" ON "LoginCode"("expiresAt");
