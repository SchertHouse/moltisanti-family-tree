export interface SquareCrop {
  x: number
  y: number
  size: number
}

export function normalizedSquareSize(sourceSize: number, maxWidth: number, maxHeight: number): number {
  if (![sourceSize, maxWidth, maxHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Dimensioni immagine non valide.')
  }
  return Math.max(1, Math.min(Math.round(sourceSize), Math.floor(maxWidth), Math.floor(maxHeight)))
}

export function clampSquareCrop(crop: SquareCrop, imageWidth: number, imageHeight: number): SquareCrop {
  const size = Math.max(1, Math.min(crop.size, imageWidth, imageHeight))
  return {
    size,
    x: Math.max(0, Math.min(crop.x, imageWidth - size)),
    y: Math.max(0, Math.min(crop.y, imageHeight - size)),
  }
}

export function cropToPixels(
  crop: SquareCrop,
  displayWidth: number,
  displayHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): SquareCrop {
  if ([displayWidth, displayHeight, naturalWidth, naturalHeight].some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Dimensioni immagine non valide.')
  }
  const safe = clampSquareCrop(crop, displayWidth, displayHeight)
  const scaleX = naturalWidth / displayWidth
  const scaleY = naturalHeight / displayHeight
  const size = Math.round(Math.min(safe.size * scaleX, safe.size * scaleY))
  return {
    x: Math.round(safe.x * scaleX),
    y: Math.round(safe.y * scaleY),
    size: Math.max(1, Math.min(size, naturalWidth, naturalHeight)),
  }
}
