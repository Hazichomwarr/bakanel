import "server-only";

import { brochureUploadAuthorizationService } from "@/lib/training-session-brochure-authorization.service";
import { trainingSessionBrochureService } from "@/lib/training-session-brochure.service";
import {
  fakeBrochureStorage,
  fakeBrochureStorageEnabled,
} from "@/lib/session-brochure-fake-storage";
import { createSessionBrochureStorageWorkflow } from "@/lib/session-brochure-storage.workflow";
import {
  createVercelPrivateBrochureStorage,
  resolveVercelPrivateBlobConfiguration,
} from "@/lib/session-brochure-storage";

export function brochureStorage() {
  if (fakeBrochureStorageEnabled(process.env)) return fakeBrochureStorage;
  return createVercelPrivateBrochureStorage(resolveVercelPrivateBlobConfiguration(process.env));
}

export function usesFakeBrochureStorage() {
  return fakeBrochureStorageEnabled(process.env);
}

export function brochureWorkflow() {
  return createSessionBrochureStorageWorkflow(
    brochureStorage(),
    trainingSessionBrochureService,
    brochureUploadAuthorizationService,
  );
}
