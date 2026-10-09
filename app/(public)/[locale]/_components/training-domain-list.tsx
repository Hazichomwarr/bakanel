import type { TrainingDomainsDictionary } from "@/lib/public/content";
import { priorityTrainingDomain, trainingDomainKeys } from "@/lib/public/training-domains";

/**
 * The three confirmed training domains. Insurance, the priority specialization, is listed
 * first and given the dominant tile; the order is the same on every screen size.
 */
export function TrainingDomainList({ dictionary }: { dictionary: TrainingDomainsDictionary }) {
  return (
    <ul className="grid gap-px border border-[var(--wb-rule)] bg-[var(--wb-rule)] lg:grid-cols-[1.25fr_1fr] lg:grid-rows-2">
      {trainingDomainKeys.map((key, index) => {
        const domain = dictionary.items[key];
        const isPriority = key === priorityTrainingDomain;

        if (isPriority) {
          return (
            <li
              key={key}
              className="flex flex-col bg-[var(--wb-green-deep)] p-7 text-white sm:p-10 lg:row-span-2"
            >
              <p className="wb-mono text-xs tracking-[0.16em] text-[#c9d8c8]">
                0{index + 1}
                <span className="ml-3 border border-[#c9d8c8] px-2 py-1 uppercase">
                  {dictionary.priorityLabel}
                </span>
              </p>
              <h3 className="wb-editorial mt-12 text-5xl font-medium sm:text-6xl lg:mt-auto">
                {domain.name}
              </h3>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#e2ece1]">{domain.description}</p>
            </li>
          );
        }

        return (
          <li key={key} className="flex flex-col bg-[var(--wb-paper)] p-7 sm:p-10">
            <p className="wb-mono text-xs tracking-[0.16em] text-[var(--wb-green)]">0{index + 1}</p>
            <h3 className="mt-6 text-3xl font-medium tracking-tight">{domain.name}</h3>
            <p className="mt-4 max-w-xl leading-7 text-[var(--wb-muted)]">{domain.description}</p>
          </li>
        );
      })}
    </ul>
  );
}
