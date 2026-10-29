import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import imageConfig from '../image-config.json'
import { translate, type Language, type TranslationKey } from './i18n'
import { getImageVariant, imageDataUrlToBlob } from './imageVariants'
import { decryptImageDataUrl, isEncryptedImage } from './crypto'
import { TreePhoto } from './PhotoVariant'

interface TreePhotoDiagnosticProps {
  personId: string
  source: string
  passphrase: string
  language: Language
}

type Rendering =
  | 'source-html' | 'source-svg' | 'tree-photo'
  | 'html-blob' | 'svg-blob' | 'svg-clipped-blob' | 'html-data' | 'svg-data' | 'svg-xlink-data'
type RenderingStatus = 'waiting' | 'loading' | 'loaded' | 'failed'
type RenderingStatuses = Record<Rendering, RenderingStatus>

const variantRenderings: Rendering[] = [
  'html-blob', 'svg-blob', 'svg-clipped-blob', 'html-data', 'svg-data', 'svg-xlink-data',
]

interface DiagnosticPhotoState {
  identity: string
  sourceUrl: string | null
  sourceError: string | null
  variantUrl: string | null
  variantDataUrl: string | null
  variantError: string | null
  statuses: RenderingStatuses
}

const renderings: Rendering[] = [
  'source-html', 'source-svg', 'tree-photo', ...variantRenderings,
]
const loadingStatuses: RenderingStatuses = {
  'source-html': 'loading',
  'source-svg': 'loading',
  'tree-photo': 'waiting',
  'html-blob': 'loading',
  'svg-blob': 'loading',
  'svg-clipped-blob': 'loading',
  'html-data': 'loading',
  'svg-data': 'loading',
  'svg-xlink-data': 'loading',
}

const failedVariantStatuses: RenderingStatuses = {
  ...loadingStatuses,
  'html-blob': 'failed',
  'svg-blob': 'failed',
  'svg-clipped-blob': 'failed',
  'html-data': 'failed',
  'svg-data': 'failed',
  'svg-xlink-data': 'failed',
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.'
}

