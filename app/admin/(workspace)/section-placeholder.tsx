export function AdminSectionPlaceholder({ title, description }: { title: string; description: string }) {
  return <section className="max-w-3xl border-t border-[#18211d] pt-7"><p className="wb-mono text-xs tracking-[0.16em] text-[#245b49]">ESPACE OPÉRATIONNEL</p><h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] md:text-4xl">{title}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-[#626862]">{description}</p><p className="mt-12 border-y border-[#c8cac0] py-5 text-sm leading-6 text-[#626862]">La gestion détaillée sera disponible dans une prochaine étape.</p></section>;
}
