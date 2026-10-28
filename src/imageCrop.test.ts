import { describe, expect, it } from 'vitest'
import imageConfig from '../image-config.json'
import { clampSquareCrop, cropToPixels, normalizedSquareSize } from './imageCrop'

describe('square image crop geometry', () => {
  it('keeps a dragged square inside image bounds', () => {
    expect(clampSquareCrop({ x: 90, y: -4, size: 40 }, 100, 80)).toEqual({ x: 60, y: 0, size: 40 })
  })

  it('maps the selected display square to source pixels', () => {
    expect(cropToPixels({ x: 25, y: 10, size: 50 }, 100, 80, 400, 320))
      .toEqual({ x: 100, y: 40, size: 200 })
  })

  it('rejects non-finite source dimensions', () => {
    expect(() => cropToPixels({ x: 0, y: 0, size: 10 }, 0, 10, 100, 100)).toThrow(/Dimensioni/)
  })

  it('caps output resolution without enlarging smaller crops', () => {
    expect(normalizedSquareSize(2400, 1200, 1200)).toBe(1200)
    expect(normalizedSquareSize(640, 1200, 1200)).toBe(640)
    expect(() => normalizedSquareSize(640, 0, 1200)).toThrow(/Dimensioni/)
  })

  it('uses the configured 320 pixel maximum for new normalized photos', () => {
    expect(imageConfig.normalized.maxWidth).toBe(320)
    expect(imageConfig.normalized.maxHeight).toBe(320)
    expect(normalizedSquareSize(2400, imageConfig.normalized.maxWidth, imageConfig.normalized.maxHeight))
      .toBe(320)
  })
})
