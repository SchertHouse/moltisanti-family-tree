import { useEffect, useId, useState } from 'react'
import imageConfig from '../image-config.json'
import { translate, type Language, type TranslationKey } from './i18n'
import { getImageVariant, imageDataUrlToBlob } from './imageVariants'

interface TreePhotoDiagnosticProps {
  personId: string
  source: string
  passphrase: string
  language: Language
}

type Rendering = 'html' | 'svg' | 'svg-clipped'
type RenderingStatus = 'loading' | 'loaded' | 'failed'
type RenderingStatuses = Record<Rendering, RenderingStatus>

interface DiagnosticPhotoState {
  identity: string
  url: string | null
  error: boolean
  statuses: RenderingStatuses
}

const renderings: Rendering[] = ['html', 'svg', 'svg-clipped']
const loadingStatuses: RenderingStatuses = {
  html: 'loading',
  svg: 'loading',
  'svg-clipped': 'loading',
}

export default function TreePhotoDiagnostic({
  personId, source, passphrase, language,
}: TreePhotoDiagnosticProps) {
  const identity = JSON.stringify([personId, source, passphrase])
  const [photo, setPhoto] = useState<DiagnosticPhotoState>({
    identity: '',
    url: null,
    error: false,
    statuses: loadingStatuses,
  })
  const currentPhoto = photo.identity === identity
    ? photo
    : { identity, url: null, error: false, statuses: loadingStatuses }
  const titleId = `tree-photo-diagnostic-${useId().replaceAll(':', '')}`
  const t = (key: TranslationKey) => translate(language, key)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    void getImageVariant(personId, source, imageConfig.variants.tree, passphrase, 1)
      .then((dataUrl) => {
        if (!active) return
        objectUrl = URL.createObjectURL(imageDataUrlToBlob(dataUrl))
        setPhoto({ identity, url: objectUrl, error: false, statuses: loadingStatuses })
      })
      .catch(() => {
        if (active) setPhoto({
          identity, url: null, error: true,
          statuses: { html: 'failed', svg: 'failed', 'svg-clipped': 'failed' },
        })
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [identity, personId, source, passphrase])

  const setStatus = (rendering: Rendering, status: RenderingStatus) => {
    setPhoto((current) => current.identity === identity
      ? { ...current, statuses: { ...current.statuses, [rendering]: status } }
      : current)
  }
  const statusLabel = (status: RenderingStatus) => t(
    status === 'loading' ? 'photoTestLoading' : status === 'loaded' ? 'photoTestLoaded' : 'photoTestFailed',
  )

  return <section className="tree-photo-diagnostic" aria-labelledby={`${titleId}-title`}>
    <h3 id={`${titleId}-title`}>{t('photoTestTitle')}</h3>
    <p>{t('photoTestHint')}</p>
    {currentPhoto.error
      ? <p role="status">{t('photoTestLoadFailure')}</p>
      : <div className="tree-photo-diagnostic-samples">
        {renderings.map((rendering) => <div className="tree-photo-diagnostic-sample" key={rendering}>
          <strong>{t(rendering === 'html' ? 'photoTestHtml'
            : rendering === 'svg' ? 'photoTestSvg' : 'photoTestSvgClip')}</strong>
          <div className="tree-photo-diagnostic-preview">
            {rendering === 'html'
              ? <img src={currentPhoto.url ?? undefined} alt="" onLoad={() => setStatus(rendering, 'loaded')}
                onError={() => setStatus(rendering, 'failed')} />
              : <svg viewBox="0 0 68 68" role="img" aria-label={t(
                rendering === 'svg' ? 'photoTestSvg' : 'photoTestSvgClip',
              )}>
                <image x="12" y="12" width="44" height="44" href={currentPhoto.url ?? undefined}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={rendering === 'svg-clipped' ? 'inset(0 round 22px)' : undefined}
                  onLoad={() => setStatus(rendering, 'loaded')}
                  onError={() => setStatus(rendering, 'failed')} />
              </svg>}
          </div>
          <small role="status">{statusLabel(currentPhoto.statuses[rendering])}</small>
        </div>)}
      </div>}
  </section>
}
