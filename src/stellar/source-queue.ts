const tails = new Map<string, Promise<void>>();

/**
 * Stellar Core admits one pending transaction per source account and answers
 * TRY_AGAIN_LATER to the rest, so sends from one account run one at a time.
 * The queue is per process; the lab runs a single instance.
 */
export function oneAtATime<T>(
  sourcePublicKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(sourcePublicKey) ?? Promise.resolve();
  const run = previous.then(fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(sourcePublicKey, tail);
  void tail.then(() => {
    if (tails.get(sourcePublicKey) === tail) tails.delete(sourcePublicKey);
  });
  return run;
}
