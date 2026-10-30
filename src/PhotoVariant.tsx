import { useEffect, useRef, useState, type RefObject } from 'react'
import { LoaderCircle } from 'lucide-react'
import imageConfig from '../image-config.json'
import { getImageVariant, imageDataUrlToBlob } from './imageVariants'

interface PhotoProps {
  personId: string
  source: string
  passphrase: string
  onError: (message: string) => void
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
  { personId, source, passphrase, onError }: PhotoProps,
  size: number,
  priority: number,
  elementRef: RefObject<Element | null>,
  lazy: boolean,
  loadWhenVisible: boolean,
): { url: string | null; loading: boolean } {
  const identity = JSON.stringify([personId, source, passphrase, size, priority, lazy])
  const [photo, setPhoto] = useState<PhotoState>({ identity: '', url: null, loading: false })
  const [cacheRevision, setCacheRevision] = useState(0)
  const errorHandler = useRef(onError)
  const startedIdentity = useRef<string | null>(null)
  const loadHandler = useRef<(() => void) | null>(null)

  useEffect(() => {
    errorHandler.current = onError
  }, [onError])

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    let observer: IntersectionObserver | null = null
    if (startedIdentity.current !== identity) startedIdentity.current = null
    const clearActiveUrl = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = null
      startedIdentity.current = null
      setPhoto({ identity, url: null, loading: false })
      setCacheRevision((revision) => revision + 1)
    }
    window.addEventListener('image-cache-cleared', clearActiveUrl)
    const load = () => {
      if (startedIdentity.current === identity) return
      startedIdentity.current = identity
      observer?.disconnect()
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
    const root = element?.closest('.tree-stage') ?? null
    loadHandler.current = load
    if (!lazy || !element || typeof IntersectionObserver === 'undefined') {
      load()
    } else {
      if (isVisibleWithinRoot(element, root)) {
        load()
      } else {
        observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect()
            load()
          }
        }, { root })
        observer.observe(element)
      }
    }
    return () => {
      active = false
      loadHandler.current = null
      observer?.disconnect()
      window.removeEventListener('image-cache-cleared', clearActiveUrl)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [personId, source, passphrase, size, priority, elementRef, lazy, identity, cacheRevision])

  useEffect(() => {
    if (loadWhenVisible) loadHandler.current?.()
  }, [loadWhenVisible])

  return photo.identity === identity
    ? { url: photo.url, loading: photo.loading }
    : { url: null, loading: false }
}

export function TreePhoto({
  personId, source, passphrase, onError, loadWhenVisible = false,
}: PhotoProps & { loadWhenVisible?: boolean }) {
  const elementRef = useRef<SVGImageElement>(null)
  const { url, loading } = usePhotoUrl(
    { personId, source, passphrase, onError },
    imageConfig.variants.tree, 1, elementRef, true, loadWhenVisible,
  )
  return <g>
    <image ref={elementRef} href={url ?? undefined} x="12" y="12" width="44" height="44"
      preserveAspectRatio="xMidYMid slice" clipPath="inset(0 round 22px)" />
    {loading && <circle className="tree-photo-spinner" cx="34" cy="34" r="7" fill="none"
      stroke="currentColor" strokeWidth="2" strokeDasharray="30 14" strokeLinecap="round" aria-hidden="true" />}
  </g>
}

export function ProfilePhoto({ personId, source, passphrase, onError }: PhotoProps) {
  const elementRef = useRef<HTMLImageElement>(null)
  const { url, loading } = usePhotoUrl({ personId, source, passphrase, onError },
    imageConfig.variants.profile, 0, elementRef, false, true)
  return <>
    {loading && <span className="profile-photo-spinner" aria-hidden="true"><LoaderCircle size={18} /></span>}
    <img ref={elementRef} src={url ?? undefined} alt="" />
  </>
}
