let counter = 0;

/**
 * Collision-safe id without crypto: time component + monotonic counter + random tail.
 * Sufficient for local-first, single-device data.
 */
export function newId(prefix: string): string {
  counter = (counter + 1) % 0xffff;
  const time = Date.now().toString(36);
  const count = counter.toString(36).padStart(3, '0');
  const rand = Math.floor(Math.random() * 0xffffff).toString(36).padStart(5, '0');
  return `${prefix}_${time}${count}${rand}`;
}
