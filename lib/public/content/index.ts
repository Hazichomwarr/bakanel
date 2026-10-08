import { en } from "./en";
import { fr } from "./fr";
import { pt } from "./pt";
import type { PublicDictionary } from "./types";
import type { PublicLocale } from "../locale";
export type { PublicDictionary } from "./types";
export const dictionaries: Record<PublicLocale, PublicDictionary> = { fr, en, pt };
