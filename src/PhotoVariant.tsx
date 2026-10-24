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

function usePhotoUrl(
  { personId, source, passphrase, onError }: PhotoProps,
  size: number,
  priority: number,
  elementRef: RefObject<Element | null>,
  lazy: boolean,
): { url: string | null; loading: boolean } {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const errorHandler = useRef(onError)
  errorHandler.current = onError

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    setUrl(null)
    setLoading(false)
    const clearActiveUrl = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = null
      setUrl(null)
      setLoading(false)
    }
    window.addEventListener('image-cache-cleared', clearActiveUrl)
    const load = () => {
      setLoading(true)
      void getImageVariant(personId, source, size, passphrase, priority).then((dataUrl) => {
        if (!active) return
        objectUrl = URL.createObjectURL(imageDataUrlToBlob(dataUrl))
        setUrl(objectUrl)
        setLoading(false)
      }).catch((error: unknown) => {
        if (active) {
          setLoading(false)
          errorHandler.current(error instanceof Error ? error.message : 'Impossibile elaborare la fotografia.')
        }
      })
    }

    const element = elementRef.current
    if (!lazy || !element || typeof IntersectionObserver === 'undefined') {
      load()
    } else {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          load()
        }
      })
      observer.observe(element)
      return () => {
        active = false
        observer.disconnect()
        window.removeEventListener('image-cache-cleared', clearActiveUrl)
        if (objectUrl) URL.revokeObjectURL(objectUrl)
      }
    }
    return () => {
      active = false
      window.removeEventListener('image-cache-cleared', clearActiveUrl)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [personId, source, passphrase, size, priority, elementRef, lazy])

  return { url, loading }
}

export function TreePhoto({ personId, source, passphrase, onError }: PhotoProps) {
  const elementRef = useRef<SVGImageElement>(null)
  const { url, loading } = usePhotoUrl({ personId, source, passphrase, onError },
    imageConfig.variants.tree, 1, elementRef, true)
  return <g>
    <image ref={elementRef} href={url ?? undefined} x="12" y="12" width="44" height="44"
      preserveAspectRatio="xMidYMid slice" clipPath="inset(0 round 22px)" />
    {loading && <LoaderCircle className="tree-photo-spinner" x="26" y="26" size={16} aria-hidden="true" />}
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
