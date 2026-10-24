import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Check, Crop, X } from 'lucide-react'
import { clampSquareCrop, cropToPixels, normalizedSquareSize, type SquareCrop } from './imageCrop'
import type { TranslationKey } from './i18n'
import imageConfig from '../image-config.json'

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string

interface Props {
  file: File
  t: Translate
  onCancel: () => void
  onComplete: (croppedImage: string) => void
}

interface ImageSize {
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
}

export default function ImageCropDialog({ file, t, onCancel, onComplete }: Props) {
  const [source, setSource] = useState('')
  const [dimensions, setDimensions] = useState<ImageSize | null>(null)
  const [crop, setCrop] = useState<SquareCrop | null>(null)
  const [error, setError] = useState('')
  const imageRef = useRef<HTMLImageElement>(null)
  const drag = useRef<{ pointerId: number; x: number; y: number; cropX: number; cropY: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const measureImage = () => {
    const image = imageRef.current
    if (!image || !image.naturalWidth || !image.naturalHeight) return
    const imageRect = image.getBoundingClientRect()
    const next = {
      width: imageRect.width,
      height: imageRect.height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }
    setDimensions(next)
    setCrop((current) => {
      if (current) return clampSquareCrop(current, next.width, next.height)
      const size = Math.min(next.width, next.height) * 0.8
      return { x: (next.width - size) / 2, y: (next.height - size) / 2, size }
    })
  }

  useEffect(() => {
    const image = imageRef.current
    if (!image) return
    if (typeof globalThis.ResizeObserver === 'undefined') {
      window.addEventListener('resize', measureImage)
      return () => window.removeEventListener('resize', measureImage)
    }
    const observer = new globalThis.ResizeObserver(measureImage)
    observer.observe(image)
    return () => observer.disconnect()
  }, [source])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!crop) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, cropX: crop.x, cropY: crop.y }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start || start.pointerId !== event.pointerId || !crop || !dimensions) return
    setCrop(clampSquareCrop({
      ...crop,
      x: start.cropX + event.clientX - start.x,
      y: start.cropY + event.clientY - start.y,
    }, dimensions.width, dimensions.height))
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  const resizeSquare = (size: number) => {
    if (!crop || !dimensions) return
    const nextSize = Math.min(Math.max(48, size), dimensions.width, dimensions.height)
    setCrop(clampSquareCrop({
      x: crop.x + (crop.size - nextSize) / 2,
      y: crop.y + (crop.size - nextSize) / 2,
      size: nextSize,
    }, dimensions.width, dimensions.height))
  }

  const completeCrop = async () => {
    const image = imageRef.current
    if (!image || !crop || !dimensions) {
      setError(t('cropImageNotReady'))
      return
    }
    try {
      const bitmap = typeof createImageBitmap === 'function'
        ? await createImageBitmap(file, { imageOrientation: 'from-image' })
        : null
      try {
        const source = bitmap ?? image
        const sourceWidth = bitmap?.width ?? image.naturalWidth
        const sourceHeight = bitmap?.height ?? image.naturalHeight
        const sourceRect = cropToPixels(crop, dimensions.width, dimensions.height, sourceWidth, sourceHeight)
        const outputSize = normalizedSquareSize(
          sourceRect.size, imageConfig.normalized.maxWidth, imageConfig.normalized.maxHeight,
        )
        const canvas = document.createElement('canvas')
        canvas.width = outputSize
        canvas.height = outputSize
        const context = canvas.getContext('2d')
        if (!context) throw new Error(t('cropCanvasUnavailable'))
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, outputSize, outputSize)
        context.drawImage(source, sourceRect.x, sourceRect.y, sourceRect.size, sourceRect.size, 0, 0, outputSize, outputSize)
        onComplete(canvas.toDataURL(imageConfig.normalized.format, imageConfig.normalized.quality))
      } finally {
        bitmap?.close()
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('cropFailure'))
    }
  }

  const cropPixels = crop && dimensions
    ? Math.round(crop.size * dimensions.naturalWidth / dimensions.width)
    : 0

  return <div className="modal-backdrop crop-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onCancel()
  }}>
    <section className="modal-card crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title">
      <button className="modal-close icon-button" aria-label={t('close')} onClick={onCancel}><X size={18} /></button>
      <div className="modal-symbol"><Crop size={23} /></div>
      <h2 id="crop-title">{t('cropTitle')}</h2>
      <p>{t('cropInstructions')}</p>
      <div className="crop-stage">
        {source && <img ref={imageRef} src={source} alt={t('cropPreview')} onLoad={measureImage} onError={() => setError(t('cropLoadFailure'))} />}
        {crop && dimensions && <div className="crop-image-overlay" style={{
          width: dimensions.width,
          height: dimensions.height,
          marginLeft: -dimensions.width / 2,
          marginTop: -dimensions.height / 2,
        }}>
          <div
            className="crop-square"
            role="group"
            aria-label={t('cropSelection')}
            style={{ width: crop.size, height: crop.size, left: crop.x, top: crop.y }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <span aria-hidden="true" className="crop-grid crop-grid-one" />
            <span aria-hidden="true" className="crop-grid crop-grid-two" />
            <span className="crop-drag-label">{t('cropDrag')}</span>
          </div>
        </div>}
      </div>
      <label className="crop-size-control">{t('cropSize')}
        <input type="range" min={48} max={Math.max(48, Math.floor(Math.min(dimensions?.width ?? 48, dimensions?.height ?? 48)))} value={crop?.size ?? 48}
          onChange={(event) => resizeSquare(Number(event.target.value))} disabled={!crop || !dimensions} />
      </label>
      {crop && <p className="crop-pixel-size">{t('cropOutputSize', { size: cropPixels })}</p>}
      {error && <p className="crop-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="button button-light" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="button button-primary" disabled={!crop || !dimensions} onClick={completeCrop}><Check size={16} />{t('applyCrop')}</button>
      </div>
    </section>
  </div>
}