export default function TreePhotoDiagnostic({
  personId, source, passphrase, language,
}: TreePhotoDiagnosticProps) {
  const identity = JSON.stringify([personId, source, passphrase])
  const [photo, setPhoto] = useState<DiagnosticPhotoState>({
    identity: '',
    sourceUrl: null,
    sourceError: null,
    variantUrl: null,
    variantDataUrl: null,
    variantError: null,
    statuses: loadingStatuses,
  })
  const currentPhoto = photo.identity === identity
    ? photo
    : {
      identity, sourceUrl: null, sourceError: null,
      variantUrl: null, variantDataUrl: null, variantError: null, statuses: loadingStatuses,
    }
  const titleId = `tree-photo-diagnostic-${useId().replaceAll(':', '')}`
  const panelRef = useRef<HTMLElement>(null)
  const t = (key: TranslationKey, values?: Record<string, string | number>) =>
    translate(language, key, values)

  useEffect(() => {
    let active = true
    let sourceUrl: string | null = null
    let variantUrl: string | null = null
    const updatePhoto = (update: Partial<DiagnosticPhotoState>) => {
      setPhoto((current) => current.identity === identity
        ? { ...current, ...update }
        : {
          identity,
          sourceUrl: null,
          sourceError: null,
          variantUrl: null,
          variantDataUrl: null,
          variantError: null,
          statuses: loadingStatuses,
          ...update,
        })
    }
    const load = async () => {
      let sourceDataUrl: string
      try {
        sourceDataUrl = isEncryptedImage(source)
          ? await decryptImageDataUrl(source, passphrase)
          : source
        if (!active) return
        sourceUrl = URL.createObjectURL(imageDataUrlToBlob(sourceDataUrl))
        updatePhoto({ sourceUrl })
      } catch (error) {
        if (!active) return
        updatePhoto({
          sourceError: errorMessage(error),
          statuses: { ...loadingStatuses, 'source-html': 'failed', 'source-svg': 'failed' },
        })
        return
      }

      try {
        const variantDataUrl = await getImageVariant(personId, source, imageConfig.variants.tree, passphrase, 1)
        if (!active) return
        variantUrl = URL.createObjectURL(imageDataUrlToBlob(variantDataUrl))
        updatePhoto({ variantDataUrl, variantUrl })
      } catch (error) {
        if (active) updatePhoto({
          variantError: errorMessage(error),
          statuses: failedVariantStatuses,
        })
      }
    }
    void load()

    return () => {
      active = false
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
      if (variantUrl) URL.revokeObjectURL(variantUrl)
    }
  }, [identity, personId, source, passphrase])

  const setStatus = useCallback((rendering: Rendering, status: RenderingStatus) => {
    setPhoto((current) => current.identity === identity
      ? { ...current, statuses: { ...current.statuses, [rendering]: status } }
      : current)
  }, [identity])
  useLayoutEffect(() => {
    const cleanupListeners: Array<() => void> = []
    const samples = panelRef.current?.querySelectorAll('[data-photo-rendering]') ?? []
    for (const sample of samples) {
      const value = sample.getAttribute('data-photo-rendering')
      const rendering = renderings.find((item) => item === value)
      if (!rendering) continue
      const loaded = () => setStatus(rendering, 'loaded')
      const failed = () => setStatus(rendering, 'failed')
      sample.addEventListener('load', loaded)
      sample.addEventListener('error', failed)
      cleanupListeners.push(() => {
        sample.removeEventListener('load', loaded)
        sample.removeEventListener('error', failed)
      })
      if (sample instanceof HTMLImageElement && sample.complete) {
        setStatus(rendering, sample.naturalWidth > 0 ? 'loaded' : 'failed')
      }
    }
    return () => cleanupListeners.forEach((cleanup) => cleanup())
  }, [currentPhoto.sourceUrl, currentPhoto.variantUrl, setStatus])
  const statusLabel = (status: RenderingStatus) => t(
    status === 'waiting' ? 'photoTestWaiting'
      : status === 'loading' ? 'photoTestLoading'
        : status === 'loaded' ? 'photoTestLoaded' : 'photoTestFailed',
  )
  const sampleLabel = (rendering: Rendering) => t(
    rendering === 'source-html' ? 'photoTestSourceHtml'
      : rendering === 'source-svg' ? 'photoTestSourceSvg'
        : rendering === 'html-blob' ? 'photoTestHtmlBlob'
      : rendering === 'svg-blob' ? 'photoTestSvgBlob'
        : rendering === 'svg-clipped-blob' ? 'photoTestSvgClipBlob'
          : rendering === 'html-data' ? 'photoTestHtmlData'
            : rendering === 'svg-data' ? 'photoTestSvgData' : 'photoTestSvgXlink',
  )

  return <section ref={panelRef} className="tree-photo-diagnostic" aria-labelledby={`${titleId}-title`}>
    <h3 id={`${titleId}-title`}>{t('photoTestTitle')}</h3>
    <p>{t('photoTestHint')}</p>
    {currentPhoto.sourceError && <p role="status">
      {t('photoTestSourceFailure', { error: currentPhoto.sourceError })}
    </p>}
    {currentPhoto.variantError && <p role="status">
      {t('photoTestVariantFailure', { error: currentPhoto.variantError })}
    </p>}
    <div className="tree-photo-diagnostic-samples">
      {renderings.map((rendering) => {
        const originalSource = rendering.startsWith('source-')
        if (originalSource && currentPhoto.sourceError) return null
        if (!originalSource && currentPhoto.sourceError) return null
        if (rendering === 'tree-photo' && !currentPhoto.sourceUrl) {
          return <div className="tree-photo-diagnostic-sample" key={rendering}>
            <strong>{t('photoTestTreePhoto')}</strong>
            <small role="status">{t('photoTestLoading')}</small>
          </div>
        }
        if (rendering === 'tree-photo') return <div className="tree-photo-diagnostic-sample" key={rendering}>
          <strong>{t('photoTestTreePhoto')}</strong>
          <div className="tree-photo-diagnostic-preview">
            <svg viewBox="0 0 68 68" role="img" aria-label={t('photoTestTreePhoto')}>
              <TreePhoto
                personId={personId}
                source={source}
                passphrase={passphrase}
                onError={() => setStatus('tree-photo', 'failed')}
                onLoadStart={() => setStatus('tree-photo', 'loading')}
                onImageLoad={() => setStatus('tree-photo', 'loaded')}
                onImageError={() => setStatus('tree-photo', 'failed')}
              />
            </svg>
          </div>
          <small role="status">{statusLabel(currentPhoto.statuses['tree-photo'])}</small>
        </div>
        if (!originalSource && currentPhoto.variantError) return <div className="tree-photo-diagnostic-sample" key={rendering}>
          <strong>{sampleLabel(rendering)}</strong>
          <small role="status">{statusLabel('failed')}</small>
        </div>
        if (originalSource ? !currentPhoto.sourceUrl : !currentPhoto.variantUrl) {
          return <div className="tree-photo-diagnostic-sample" key={rendering}>
            <strong>{sampleLabel(rendering)}</strong>
            <small role="status">{t('photoTestLoading')}</small>
          </div>
        }
        const usesHtml = rendering.startsWith('html') || rendering === 'source-html'
        const usesBlob = rendering.endsWith('blob')
        const sampleSource = originalSource
          ? currentPhoto.sourceUrl
          : usesBlob ? currentPhoto.variantUrl : currentPhoto.variantDataUrl
        const clipped = rendering === 'svg-clipped-blob'
        const legacyXlink = rendering === 'svg-xlink-data'
        return <div className="tree-photo-diagnostic-sample" key={rendering}>
          <strong>{sampleLabel(rendering)}</strong>
          <div className="tree-photo-diagnostic-preview">
            {usesHtml
            ? <img data-photo-rendering={rendering} src={sampleSource ?? undefined} alt="" />
              : <svg viewBox="0 0 68 68" role="img" aria-label={sampleLabel(rendering)}>
                <image data-photo-rendering={rendering} x="12" y="12" width="44" height="44"
                href={legacyXlink ? undefined : sampleSource ?? undefined}
                xlinkHref={legacyXlink ? sampleSource ?? undefined : undefined}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={clipped ? 'inset(0 round 22px)' : undefined} />
              </svg>}
          </div>
          <small role="status">{statusLabel(currentPhoto.statuses[rendering])}</small>
        </div>
      })}
    </div>
  </section>
}
