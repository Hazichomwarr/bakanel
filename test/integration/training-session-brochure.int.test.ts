import {
  BrochureStorageProvider,
  Prisma,
  SessionStatus,
  TrainingSessionBrochureState,
  type PrismaClient,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TrainingSessionBrochureDomainError } from "@/lib/training-session-brochure.errors";
import { createTrainingSessionBrochureService } from "@/lib/training-session-brochure.service";
import { createPublicSessionReader } from "@/lib/public/session.read";

import { createPublishedTraining, resetPublicContent } from "./support/fixtures";
import { createTestPrismaClient } from "./support/test-prisma";

const now = new Date("2026-11-06T12:00:00.000Z");
const MAX_BROCHURE_SIZE_BYTES = 10 * 1024 * 1024;

let client: PrismaClient;
let service: ReturnType<typeof createTrainingSessionBrochureService>;

function calendarDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

async function createSession(status: SessionStatus = SessionStatus.DRAFT) {
  const training = await createPublishedTraining(client, `brochure-${crypto.randomUUID()}`);

  return client.trainingSession.create({
    data: {
      trainingId: training.id,
      status,
      startDate: calendarDate("2026-12-10"),
      endDate: calendarDate("2026-12-11"),
      registrationDeadline: calendarDate("2026-12-01"),
      deliveryMode: "IN_PERSON",
      country: "BF",
      city: "it-Ouagadougou",
      venue: "it-venue",
      pricingMode: "ON_REQUEST",
      price: null,
      currency: null,
      capacity: 25,
    },
  });
}

function brochureInput(suffix: string) {
  return {
    storageProvider: BrochureStorageProvider.VERCEL_BLOB,
    storageKey: `test/session-brochures/${suffix}.pdf`,
    originalFilename: `Brochure ${suffix}.pdf`,
    mimeType: "application/pdf",
    byteSize: 1024,
    sha256: createHash("sha256").update(suffix).digest("hex"),
  };
}

function expectDomainCode(
  promise: Promise<unknown>,
  code: TrainingSessionBrochureDomainError["code"],
) {
  return expect(promise).rejects.toMatchObject({ code });
}

beforeAll(() => {
  client = createTestPrismaClient();
  service = createTrainingSessionBrochureService(client);
});

beforeEach(async () => {
  await resetPublicContent(client);
});

afterAll(async () => {
  await resetPublicContent(client);
  await client.$disconnect();
});

