import { isIP } from "node:net";

/**
 * Client address for the secondary (per-address) login throttle, or null when it cannot be trusted.
 *
 * Forwarding headers are client-controlled unless a trusted reverse proxy sets them, so nothing is read unless
 * the deployment names that proxy's header in ADMIN_CLIENT_IP_HEADER (e.g. `x-real-ip`, or `x-forwarded-for`
 * behind exactly one appending proxy). The last comma-separated entry is used: it is the one the nearest proxy
 * added; earlier entries can be forged by the client. Anything that is not a plain IP address yields null.
 *
 * The per-account throttle never depends on this value.
 */
export function trustedClientAddress(headers: Headers, trustedHeader = process.env.ADMIN_CLIENT_IP_HEADER) {
  const name = trustedHeader?.trim().toLowerCase();
  if (!name) return null;
  const entries = headers.get(name)?.split(",").map(entry => entry.trim()).filter(Boolean);
  const candidate = entries?.at(-1);
  if (!candidate) return null;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(candidate)?.[1];
  const address = (mapped ?? candidate).toLowerCase();
  return isIP(address) ? address : null;
}
