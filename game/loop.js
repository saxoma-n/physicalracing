export const STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 250; // a backgrounded tab must not dump seconds of physics into one frame

export function advance(accMs, frameMs) {
  const acc = accMs + Math.min(frameMs, MAX_FRAME_MS);
  const steps = Math.floor((acc + 1e-6) / STEP_MS); // epsilon: 15 * STEP_MS is a hair over 250 in floating point
  return { steps, acc: Math.max(0, acc - steps * STEP_MS) };
}
