import imageConfig from '../image-config.json'
import { normalizedSquareSize } from './imageCrop'

interface DecodedImage {
  width: number
  height: number
  source: CanvasImageSource
  close: () => void
}

function imageBlob(dataUrl: string): Blob {
  const match = /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match) throw new Error('Formato immagine da normalizzare non valido.')
  const binary = atob(match[2]!)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new Blob([bytes], { type: match[1] })
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() }
  }
  const url = URL.createObjectURL(blob)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image,
      close: () => URL.revokeObjectURL(url),
    })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Impossibile decodificare l’immagine da normalizzare.'))
    }
    image.src = url
  })
}

export async function normalizeLegacyImage(dataUrl: string): Promise<string> {
  const bitmap = await decodeImage(imageBlob(dataUrl))
  try {
    const square = Math.min(bitmap.width, bitmap.height)
    const outputSize = normalizedSquareSize(
      square, imageConfig.normalized.maxWidth, imageConfig.normalized.maxHeight,
    )
    const canvas = document.createElement('canvas')
    canvas.width = outputSize
    canvas.height = outputSize
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Questo browser non può normalizzare l’immagine.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, outputSize, outputSize)
    context.drawImage(
      bitmap.source,
      (bitmap.width - square) / 2,
      (bitmap.height - square) / 2,
      square,
      square,
      0,
      0,
      outputSize,
      outputSize,
    )
    return canvas.toDataURL(imageConfig.normalized.format, imageConfig.normalized.quality)
  } finally {
    bitmap.close()
  }
}

