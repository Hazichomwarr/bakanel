"use client";

import { uploadPresigned } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { MAX_BROCHURE_SIZE_BYTES } from "@/lib/session-brochure.constants";

type ActiveBrochure = { id: string; filename: string; byteSize: number; uploadedAt: string | null };

type Props = {
  sessionId: string;
  mutable: boolean;
  active: ActiveBrochure | null;
  retained: Omit<ActiveBrochure, "id"> | null;
};

function describeError(error: unknown) {
  if (error instanceof Error && error.name === "BrochureRequestError") return error.message;
  return "La brochure n’a pas pu être traitée. Réessayez ou actualisez la page.";
}

async function responseBody(response: Response) {
  const body = (await response.json()) as { error?: string; active?: ActiveBrochure | null };
  if (!response.ok) {
    const error = new Error(body.error ?? "La brochure n’a pas pu être traitée.");
    error.name = "BrochureRequestError";
    throw error;
  }
  return body;
}

export function BrochurePanel({ sessionId, mutable, active, retained }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const base = `/admin/api/session-brochures/${sessionId}`;

  async function handleFile(file: File) {
    setMessage("");
    setError("");
    if (
      file.size < 1 ||
      file.size > MAX_BROCHURE_SIZE_BYTES ||
      !/\.pdf$/i.test(file.name) ||
      file.type !== "application/pdf"
    ) {
      setError("Sélectionnez un PDF de 10 Mo maximum.");
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const prepared = (await responseBody(
        await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            byteSize: file.size,
            sha256,
            expectedActiveBrochureId: active?.id ?? null,
          }),
        }),
      )) as {
        pendingBrochureId: string;
        storageKey: string;
        secret: string;
        transport: "fake" | "vercel-blob";
      };

      if (prepared.transport === "fake") {
        const content = btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));
        await responseBody(
          await fetch("/admin/api/test-session-brochures/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              pendingBrochureId: prepared.pendingBrochureId,
              secret: prepared.secret,
              content,
            }),
          }),
        );
      } else
        await uploadPresigned(prepared.storageKey, file, {
          access: "private",
          contentType: "application/pdf",
          handleUploadUrl: "/admin/api/session-brochures/upload",
          clientPayload: JSON.stringify({
            sessionId,
            pendingBrochureId: prepared.pendingBrochureId,
            secret: prepared.secret,
          }),
          onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
        });

      // Provider completion is asynchronous; success means the database reports this version ACTIVE.
      let activated = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        const status = await responseBody(await fetch(base, { cache: "no-store" }));
        if (status.active?.id === prepared.pendingBrochureId) {
          activated = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!activated)
        throw new Error(
          "Le transfert est terminé, mais la validation est encore en cours. Actualisez la page dans un instant.",
        );
      setMessage("Brochure PDF enregistrée.");
      router.refresh();
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setBusy(false);
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (
      !active ||
      !window.confirm(`Retirer la brochure « ${active.filename} » ? Son historique sera conservé.`)
    )
      return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await responseBody(
        await fetch(base, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedActiveBrochureId: active.id }),
        }),
      );
      setMessage("Brochure retirée. L’historique est conservé.");
      router.refresh();
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="brochure-heading" className="mt-12 border-t border-[#c8cac0] pt-8">
      <h2 id="brochure-heading" className="text-xl font-medium text-[#173e32]">
        Brochure PDF
      </h2>
      {active ? (
        <div className="mt-5 space-y-2">
          <p className="break-words font-medium">{active.filename}</p>
          <p className="text-sm text-[#626862]">
            {(active.byteSize / 1024 / 1024).toFixed(2)} Mo ·{" "}
            {active.uploadedAt
              ? new Date(active.uploadedAt).toLocaleDateString("fr-FR")
              : "Date indisponible"}
          </p>
          <a
            className="wb-focus inline-flex min-h-10 items-center border-b border-current text-sm text-[#245b49]"
            href={`${base}/download`}
          >
            Télécharger la brochure
          </a>
        </div>
      ) : retained ? (
        <div className="mt-5 space-y-2">
          <p className="break-words font-medium">{retained.filename}</p>
          <p className="text-sm text-[#626862]">
            {(retained.byteSize / 1024 / 1024).toFixed(2)} Mo ·{" "}
            {retained.uploadedAt
              ? new Date(retained.uploadedAt).toLocaleDateString("fr-FR")
              : "Date indisponible"}
          </p>
          <p className="text-sm text-[#626862]">Brochure historique retirée.</p>
        </div>
      ) : (
        <p className="mt-5 text-sm text-[#626862]">Aucune brochure active.</p>
      )}
      {mutable && (
        <div className="mt-6 space-y-4">
          <label htmlFor="session-brochure" className="block text-sm font-medium">
            {active ? "Remplacer la brochure" : "Ajouter une brochure"}
          </label>
          <input
            ref={input}
            id="session-brochure"
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="wb-focus block w-full min-w-0 text-sm file:mr-4 file:min-h-10 file:border file:border-[#245b49] file:bg-transparent file:px-4 file:text-[#245b49]"
          />
          {active && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="wb-focus min-h-10 border-b border-current text-sm text-[#7c332b] disabled:opacity-50"
            >
              Retirer la brochure
            </button>
          )}
        </div>
      )}
      {busy && (
        <p role="status" aria-live="polite" className="mt-4 text-sm">
          {progress === null ? "Traitement en cours…" : `Transfert : ${progress} %`}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm text-[#245b49]">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-[#7c332b]">
          {error}
        </p>
      )}
    </section>
  );
}
