/**
 * Institutional training domains confirmed by the owner. These are static, localized
 * positioning content — not TrainingDomain catalogue records — and never imply that a
 * specific programme, schedule or credential exists.
 *
 * Order is presentation order: insurance is the institute's priority specialization.
 */
export const trainingDomainKeys = ["assurance", "gestionProjet", "statistique"] as const;

export type TrainingDomainKey = (typeof trainingDomainKeys)[number];

export const priorityTrainingDomain: TrainingDomainKey = "assurance";
