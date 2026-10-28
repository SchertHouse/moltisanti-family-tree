import { describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import sharp from 'sharp'
import { resizeArchiveImages } from './resize-archive-photos.mjs'

const scriptPath = path.resolve('scripts/resize-archive-photos.mjs')

function dataUrl(buffer, mimeType = 'image/png') {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

describe('resize archive images', () => {
  it('skips images already within both bounds', async () => {
    const image = await sharp({
      create: { width: 120, height: 60, channels: 3, background: '#ff0000' },
    }).png().toBuffer()
    const originalPhoto = dataUrl(image)
    const { archive, resizedCount, unchangedCount } = await resizeArchiveImages({
      schemaVersion: 1,
      people: [{ id: 'person-1', photo: originalPhoto }],
    }, 200, 200)

    expect(archive.people[0].photo).toBe(originalPhoto)
    expect(resizedCount).toBe(0)
    expect(unchangedCount).toBe(1)
  })

  it('center-crops oversized images to the requested aspect ratio and resizes without upscaling', async () => {
    const raw = Buffer.alloc(120 * 60 * 3)
    for (let y = 0; y < 60; y += 1) {
      for (let x = 0; x < 120; x += 1) {
        const offset = (y * 120 + x) * 3
        raw[offset] = x < 30 ? 255 : 0
        raw[offset + 1] = x >= 30 && x < 90 ? 255 : 0
        raw[offset + 2] = x >= 90 ? 255 : 0
      }
    }
    const image = await sharp(raw, { raw: { width: 120, height: 60, channels: 3 } }).png().toBuffer()
    const { archive, resizedCount } = await resizeArchiveImages({
      schemaVersion: 1,
      people: [{ id: 'person-1', photo: dataUrl(image) }],
    }, 60, 60)
    const match = /^data:image\/jpeg;base64,(.+)$/.exec(archive.people[0].photo)
    expect(match).not.toBeNull()
    const { data, info } = await sharp(Buffer.from(match[1], 'base64')).raw().toBuffer({ resolveWithObject: true })

    expect(info.width).toBe(60)
    expect(info.height).toBe(60)
    expect(resizedCount).toBe(1)
    expect(data[0]).toBeLessThan(20)
    expect(data[1]).toBeGreaterThan(240)
    expect(data[2]).toBeLessThan(20)
  })

  it('does not enlarge the centered crop when the crop is smaller than the requested bounds', async () => {
    const image = await sharp({
      create: { width: 120, height: 20, channels: 3, background: '#00ff00' },
    }).png().toBuffer()
    const { archive } = await resizeArchiveImages({
      people: [{ id: 'person-1', photo: dataUrl(image) }],
    }, 60, 60)
    const match = /^data:image\/jpeg;base64,(.+)$/.exec(archive.people[0].photo)
    const dimensions = await sharp(Buffer.from(match[1], 'base64')).metadata()

    expect(dimensions.width).toBe(20)
    expect(dimensions.height).toBe(20)
  })

  it('respects EXIF orientation before center-cropping', async () => {
    const raw = Buffer.alloc(120 * 60 * 3)
    for (let y = 0; y < 60; y += 1) {
      for (let x = 0; x < 120; x += 1) {
        const offset = (y * 120 + x) * 3
        raw[offset] = x < 30 ? 255 : 0
        raw[offset + 1] = x >= 30 && x < 90 ? 255 : 0
        raw[offset + 2] = x >= 90 ? 255 : 0
      }
    }
    const orientedImage = await sharp(raw, { raw: { width: 120, height: 60, channels: 3 } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const { archive } = await resizeArchiveImages({
      people: [{ id: 'person-1', photo: dataUrl(orientedImage, 'image/jpeg') }],
    }, 60, 60)
    const match = /^data:image\/jpeg;base64,(.+)$/.exec(archive.people[0].photo)
    const { data, info } = await sharp(Buffer.from(match[1], 'base64')).raw().toBuffer({ resolveWithObject: true })
    const centerPixel = (30 * info.width + 30) * info.channels

    expect(info.width).toBe(60)
    expect(info.height).toBe(60)
    expect(data[centerPixel]).toBeLessThan(30)
    expect(data[centerPixel + 1]).toBeGreaterThan(220)
    expect(data[centerPixel + 2]).toBeLessThan(30)
  })

  it('processes profile photos and gallery entries while preserving other person fields', async () => {
    const image = await sharp({
      create: { width: 240, height: 120, channels: 3, background: '#00ff00' },
    }).png().toBuffer()
    const source = dataUrl(image)
    const { archive, resizedCount } = await resizeArchiveImages({
      schemaVersion: 1,
      people: [{ id: 'person-1', name: 'Example', photo: source, gallery: [source] }],
    }, 120, 120)

    expect(archive.people[0].id).toBe('person-1')
    expect(archive.people[0].name).toBe('Example')
    expect(archive.people[0].photo).toMatch(/^data:image\/jpeg;base64,/)
    expect(archive.people[0].gallery[0]).toMatch(/^data:image\/jpeg;base64,/)
    expect(resizedCount).toBe(2)
  })

  it('rejects encrypted archives and encrypted image values without changing input', async () => {
    await expect(resizeArchiveImages({
      format: 'moltisanti-encrypted',
    }, 100, 100)).rejects.toThrow(/archivio cifrato/)
    await expect(resizeArchiveImages({
      people: [{ id: 'person-1', photo: 'moltisanti-image:v1:encrypted' }],
    }, 100, 100)).rejects.toThrow(/immagini cifrate/)
  })

  it('rejects an invalid archive shape', async () => {
    await expect(resizeArchiveImages({ people: {} }, 100, 100))
      .rejects.toThrow(/JSON non valido/)
  })

  it('rejects non-positive or fractional maximum dimensions', async () => {
    await expect(resizeArchiveImages({ people: [] }, 0, 100))
      .rejects.toThrow(/numero intero positivo/)
    await expect(resizeArchiveImages({ people: [] }, 100, 10.5))
      .rejects.toThrow(/numero intero positivo/)
  })

  it('writes only after the whole archive succeeds and supports dry-run', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'resize-archive-photos-'))
    const filePath = path.join(directory, 'archive.json')
    const image = await sharp({
      create: { width: 240, height: 120, channels: 3, background: '#00ff00' },
    }).png().toBuffer()
    const validArchive = JSON.stringify({ people: [{ photo: dataUrl(image) }] })
    try {
      await writeFile(filePath, validArchive)
      execFileSync(process.execPath, [scriptPath, filePath, '120', '120', '--dry-run'], { stdio: 'ignore' })
      expect(await readFile(filePath, 'utf8')).toBe(validArchive)

      execFileSync(process.execPath, [scriptPath, filePath, '120', '120'], { stdio: 'ignore' })
      const saved = JSON.parse(await readFile(filePath, 'utf8'))
      expect(saved.people[0].photo).toMatch(/^data:image\/jpeg;base64,/)

      const invalidArchive = JSON.stringify({ people: [
        { photo: dataUrl(image) },
        { photo: 'not-an-image' },
      ] })
      await writeFile(filePath, invalidArchive)
      expect(() => execFileSync(process.execPath, [scriptPath, filePath, '120', '120'], { stdio: 'ignore' }))
        .toThrow()
      expect(await readFile(filePath, 'utf8')).toBe(invalidArchive)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
