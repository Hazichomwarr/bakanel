import type { HomeDictionary } from "@/lib/public/content";
import type { HomepageTrainingPreview } from "@/lib/public/homepage";

function PreviewMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-14 max-w-2xl border-l border-[#c9d8c8] pl-6 text-lg leading-8 text-[#d9e7d8]">
      {children}
    </p>
  );
}

export function HomeTrainingPreview({
  dictionary,
  preview,
}: {
  dictionary: HomeDictionary;
  preview: HomepageTrainingPreview;
}) {
  return (
    <section
      id="formations-publiees"
      aria-labelledby="formations-publiees-title"
      className="bg-[var(--wb-green-deep)] py-24 text-white lg:py-32"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8 xl:px-0">
        <div className="max-w-3xl">
          <p className="wb-mono text-xs tracking-[0.18em] text-[#c9d8c8]">
            {dictionary.trainingEyebrow}
          </p>
          <h2
            id="formations-publiees-title"
            className="wb-editorial mt-6 text-4xl leading-tight font-medium sm:text-5xl"
          >
            {dictionary.trainingTitle}
          </h2>
          <p className="mt-6 text-lg leading-8 text-[#d9e7d8]">{dictionary.trainingDescription}</p>
        </div>
        {preview.status === "available" ? (
          <ul className="mt-14 grid gap-px border border-white/20 bg-white/20 md:grid-cols-3">
            {preview.trainings.map((training) => (
              <li
                key={training.slug}
                className="flex min-h-64 flex-col bg-[var(--wb-green-deep)] p-7"
              >
                <p className="wb-mono text-xs tracking-[0.16em] text-[#c9d8c8]">W&apos;BAKENEL</p>
                <h3 className="mt-auto text-2xl font-medium tracking-tight">{training.title}</h3>
                <p className="mt-4 leading-7 text-[#d9e7d8]">
                  {training.summary ?? dictionary.trainingNoSummary}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        {preview.status === "empty" ? (
          <PreviewMessage>{dictionary.trainingEmpty}</PreviewMessage>
        ) : null}
        {preview.status === "unavailable" ? (
          <div role="status">
            <PreviewMessage>{dictionary.trainingUnavailable}</PreviewMessage>
          </div>
        ) : null}
      </div>
    </section>
  );
}
