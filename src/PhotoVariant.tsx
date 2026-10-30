import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import imageConfig from '../image-config.json'
import { decryptImageDataUrl, isEncryptedImage } from './crypto'
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

function usePhotoUrl(
  { personId, source, passphrase, onError }: PhotoProps,
  size: number,
  priority: number,
  autoLoad: boolean,
  loadWhenVisible: boolean,
): { url: string | null; loading: boolean } {
  const identity = JSON.stringify([personId, source, passphrase, size, priority])
  const [photo, setPhoto] = useState<PhotoState>({ identity: '', url: null, loading: false })
  const [cacheRevision, setCacheRevision] = useState(0)
  const errorHandler = useRef(onError)
  const loadHandler = useRef<(() => void) | null>(null)
  const loadWhenVisibleRef = useRef(loadWhenVisible)

  useEffect(() => {
    errorHandler.current = onError
  }, [onError])

  useEffect(() => {
    let active = true
    let started = false
    let objectUrl: string | null = null
    const clearActiveUrl = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = null
      started = false
      setPhoto({ identity, url: null, loading: false })
      setCacheRevision((revision) => revision + 1)
    }
    window.addEventListener('image-cache-cleared', clearActiveUrl)
    const load = () => {
      if (started) return
      started = true
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

    loadHandler.current = load
    if (autoLoad || loadWhenVisibleRef.current) load()
    return () => {
      active = false
      loadHandler.current = null
      window.removeEventListener('image-cache-cleared', clearActiveUrl)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [personId, source, passphrase, size, priority, identity, cacheRevision, autoLoad])

  useEffect(() => {
    loadWhenVisibleRef.current = loadWhenVisible
    if (loadWhenVisible) loadHandler.current?.()
  }, [loadWhenVisible])

  return photo.identity === identity
    ? { url: photo.url, loading: photo.loading }
    : { url: null, loading: false }
}

export function TreePhoto({
  personId, source, passphrase, onError, loadWhenVisible = false,
}: PhotoProps & { loadWhenVisible?: boolean }) {
  const { url, loading } = usePhotoUrl(
    { personId, source, passphrase, onError },
    imageConfig.variants.tree, 1, false, loadWhenVisible,
  )
  return <g>
    <image href={url ?? undefined} x="12" y="12" width="44" height="44"
      preserveAspectRatio="xMidYMid slice" clipPath="inset(0 round 22px)" />
    {loading && <circle className="tree-photo-spinner" cx="34" cy="34" r="7" fill="none"
      stroke="currentColor" strokeWidth="2" strokeDasharray="30 14" strokeLinecap="round" aria-hidden="true" />}
  </g>
}

export function ProfilePhoto({ personId, source, passphrase, onError, alt = '' }: PhotoProps & { alt?: string }) {
  const { url, loading } = usePhotoUrl({ personId, source, passphrase, onError },
    imageConfig.variants.profile, 0, true, false)
  return <>
    {loading && <span className="profile-photo-spinner" aria-hidden="true"><LoaderCircle size={18} /></span>}
    <img src={url ?? undefined} alt={alt} />
  </>
}

export function OriginalProfilePhoto({ personId, source, passphrase, onError, alt = '' }: PhotoProps & { alt?: string }) {
  const identity = JSON.stringify([personId, source, passphrase])
  const [photo, setPhoto] = useState<PhotoState>({ identity: '', url: null, loading: false })
  const errorHandler = useRef(onError)

  useEffect(() => {
    errorHandler.current = onError
  }, [onError])

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null

    const load = async () => {
      await Promise.resolve()
      if (!active) return
      setPhoto({ identity, url: null, loading: true })
      try {
        const original = isEncryptedImage(source)
          ? await decryptImageDataUrl(source, passphrase)
          : source
        if (!active) return
        objectUrl = URL.createObjectURL(imageDataUrlToBlob(original))
        setPhoto({ identity, url: objectUrl, loading: false })
      } catch (error) {
        if (!active) return
        setPhoto({ identity, url: null, loading: false })
        errorHandler.current(error instanceof Error ? error.message : 'Impossibile elaborare la fotografia.')
      }
    }

    void load()
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [identity, passphrase, personId, source])

  const visiblePhoto = photo.identity === identity ? photo : { url: null, loading: false }
  return <>
    {visiblePhoto.loading && <span className="profile-photo-spinner" aria-hidden="true"><LoaderCircle size={18} /></span>}
    <img src={visiblePhoto.url ?? undefined} alt={alt} />
  </>
}
