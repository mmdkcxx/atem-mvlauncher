// Highest resolution first, then highest frame rate within that resolution.
const RESOLUTIONS = [
  [3840, 2160],
  [1920, 1080],
  [1280, 720],
]
const FRAME_RATES = [60, 50, 30, 25]

export const CANDIDATE_MODES = Object.freeze(
  RESOLUTIONS.flatMap(([width, height]) => FRAME_RATES.map((frameRate) => Object.freeze({ width, height, frameRate }))),
)

const sameMode = (a, b) => a.width === b.width && a.height === b.height && a.frameRate === b.frameRate

// tryOpen(mode) opens the camera in that mode and resolves true if it accepted it.
// measureFps(mode) measures what the open stream really delivers.
export async function chooseMode({ candidates = CANDIDATE_MODES, saved = null, tryOpen, measureFps, tolerance = 0.9 }) {
  const ladder = saved ? [saved, ...candidates.filter((m) => !sameMode(m, saved))] : candidates
  for (const mode of ladder) {
    if (!(await tryOpen(mode))) continue
    const measuredFps = await measureFps(mode)
    if (measuredFps >= mode.frameRate * tolerance) return { mode, measuredFps }
  }
  return null
}
