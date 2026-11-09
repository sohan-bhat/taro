import { API_ROUTES } from '@taro/shared';
import { log, errorMessage } from '../lib/logger';

const EVERY_MS = 10 * 60 * 1000;

export function keepAwakeTarget(baseUrl: string): string | null {
  if (!/^https:\/\//.test(baseUrl)) return null;
  return `${baseUrl.replace(/\/+$/, '')}${API_ROUTES.HEALTH}`;
}

export function startKeepAwake(baseUrl: string): void {
  const target = keepAwakeTarget(baseUrl);
  if (!target) return;
  setInterval(() => {
    fetch(target, { signal: AbortSignal.timeout(15_000) }).catch((error) =>
      log.warn(`[KeepAwake] Request to ${target} failed: ${errorMessage(error)}`)
    );
  }, EVERY_MS).unref();
  log.info(`[Boot] Requesting ${target} every 10 minutes so a free host keeps the API awake`);
}
