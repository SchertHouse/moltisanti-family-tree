import { Buffer } from 'node:buffer'
import console from 'node:console'
import { randomUUID } from 'node:crypto'
import { lstat, open, readFile, rename, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import imageConfig from '../image-config.json' with { type: 'json' }

const imageDataUrlPattern = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/

function parsePositiveInteger(value, name, maximum) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} deve essere un numero intero positivo.`)
  }
  if (parsed > maximum) {
    throw new Error(`${name} non può superare il limite configurato di ${maximum} pixel.`)
  }
  return parsed
}

function imageBuffer(dataUrl) {
  const match = imageDataUrlPattern.exec(dataUrl)
  if (!match) {
    if (dataUrl.startsWith('moltisanti-image:v1:')) {
      throw new Error('Sono presenti immagini cifrate: esporta prima il JSON in chiaro dall’app.')
    }
    throw new Error('Formato foto non supportato: è richiesto un data URL immagine Base64.')
  }
  if (!imageConfig.input.mimeTypes.includes(match[1])) {
    throw new Error('Formato foto non consentito dalla configurazione immagini.')
  }
  return Buffer.from(match[2], 'base64')
}

function orientedDimensions(metadata) {
  if (!metadata.width || !metadata.height) throw new Error('Dimensioni immagine non leggibili.')
  const swapsDimensions = metadata.orientation !== undefined && metadata.orientation >= 5
    && metadata.orientation <= 8
  return swapsDimensions
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height }
}

async function resizeImage(dataUrl, maxWidth, maxHeight) {
  const input = imageBuffer(dataUrl)
  const image = sharp(input, { animated: false, failOn: 'error' })
  const metadata = await image.metadata()
  const dimensions = orientedDimensions(metadata)
  if (dimensions.width <= maxWidth && dimensions.height <= maxHeight) {
    return { dataUrl, resized: false }
  }
  if (metadata.pages && metadata.pages > 1) {
    throw new Error('Non è possibile ridimensionare GIF o immagini animate senza perdere fotogrammi.')
  }

  const targetAspect = maxWidth / maxHeight
  let cropWidth = dimensions.width
  let cropHeight = dimensions.height
  if (dimensions.width / dimensions.height > targetAspect) {
    cropWidth = Math.max(1, Math.floor(dimensions.height * targetAspect))
  } else {
    cropHeight = Math.max(1, Math.floor(dimensions.width / targetAspect))
  }
  const left = Math.floor((dimensions.width - cropWidth) / 2)
  const top = Math.floor((dimensions.height - cropHeight) / 2)
  const outputMimeType = imageConfig.normalized.format
  const outputFormat = outputMimeType.slice('image/'.length)
  const output = await image
    .rotate()
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toFormat(outputFormat, { quality: Math.round(imageConfig.normalized.quality * 100) })
    .toBuffer()
  const encoded = `data:${outputMimeType};base64,${output.toString('base64')}`
  return { dataUrl: encoded, resized: true }
}

export async function resizeArchiveImages(archive, maxWidth, maxHeight) {
  maxWidth = parsePositiveInteger(maxWidth, 'La larghezza', imageConfig.normalized.maxWidth)
  maxHeight = parsePositiveInteger(maxHeight, 'L’altezza', imageConfig.normalized.maxHeight)
  if (archive?.format === 'moltisanti-encrypted') {
    throw new Error('Il file è un archivio cifrato: esporta prima il JSON in chiaro dall’app.')
  }
  if (!archive || typeof archive !== 'object' || !Array.isArray(archive.people)) {
    throw new Error('JSON non valido: è richiesto un archivio non cifrato con people[].')
  }

  let resizedCount = 0
  let unchangedCount = 0
  const processImage = async (value) => {
    if (value === undefined || value === null || value === '') return value
    if (typeof value !== 'string') throw new Error('Valore foto non valido nell’archivio.')
    const result = await resizeImage(value, maxWidth, maxHeight)
    if (result.resized) resizedCount += 1
    else unchangedCount += 1
    return result.dataUrl
  }

  const people = []
  for (const [personIndex, person] of archive.people.entries()) {
    if (!person || typeof person !== 'object' || Array.isArray(person)) {
      throw new Error(`Persona non valida all’indice ${personIndex}.`)
    }
    const photo = await processImage(person.photo)
    let gallery = person.gallery
    if (gallery !== undefined) {
      if (!Array.isArray(gallery)) throw new Error(`Galleria non valida per la persona all’indice ${personIndex}.`)
      gallery = []
      for (const image of person.gallery) {
        if (typeof image !== 'string' || image.length === 0) {
          throw new Error(`Immagine non valida nella galleria della persona all’indice ${personIndex}.`)
        }
        gallery.push(await processImage(image))
      }
    }
    people.push({
      ...person,
      ...(person.photo !== undefined ? { photo } : {}),
      ...(person.gallery !== undefined ? { gallery } : {}),
    })
  }

  return {
    archive: { ...archive, people },
    resizedCount,
    unchangedCount,
  }
}

async function replaceFileAtomically(filePath, contents, expectedFileInfo) {
  const resolvedPath = path.resolve(filePath)
  const temporaryPath = path.join(path.dirname(resolvedPath), `.moltisanti-resize-${randomUUID()}.tmp`)
  let handle
  try {
    handle = await open(temporaryPath, 'wx', expectedFileInfo.mode & 0o777)
    await handle.writeFile(contents, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    const currentInfo = await stat(resolvedPath)
    if (currentInfo.ino !== expectedFileInfo.ino || currentInfo.size !== expectedFileInfo.size ||
      currentInfo.mtimeMs !== expectedFileInfo.mtimeMs) {
      throw new Error('Il file è cambiato durante l’elaborazione; nessuna modifica è stata salvata.')
    }
    await rename(temporaryPath, resolvedPath)
  } catch (error) {
    if (handle) await handle.close()
    await unlink(temporaryPath).catch(() => {})
    throw error
  }
}

function printUsage() {
  console.log('Uso: npm run images:resize -- <archivio.json> <larghezza-massima> <altezza-massima> [--dry-run]')
  console.log('Ridimensiona centralmente le foto più grandi, poi sostituisce il JSON solo se tutte le immagini sono valide.')
}

async function main(args) {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage()
    return
  }
  const dryRun = args.includes('--dry-run')
  const positional = args.filter((argument) => argument !== '--dry-run')
  if (positional.length !== 3) {
    printUsage()
    throw new Error('Specificare il file JSON, la larghezza e l’altezza massime.')
  }

  const [filePath, widthArgument, heightArgument] = positional
  const maxWidth = parsePositiveInteger(widthArgument, 'La larghezza', imageConfig.normalized.maxWidth)
  const maxHeight = parsePositiveInteger(heightArgument, 'L’altezza', imageConfig.normalized.maxHeight)
  const fileInfo = await lstat(filePath)
  if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) {
    throw new Error('Il percorso deve indicare un file JSON regolare, non un collegamento o una cartella.')
  }
  const input = await readFile(filePath, 'utf8')
  let archive
  try {
    archive = JSON.parse(input)
  } catch {
    throw new Error('Il file non contiene JSON valido.')
  }
  const result = await resizeArchiveImages(archive, maxWidth, maxHeight)
  if (!dryRun) {
    await replaceFileAtomically(filePath, `${JSON.stringify(result.archive, null, 2)}\n`, fileInfo)
  }
  console.log(`${dryRun ? 'Anteprima' : 'Completato'}: ${result.resizedCount} immagini ridimensionate, ${result.unchangedCount} già entro i limiti.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Elaborazione immagini non riuscita.')
    process.exitCode = 1
  })
}
