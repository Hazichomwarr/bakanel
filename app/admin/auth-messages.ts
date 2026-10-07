import { ADMIN_LOGIN_PATH } from "@/lib/auth/current-admin";
import type { AdminAuthErrorCode } from "@/lib/auth/errors";

export const INVALID_LOGIN_MESSAGE = "Email ou mot de passe incorrect.";
export const THROTTLED_MESSAGE = "Trop de tentatives. Veuillez réessayer dans quelques minutes.";
export const UNAVAILABLE_MESSAGE = "Le service est momentanément indisponible. Veuillez réessayer.";
export const PASSWORD_CHANGED_PATH = `${ADMIN_LOGIN_PATH}?motDePasse=modifie`;

export const passwordChangeMessages: Partial<Record<AdminAuthErrorCode, string>> = {
  INVALID_CURRENT_PASSWORD: "Le mot de passe actuel est incorrect.",
  PASSWORD_CONFIRMATION_MISMATCH: "La confirmation ne correspond pas au nouveau mot de passe.",
  INVALID_PASSWORD: "Le nouveau mot de passe doit contenir entre 12 et 256 caractères.",
  LOGIN_THROTTLED: THROTTLED_MESSAGE,
  STALE_ADMIN_STATE: "Votre compte a été modifié entre-temps. Veuillez vous reconnecter.",
};
