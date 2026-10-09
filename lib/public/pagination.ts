export const DEFAULT_PUBLIC_PAGE_SIZE = 12;
export const MAX_PUBLIC_PAGE_SIZE = 48;

export type PublicListOptions = {
  offset?: number;
  limit?: number;
};

export function publicPageSize(requested?: number) {
  if (requested === undefined) {
    return DEFAULT_PUBLIC_PAGE_SIZE;
  }

  if (!Number.isInteger(requested) || requested < 1) {
    return DEFAULT_PUBLIC_PAGE_SIZE;
  }

  return Math.min(requested, MAX_PUBLIC_PAGE_SIZE);
}

export function publicOffset(requested?: number) {
  if (requested === undefined || !Number.isInteger(requested) || requested < 0) {
    return 0;
  }

  return requested;
}
