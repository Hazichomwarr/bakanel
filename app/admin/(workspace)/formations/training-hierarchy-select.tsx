"use client";

import { useMemo, useState } from "react";

type Selector = { id: string; translations: { locale: string; name: string }[]; topics: { id: string; trainingDomainId: string; translations: { locale: string; name: string }[] }[] };
const name = (translations: { locale: string; name: string }[]) => translations.find((item) => item.locale === "FR")?.name ?? translations[0]?.name ?? "Sans titre";

export function TrainingHierarchySelect({ domains, initialDomainId, initialTopicId }: { domains: Selector[]; initialDomainId?: string; initialTopicId?: string }) {
  const [domainId, setDomainId] = useState(initialDomainId ?? domains[0]?.id ?? "");
  const topics = useMemo(() => domains.find((domain) => domain.id === domainId)?.topics ?? [], [domainId, domains]);
  const [topicId, setTopicId] = useState(initialTopicId && topics.some((topic) => topic.id === initialTopicId) ? initialTopicId : topics[0]?.id ?? "");
  return <div className="grid gap-5 border-y border-[#c8cac0] py-6 sm:grid-cols-2">
    <label className="flex flex-col gap-2 text-sm font-medium">Domaine<select name="domainId" value={domainId} onChange={(event) => { const next = event.target.value; setDomainId(next); setTopicId(domains.find((domain) => domain.id === next)?.topics[0]?.id ?? ""); }} className="min-h-11 border border-[#a8aaa1] bg-[#fbfaf7] px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245b49]">{domains.map((domain) => <option key={domain.id} value={domain.id}>{name(domain.translations)}</option>)}</select></label>
    <label className="flex flex-col gap-2 text-sm font-medium">Thématique<select name="topicId" value={topicId} onChange={(event) => setTopicId(event.target.value)} required disabled={!topics.length} className="min-h-11 border border-[#a8aaa1] bg-[#fbfaf7] px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245b49] disabled:bg-stone-100">{topics.length ? topics.map((topic) => <option key={topic.id} value={topic.id}>{name(topic.translations)}</option>) : <option value="">Aucune thématique disponible</option>}</select></label>
  </div>;
}
