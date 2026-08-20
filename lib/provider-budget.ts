export type ProviderTiming = { durationMs: number; timedOut: boolean };

export async function withTimeBudget<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs: number,
): Promise<{ value: T; timing: ProviderTiming }> {
  const startedAt = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ value: T; timedOut: boolean }>((resolve) => {
    timeout = setTimeout(() => resolve({ value: fallback, timedOut: true }), timeoutMs);
  });
  const result = await Promise.race([
    promise.then((value) => ({ value, timedOut: false })),
    timeoutPromise,
  ]);
  if (timeout) clearTimeout(timeout);
  return {
    value: result.value,
    timing: { durationMs: Date.now() - startedAt, timedOut: result.timedOut },
  };
}