describe("TrainingSession brochure service against PostgreSQL", () => {
  it("registers and activates the first validated brochure without exposing the pending record", async () => {
    const session = await createSession();
    const pending = await service.registerPendingBrochure(session.id, brochureInput("first"));

    expect(pending).toMatchObject({
      trainingSessionId: session.id,
      state: TrainingSessionBrochureState.PENDING,
      activatedAt: null,
    });
    await expect(service.getActiveBrochure(session.id)).resolves.toBeNull();

    const active = await service.activateValidatedPendingBrochure(session.id, {
      pendingBrochureId: pending.id,
      expectedActiveBrochureId: null,
    });

    expect(active).toMatchObject({
      id: pending.id,
      state: TrainingSessionBrochureState.ACTIVE,
    });
    expect(active.activatedAt).toBeInstanceOf(Date);
    await expect(service.getActiveBrochure(session.id)).resolves.toMatchObject({ id: pending.id });
  });

  it("replaces an active brochure transactionally while preserving the superseded version", async () => {
    const session = await createSession();
    const first = await service.registerPendingBrochure(session.id, brochureInput("replace-first"));
    const active = await service.activateValidatedPendingBrochure(session.id, {
      pendingBrochureId: first.id,
      expectedActiveBrochureId: null,
    });
    const replacement = await service.registerPendingBrochure(
      session.id,
      brochureInput("replace-second"),
    );

    await service.activateValidatedPendingBrochure(session.id, {
      pendingBrochureId: replacement.id,
      expectedActiveBrochureId: active.id,
    });

    const history = await service.listBrochureHistory(session.id);

    expect(history.map(({ id, state }) => [id, state]).sort()).toEqual(
      [
        [first.id, TrainingSessionBrochureState.SUPERSEDED],
        [replacement.id, TrainingSessionBrochureState.ACTIVE],
      ].sort(),
    );
    expect(history.find((brochure) => brochure.id === first.id)?.replacedAt).toBeInstanceOf(Date);
    await expect(service.getActiveBrochure(session.id)).resolves.toMatchObject({
      id: replacement.id,
    });
  });

  it("removes an active brochure without deleting its historical metadata", async () => {
    const session = await createSession();
    const pending = await service.registerPendingBrochure(session.id, brochureInput("remove"));
    const active = await service.activateValidatedPendingBrochure(session.id, {
      pendingBrochureId: pending.id,
      expectedActiveBrochureId: null,
    });

    await service.removeActiveBrochure(session.id, active.id);

    await expect(service.getActiveBrochure(session.id)).resolves.toBeNull();
    await expect(service.listBrochureHistory(session.id)).resolves.toEqual([
      expect.objectContaining({
        id: active.id,
        state: TrainingSessionBrochureState.REMOVED,
        removedAt: expect.any(Date),
        storageDeletedAt: null,
      }),
    ]);
  });

  it("rejects concurrent replacement attempts whose active-version token becomes stale", async () => {
    const session = await createSession();
    const originalPending = await service.registerPendingBrochure(
      session.id,
      brochureInput("concurrent-original"),
    );
    const original = await service.activateValidatedPendingBrochure(session.id, {
      pendingBrochureId: originalPending.id,
      expectedActiveBrochureId: null,
    });
    const [firstPending, secondPending] = await Promise.all([
      service.registerPendingBrochure(session.id, brochureInput("concurrent-first")),
      service.registerPendingBrochure(session.id, brochureInput("concurrent-second")),
    ]);

    const results = await Promise.allSettled([
      service.activateValidatedPendingBrochure(session.id, {
        pendingBrochureId: firstPending.id,
        expectedActiveBrochureId: original.id,
      }),
      service.activateValidatedPendingBrochure(session.id, {
        pendingBrochureId: secondPending.id,
        expectedActiveBrochureId: original.id,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]?.reason).toMatchObject({
      code: "STALE_BROCHURE_STATE",
    });
    await expect(
      client.trainingSessionBrochure.count({
        where: { trainingSessionId: session.id, state: TrainingSessionBrochureState.ACTIVE },
      }),
    ).resolves.toBe(1);
  });

  it("keeps the existing active brochure intact when a stale activation fails", async () => {
    const session = await createSession();
    const firstPending = await service.registerPendingBrochure(
      session.id,
      brochureInput("failed-first"),
    );
    const firstActive = await service.activateValidatedPendingBrochure(session.id, {
      pendingBrochureId: firstPending.id,
      expectedActiveBrochureId: null,
    });
    const replacement = await service.registerPendingBrochure(
      session.id,
      brochureInput("failed-replacement"),
    );

    await expectDomainCode(
      service.activateValidatedPendingBrochure(session.id, {
        pendingBrochureId: replacement.id,
        expectedActiveBrochureId: "another-active-brochure",
      }),
      "STALE_BROCHURE_STATE",
    );

    await expect(service.getActiveBrochure(session.id)).resolves.toMatchObject({
      id: firstActive.id,
    });
    await expect(
      client.trainingSessionBrochure.findUnique({ where: { id: replacement.id } }),
    ).resolves.toMatchObject({
      state: TrainingSessionBrochureState.PENDING,
      activatedAt: null,
    });
  });

  it.each([SessionStatus.COMPLETED, SessionStatus.CANCELLED])(
    "rejects brochure mutations for %s historical sessions",
    async (status) => {
      const session = await createSession(status);

      await expectDomainCode(
        service.registerPendingBrochure(session.id, brochureInput(`terminal-${status}`)),
        "SESSION_IMMUTABLE",
      );
    },
  );

  it("rolls back a replacement when PostgreSQL rejects pending-version activation", async () => {
    const session = await createSession();
    const firstPending = await service.registerPendingBrochure(
      session.id,
      brochureInput("rollback-first"),
    );
    const firstActive = await service.activateValidatedPendingBrochure(session.id, {
      pendingBrochureId: firstPending.id,
      expectedActiveBrochureId: null,
    });
    const replacement = await service.registerPendingBrochure(
      session.id,
      brochureInput("rollback-replacement"),
    );
    const failureFunction = "fail_training_session_brochure_activation";

    await client.$executeRawUnsafe(
      [
        "CREATE FUNCTION " + failureFunction + "()",
        "RETURNS trigger",
        "LANGUAGE plpgsql",
        "AS $$",
        "BEGIN",
        "  IF OLD.\"state\" = 'PENDING' AND NEW.\"state\" = 'ACTIVE' THEN",
        "    RAISE EXCEPTION 'forced brochure activation failure';",
        "  END IF;",
        "  RETURN NEW;",
        "END;",
        "$$;",
        "",
        "CREATE TRIGGER " + failureFunction,
        'BEFORE UPDATE ON "TrainingSessionBrochure"',
        "FOR EACH ROW",
        "EXECUTE FUNCTION " + failureFunction + "();",
      ].join("\n"),
    );

    try {
      await expect(
        service.activateValidatedPendingBrochure(session.id, {
          pendingBrochureId: replacement.id,
          expectedActiveBrochureId: firstActive.id,
        }),
      ).rejects.toThrow();
    } finally {
      await client.$executeRawUnsafe(
        [
          "DROP TRIGGER IF EXISTS " + failureFunction,
          'ON "TrainingSessionBrochure";',
          "DROP FUNCTION IF EXISTS " + failureFunction + "();",
        ].join("\n"),
      );
    }

    await expect(service.getActiveBrochure(session.id)).resolves.toMatchObject({
      id: firstActive.id,
    });
    await expect(
      client.trainingSessionBrochure.findUnique({ where: { id: firstActive.id } }),
    ).resolves.toMatchObject({
      state: TrainingSessionBrochureState.ACTIVE,
      replacedAt: null,
    });
    await expect(
      client.trainingSessionBrochure.findUnique({ where: { id: replacement.id } }),
    ).resolves.toMatchObject({
      state: TrainingSessionBrochureState.PENDING,
      activatedAt: null,
    });
  });

  it("enforces the one-active-brochure invariant in PostgreSQL and restricts session deletion", async () => {
    const session = await createSession();
    const first = await service.registerPendingBrochure(
      session.id,
      brochureInput("database-unique-first"),
    );
    await service.activateValidatedPendingBrochure(session.id, {
      pendingBrochureId: first.id,
      expectedActiveBrochureId: null,
    });

    await expect(
      client.trainingSessionBrochure.create({
        data: {
          trainingSessionId: session.id,
          ...brochureInput("database-unique-second"),
          state: TrainingSessionBrochureState.ACTIVE,
          activatedAt: new Date(),
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    await expect(
      client.trainingSession.delete({ where: { id: session.id } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("does not project pending or historical brochure metadata through the public session reader", async () => {
    const session = await createSession(SessionStatus.OPEN);
    const pending = await service.registerPendingBrochure(
      session.id,
      brochureInput("public-pending"),
    );
    const active = await service.activateValidatedPendingBrochure(session.id, {
      pendingBrochureId: pending.id,
      expectedActiveBrochureId: null,
    });
    await service.removeActiveBrochure(session.id, active.id);

    const reader = createPublicSessionReader(client, () => now);
    const sessions = await reader.listPublicUpcomingSessions("fr");

    expect(sessions).toHaveLength(1);
    expect(Object.keys(sessions[0] ?? {})).not.toContain("brochure");
    expect(JSON.stringify(sessions)).not.toContain(active.storageKey);
  });

  it("rejects metadata that cannot describe a 10 MB PDF brochure", async () => {
    const session = await createSession();

    await expectDomainCode(
      service.registerPendingBrochure(session.id, {
        ...brochureInput("invalid"),
        byteSize: MAX_BROCHURE_SIZE_BYTES + 1,
      }),
      "INVALID_BROCHURE_METADATA",
    );
  });
});
