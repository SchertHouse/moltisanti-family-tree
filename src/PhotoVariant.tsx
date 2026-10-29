import { useEffect, useRef, useState, type RefObject } from 'react'
import { LoaderCircle } from 'lucide-react'
import imageConfig from '../image-config.json'
import { getImageVariant, imageDataUrlToBlob } from './imageVariants'

export type PhotoLoadStatus = 'waiting' | 'loading' | 'loaded' | 'failed'

interface PhotoProps {
  personId: string
  source: string
  passphrase: string
  onError: (message: string) => void
  onLoadStart?: () => void
  onImageLoad?: () => void
  onImageError?: () => void
}

interface PhotoState {
  identity: string
  url: string | null
  loading: boolean
}

function isVisibleWithinRoot(element: Element, root: Element | null): boolean {
  const target = element.getBoundingClientRect()
  const bounds = root?.getBoundingClientRect()
  const left = bounds?.left ?? 0
  const top = bounds?.top ?? 0
  const right = bounds?.right ?? window.innerWidth
  const bottom = bounds?.bottom ?? window.innerHeight

  return target.width > 0 && target.height > 0
    && target.right > left && target.left < right
    && target.bottom > top && target.top < bottom
}

function usePhotoUrl(
  { personId, source, passphrase, onError, onLoadStart }: PhotoProps,
  size: number,
  priority: number,
  elementRef: RefObject<Element | null>,
  lazy: boolean,
): { url: string | null; loading: boolean } {
  const identity = JSON.stringify([personId, source, passphrase, size, priority, lazy])
  const [photo, setPhoto] = useState<PhotoState>({ identity: '', url: null, loading: false })
  const [cacheRevision, setCacheRevision] = useState(0)
  const errorHandler = useRef(onError)
  const loadStartHandler = useRef(onLoadStart)

  useEffect(() => {
    errorHandler.current = onError
    loadStartHandler.current = onLoadStart
  }, [onError, onLoadStart])

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    const clearActiveUrl = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = null
      setPhoto({ identity, url: null, loading: false })
      setCacheRevision((revision) => revision + 1)
    }
    window.addEventListener('image-cache-cleared', clearActiveUrl)
    const load = () => {
      loadStartHandler.current?.()
      setPhoto({ identity, url: null, loading: true })
      void getImageVariant(personId, source, size, passphrase, priority).then((dataUrl) => {
        if (!active) return
        objectUrl = URL.createObjectURL(imageDataUrlToBlob(dataUrl))
        setPhoto({ identity, url: objectUrl, loading: false })
      }).catch((error: unknown) => {
        if (active) {
          setPhoto({ identity, url: null, loading: false })
          errorHandler.current(error instanceof Error ? error.message : 'Impossibile elaborare la fotografia.')
        }
      })
    }

    const element = elementRef.current
    if (!lazy || !element || typeof IntersectionObserver === 'undefined') {
      load()
    } else {
      const root = element.closest('.tree-stage')
      if (isVisibleWithinRoot(element, root)) {
        load()
      } else {
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect()
            load()
          }
        }, { root })
        observer.observe(element)
        return () => {
          active = false
          observer.disconnect()
          window.removeEventListener('image-cache-cleared', clearActiveUrl)
          if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
      }
    }
    return () => {
      active = false
      window.removeEventListener('image-cache-cleared', clearActiveUrl)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [personId, source, passphrase, size, priority, elementRef, lazy, identity, cacheRevision])

  return photo.identity === identity
    ? { url: photo.url, loading: photo.loading }
    : { url: null, loading: false }
}

export function TreePhoto({
  personId, source, passphrase, onError, onLoadStart, onImageLoad, onImageError, loadImmediately = false,
}: PhotoProps & { loadImmediately?: boolean }) {
  const elementRef = useRef<SVGImageElement>(null)
  const { url, loading } = usePhotoUrl(
    { personId, source, passphrase, onError, onLoadStart },
    imageConfig.variants.tree, 1, elementRef, !loadImmediately,
  )
  return <g>
    <image ref={elementRef} href={url ?? undefined} x="12" y="12" width="44" height="44"
      preserveAspectRatio="xMidYMid slice" clipPath="inset(0 round 22px)"
      onLoad={onImageLoad} onError={onImageError} />
    {loading && <circle className="tree-photo-spinner" cx="34" cy="34" r="7" fill="none"
      stroke="currentColor" strokeWidth="2" strokeDasharray="30 14" strokeLinecap="round" aria-hidden="true" />}
  </g>
}

export function ProfilePhoto({ personId, source, passphrase, onError }: PhotoProps) {
  const elementRef = useRef<HTMLImageElement>(null)
  const { url, loading } = usePhotoUrl({ personId, source, passphrase, onError },
    imageConfig.variants.profile, 0, elementRef, false)
  return <>
    {loading && <span className="profile-photo-spinner" aria-hidden="true"><LoaderCircle size={18} /></span>}
    <img ref={elementRef} src={url ?? undefined} alt="" />
  </>
}
