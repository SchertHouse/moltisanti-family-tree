import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import {
  BookOpen, Check, ChevronDown, CircleHelp, Download, FileLock2, Heart, KeyRound, LoaderCircle,
  Languages, LockKeyhole, Mail, Maximize, Maximize2, Minimize, Minus, MousePointer2, Pencil, Plus,
  Search, ShieldCheck, Sparkles, Trash2, Upload, UserRoundPlus, Users, X,
} from 'lucide-react'
import {
  decryptArchive, decryptArchivePhotos, encryptPreparedArchive, isEncryptedImage,
  type EncryptedArchive, prepareArchivePhotos,
} from './crypto'
import { publishEncryptedArchive } from './github'
import ImageCropDialog from './ImageCropDialog'
import imageConfig from '../image-config.json'
import { clearImageCache } from './imageVariants'
import { ProfilePhoto, TreePhoto } from './PhotoVariant'
import { clearRememberedPassphrase, getRememberedPassphrase, saveRememberedPassphrase } from './rememberedKey'
import { browserLanguage, translate, type Language } from './i18n'
import {
  dateInputPattern, finalizeDateDraft, formatCalendarDate, formatDate, formatDateDraft, formatDateInput, parseDateInput,
} from './dateInput'
import { createGedzip } from './gedzip'
import { findKinshipPath } from './kinship'
import {
  birthdayInfo, emptyArchive, generationMap, isSexAtBirth, relationTo, treePositions, validateArchive,
  uniquePeople, type FamilyArchive, type Person, type Relationship, type RelationshipType,
} from './model'

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'moltisantitree'
const archivePath = 'public/family-archive.enc.json'
const photoTypes = imageConfig.input.mimeTypes

type Modal = 'admin' | 'key' | 'person' | 'relationship' | 'publish' | 'import-review' | null
type View = { x: number; y: number; scale: number }
type BusyAction = 'saving' | 'publishing' | 'exporting-json' | 'exporting-gedzip' | 'opening' | 'importing' | null

function App() {
  const [language, setLanguage] = useState<Language>(browserLanguage)
  const languageRef = useRef(language)
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(language, key, values)
  const [archive, setArchive] = useState<FamilyArchive>(emptyArchive)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [kinshipPersonId, setKinshipPersonId] = useState('')
  const [admin, setAdmin] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [rememberPassphrase, setRememberPassphrase] = useState(false)
  const [rememberedKeyAvailable, setRememberedKeyAvailable] = useState(false)
  const [modal, setModal] = useState<Modal>(null)
  const [keyPurpose, setKeyPurpose] = useState<'open' | 'save'>('save')
  const [replaceKey, setReplaceKey] = useState(false)
  const [publishNewKey, setPublishNewKey] = useState(false)
  const [pendingEnvelope, setPendingEnvelope] = useState<unknown>(null)
  const [pendingArchive, setPendingArchive] = useState<FamilyArchive | null>(null)
  const [pendingPassphrase, setPendingPassphrase] = useState('')
  const [editing, setEditing] = useState<Person | null>(null)
  const [relationshipPersonId, setRelationshipPersonId] = useState('')
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [croppedPhoto, setCroppedPhoto] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [generation, setGeneration] = useState('all')
  const [notice, setNoticeText] = useState('')
  const [noticeVersion, setNoticeVersion] = useState(0)
  const [noticeFading, setNoticeFading] = useState(false)
  const setNotice = (message: string) => {
    setNoticeText(message)
    setNoticeVersion((version) => version + 1)
    setNoticeFading(false)
  }
  const [clearingImageCache, setClearingImageCache] = useState(false)
  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const [loadingPublishedArchive, setLoadingPublishedArchive] = useState(true)
  const cacheFallbackNotified = useRef(false)
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 })
  const [keyboardFocusedId, setKeyboardFocusedId] = useState<string | null>(null)
  const canvasRef = useRef<SVGSVGElement>(null)
  const personNodeRefs = useRef(new Map<string, SVGGElement>())
  const keyboardNavigationMode = useRef(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const treeAreaRef = useRef<HTMLDivElement>(null)
  const [treeFullscreen, setTreeFullscreen] = useState(false)
  const drag = useRef<{ x: number; y: number; viewX: number; viewY: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; scale: number; worldX: number; worldY: number } | null>(null)
  const previousSelectedId = useRef(selectedId)
  const suppressClick = useRef(false)
  const manualDateFields = useRef(new WeakSet<HTMLInputElement>())

  useEffect(() => {
    const markKeyboardNavigation = () => { keyboardNavigationMode.current = true }
    const markPointerNavigation = () => {
      keyboardNavigationMode.current = false
      setKeyboardFocusedId(null)
    }
    window.addEventListener('keydown', markKeyboardNavigation)
    window.addEventListener('pointerdown', markPointerNavigation)
    return () => {
      window.removeEventListener('keydown', markKeyboardNavigation)
      window.removeEventListener('pointerdown', markPointerNavigation)
    }
  }, [])

  useEffect(() => {
    const notifyFallback = () => {
      if (cacheFallbackNotified.current) return
      cacheFallbackNotified.current = true
      setNotice(translate(language, 'imageCacheMemoryOnly'))
    }
    window.addEventListener('image-cache-fallback', notifyFallback)
    return () => window.removeEventListener('image-cache-fallback', notifyFallback)
  }, [language])
  useEffect(() => {
    if (!notice) return
    const fadeTimer = window.setTimeout(() => setNoticeFading(true), 10_000)
    const dismissTimer = window.setTimeout(() => setNoticeText(''), 10_500)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(dismissTimer)
    }
  }, [notice, noticeVersion])
  useEffect(() => {
    languageRef.current = language
  }, [language])

  const selected = archive.people.find((person) => person.id === selectedId) ?? null
  const kinshipPerson = archive.people.find((person) => person.id === kinshipPersonId && person.id !== selectedId)
  const kinshipPath = selected && kinshipPerson
    ? findKinshipPath(archive, selected.id, kinshipPerson.id)
    : null
  const upcomingBirthday = selected?.birthDate && !selected.deathDate ? birthdayInfo(selected.birthDate) : null
  const generations = useMemo(() => generationMap(archive), [archive])
  const positions = useMemo(() => treePositions(archive), [archive])
  const filtered = archive.people.filter((person) => {
    const searchMatch = `${person.firstName} ${person.lastName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    return searchMatch && (generation === 'all' || String(generations.get(person.id) ?? 0) === generation)
  })
  const relatedIds = new Set(selected ? archive.relationships
    .filter((relationship) => relationship.from === selected.id || relationship.to === selected.id)
    .flatMap((relationship) => [relationship.from, relationship.to]) : [])
  const familyConnectors = useMemo(() => {
    const families = new Map<string, { parentIds: string[]; childIds: string[] }>()
    const parentsByChild = new Map<string, string[]>()
    for (const relationship of archive.relationships) {
      if (relationship.type !== 'parent-child') continue
      parentsByChild.set(relationship.to, [...new Set([...(parentsByChild.get(relationship.to) ?? []), relationship.from])])
    }
    for (const [childId, unsortedParentIds] of parentsByChild) {
      const parentIds = [...unsortedParentIds].sort()
      const key = JSON.stringify(parentIds)
      const family = families.get(key) ?? { parentIds, childIds: [] }
      family.childIds.push(childId)
      families.set(key, family)
    }
    return [...families.entries()].map(([key, family]) => ({
      key,
      parentIds: family.parentIds,
      childIds: [...new Set(family.childIds)].sort(),
    }))
  }, [archive])

  const relationshipEntries = (personId: string, type: RelationshipType, direction?: 'in' | 'out') => archive.relationships
    .filter((relationship) => relationship.type === type &&
      (direction === 'in' ? relationship.to === personId : direction === 'out'
        ? relationship.from === personId
        : relationship.from === personId || relationship.to === personId))
    .flatMap((relationship) => {
      const person = archive.people.find((candidate) =>
        candidate.id === (relationship.from === personId ? relationship.to : relationship.from))
      return person ? [{ person, relationship }] : []
    })
  const relationships = (personId: string, type: RelationshipType, direction?: 'in' | 'out') =>
    relationshipEntries(personId, type, direction).map(({ person }) => person)

  const selectPlainArchive = async (file: File | undefined, input: HTMLInputElement) => {
    if (!file) return
    setBusyAction('importing')
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error(t('archiveTooLarge'))
      const parsed: unknown = JSON.parse(await file.text())
      validateArchive(parsed)
      setPendingArchive(parsed)
      setPendingPassphrase('')
      setModal('import-review')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('invalidArchiveFile'))
    } finally {
      input.value = ''
      setBusyAction(null)
    }
  }
  const choosePhoto = (file: File | undefined, input: HTMLInputElement) => {
    if (!file) return
    input.value = ''
    if (file.size > imageConfig.input.maxFileBytes || !photoTypes.includes(file.type)) {
      setNotice(t('invalidPhoto', { size: imageConfig.input.maxFileBytes / 1024 / 1024 }))
      return
    }
    setCroppedPhoto(null)
    setCropFile(file)
  }
  const exportPlainArchive = async () => {
    if (!window.confirm(t('plainExportWarning'))) return
    setBusyAction('exporting-json')
    try {
      const hasEncryptedPhotos = archive.people.some((person) =>
        [person.photo, ...(person.gallery ?? [])].some((image) => image && isEncryptedImage(image)))
      if (hasEncryptedPhotos && !passphrase) throw new Error(t('passphraseRequired'))
      const plaintext = await decryptArchivePhotos(archive, passphrase)
      download(JSON.stringify(plaintext, null, 2), 'family-archive.json')
      setNotice(t('plainExported'))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('exportFailure'))
    } finally {
      setBusyAction(null)
    }
  }
  const exportGedcomArchive = async () => {
    if (!window.confirm(t('gedcomExportWarning'))) return
    setBusyAction('exporting-gedzip')
    try {
      const hasEncryptedPhotos = archive.people.some((person) =>
        [person.photo, ...(person.gallery ?? [])].some((image) => image && isEncryptedImage(image)))
      if (hasEncryptedPhotos && !passphrase) throw new Error(t('passphraseRequired'))
      const packageBytes = await createGedzip(archive, passphrase)
      downloadBlob(new Blob([packageBytes], { type: 'application/zip' }), 'family-tree.gdz')
      setNotice(t('gedcomExported'))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('exportFailure'))
    } finally {
      setBusyAction(null)
    }
  }

  const centerTree = (data: FamilyArchive) => {
    window.setTimeout(() => {
      const box = canvasRef.current?.getBoundingClientRect()
      const points = [...treePositions(data).values()]
      if (!box || points.length === 0) return
      const minX = Math.min(...points.map(({ x }) => x))
      const maxX = Math.max(...points.map(({ x }) => x))
      const minY = Math.min(...points.map(({ y }) => y))
      const maxY = Math.max(...points.map(({ y }) => y))
      setView((current) => ({
        ...current,
        x: box.width / 2 - ((minX + maxX) / 2) * current.scale,
        y: box.height / 2 - ((minY + maxY) / 2) * current.scale,
      }))
    }, 0)
  }

  const resetView = () => {
    setView({ x: 0, y: 0, scale: 1 })
    centerTree(archive)
  }

  useEffect(() => {
    const deselectedPerson = previousSelectedId.current !== null && selectedId === null
    previousSelectedId.current = selectedId
    if (deselectedPerson) return

    const center = () => {
      const box = canvasRef.current?.getBoundingClientRect()
      const points = [...positions.values()]
      if (!box || points.length === 0) return
      const selectedPoint = selectedId ? positions.get(selectedId) : undefined
      const minX = selectedPoint?.x ?? Math.min(...points.map(({ x }) => x))
      const maxX = selectedPoint?.x ?? Math.max(...points.map(({ x }) => x))
      const minY = selectedPoint?.y ?? Math.min(...points.map(({ y }) => y))
      const maxY = selectedPoint?.y ?? Math.max(...points.map(({ y }) => y))
      setView((current) => ({
        ...current,
        x: box.width / 2 - ((minX + maxX) / 2) * current.scale,
        y: box.height / 2 - ((minY + maxY) / 2) * current.scale,
      }))
    }
    const updateFullscreen = () => {
      setTreeFullscreen(document.fullscreenElement === treeAreaRef.current)
      center()
    }
    center()
    window.addEventListener('resize', center)
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => {
      window.removeEventListener('resize', center)
      document.removeEventListener('fullscreenchange', updateFullscreen)
    }
  }, [positions, selectedId])

  const toggleTreeFullscreen = async () => {
    const treeArea = treeAreaRef.current
    if (!treeArea) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (typeof treeArea.requestFullscreen === 'function') {
        await treeArea.requestFullscreen()
      } else {
        setNotice(t('fullscreenUnavailable'))
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('fullscreenFailure'))
    }
  }

  const selectPerson = (id: string) => {
    setSelectedId(id)
  }

  const editSelected = () => {
    if (!selected) return
    setEditing(selected)
    setCroppedPhoto(null)
    setModal('person')
  }

  const editPerson = (person: Person) => {
    setSelectedId(person.id)
    setEditing(person)
    setCroppedPhoto(null)
    setModal('person')
  }

  const handleWheel = useCallback((event: globalThis.WheelEvent) => {
    event.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const factor = event.deltaY < 0 ? 1.1 : 0.9
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    setView((current) => {
      const scale = Math.max(0.4, Math.min(2.2, current.scale * factor))
      return {
        x: px - (px - current.x) * (scale / current.scale),
        y: py - (py - current.y) * (scale / current.scale),
        scale,
      }
    })
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || archive.people.length === 0) return
    stage.addEventListener('wheel', handleWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleWheel)
  }, [archive.people.length, handleWheel])

  const startDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    if (event.pointerType !== 'touch') event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    pointers.current.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top })
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()]
      const centerX = (first!.x + second!.x) / 2
      const centerY = (first!.y + second!.y) / 2
      pinch.current = {
        distance: Math.hypot(first!.x - second!.x, first!.y - second!.y),
        scale: view.scale,
        worldX: (centerX - view.x) / view.scale,
        worldY: (centerY - view.y) / view.scale,
      }
      drag.current = null
      return
    }
    drag.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y }
  }
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(event.pointerId)) {
      const rect = event.currentTarget.getBoundingClientRect()
      pointers.current.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    if (pointers.current.size >= 2 && pinch.current) {
      const [first, second] = [...pointers.current.values()]
      const centerX = (first!.x + second!.x) / 2
      const centerY = (first!.y + second!.y) / 2
      const distance = Math.hypot(first!.x - second!.x, first!.y - second!.y)
      const scale = Math.max(0.4, Math.min(2.2, pinch.current.scale * distance / pinch.current.distance))
      setView({ x: centerX - pinch.current.worldX * scale, y: centerY - pinch.current.worldY * scale, scale })
      return
    }
    const currentDrag = drag.current
    if (!currentDrag) return
    if (Math.hypot(event.clientX - currentDrag.x, event.clientY - currentDrag.y) <= 4) return
    suppressClick.current = true
    setView((current) => ({
      ...current,
      x: currentDrag.viewX + event.clientX - currentDrag.x,
      y: currentDrag.viewY + event.clientY - currentDrag.y,
    }))
  }
  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId)
    pinch.current = null
    drag.current = null
    if (pointers.current.size === 1) {
      const [point] = [...pointers.current.values()]
      const rect = event.currentTarget.getBoundingClientRect()
      if (point) drag.current = { x: point.x + rect.left, y: point.y + rect.top, viewX: view.x, viewY: view.y }
    }
    window.setTimeout(() => { suppressClick.current = false }, 250)
  }

  const enterAdmin = () => {
    if (window.confirm(t('enterAdmin'))) setModal('admin')
  }
  const authenticateAdmin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (data.get('password') === ADMIN_PASSWORD) {
      setAdmin(true)
      setModal(null)
    } else setNotice(t('wrongPassword'))
  }
  const leaveAdmin = () => {
    setAdmin(false)
    setPassphrase('')
    setPendingPassphrase('')
    setPendingArchive(null)
    setModal(null)
  }

  const installArchive = (nextArchive: FamilyArchive, key?: string) => {
    setArchive(nextArchive)
    if (key) setPassphrase(key)
    setSelectedId(null)
    setPendingArchive(null)
    setPendingPassphrase('')
    setPendingEnvelope(null)
    setModal(null)
    setNotice('')
    centerTree(nextArchive)
  }

  useEffect(() => {
    const controller = new AbortController()
    const loadPublishedArchive = async () => {
      try {
        const archiveUrl = `${import.meta.env.BASE_URL}family-archive.enc.json?v=${Date.now()}`
        const response = await fetch(archiveUrl, { cache: 'no-store', signal: controller.signal })
        if (response.status === 404 || response.headers.get('content-type')?.includes('text/html')) return
        if (!response.ok) throw new Error(`Archivio pubblicato non disponibile (HTTP ${response.status}).`)
        const text = await response.text()
        if (text.length > 35 * 1024 * 1024) throw new Error('Archivio troppo grande per essere aperto nel browser.')
        const envelope = JSON.parse(text) as unknown
        if (controller.signal.aborted) return
        setPendingEnvelope(envelope)
        setKeyPurpose('open')

        try {
          const savedKey = await getRememberedPassphrase()
          if (savedKey) {
            setRememberedKeyAvailable(true)
            try {
              const result = await decryptArchive(envelope as EncryptedArchive, savedKey)
              if (controller.signal.aborted) return
              setPassphrase(savedKey)
              setRememberPassphrase(true)
              setArchive(result)
              setSelectedId(null)
              setPendingEnvelope(null)
              setPendingArchive(null)
              setPendingPassphrase('')
              setModal(null)
              setNotice('')
              window.setTimeout(() => {
                const box = canvasRef.current?.getBoundingClientRect()
                const points = [...treePositions(result).values()]
                if (!box || points.length === 0) return
                const minX = Math.min(...points.map(({ x }) => x))
                const maxX = Math.max(...points.map(({ x }) => x))
                const minY = Math.min(...points.map(({ y }) => y))
                const maxY = Math.max(...points.map(({ y }) => y))
                setView((current) => ({
                  ...current,
                  x: box.width / 2 - ((minX + maxX) / 2) * current.scale,
                  y: box.height / 2 - ((minY + maxY) / 2) * current.scale,
                }))
              }, 0)
              return
            } catch {
              try {
                await clearRememberedPassphrase()
                setRememberedKeyAvailable(false)
                setRememberPassphrase(false)
              } catch {
                setNotice(translate(languageRef.current, 'rememberedKeyUnavailable'))
              }
              setNotice(translate(languageRef.current, 'rememberedKeyFailed'))
            }
          }
        } catch {
          if (!controller.signal.aborted) setNotice(translate(languageRef.current, 'rememberedKeyUnavailable'))
        }
        if (!controller.signal.aborted) setModal('key')
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setNotice(error instanceof Error ? error.message : 'Impossibile caricare l’archivio pubblicato.')
      } finally {
        if (!controller.signal.aborted) setLoadingPublishedArchive(false)
      }
    }
    void loadPublishedArchive()
    return () => controller.abort()
  }, [])

  const cancelModal = () => {
    setModal(null)
    setPendingArchive(null)
    setPendingPassphrase('')
    setCroppedPhoto(null)
  }

  const formatDateField = (input: HTMLInputElement, finalize = false) => {
    const cursor = input.selectionStart ?? input.value.length
    const digitsBeforeCursor = input.value.slice(0, cursor).replace(/\D/g, '').length
    const manuallySeparated = manualDateFields.current.has(input)
    const formatted = manuallySeparated
      ? finalize
        ? input.value.replace(/-{2,}/g, '-').replace(/-$/, '')
        : input.value.replace(/-{2,}/g, '-')
      : finalize ? finalizeDateDraft(input.value, language) : formatDateDraft(input.value, language)
    if (formatted === input.value) return
    input.value = formatted
    let nextCursor = 0
    let digitsSeen = 0
    while (nextCursor < formatted.length && digitsSeen < digitsBeforeCursor) {
      if (/\d/.test(formatted[nextCursor]!)) digitsSeen += 1
      nextCursor += 1
    }
    if (digitsSeen === digitsBeforeCursor && formatted[nextCursor - 1] !== '-') {
      while (formatted[nextCursor] === '-') nextCursor += 1
    }
    input.setSelectionRange(nextCursor, nextCursor)
  }
  const handleDateKeyDown = (input: HTMLInputElement, key: string) => {
    if (key === '-') manualDateFields.current.add(input)
    else if (input.selectionStart === 0 && input.selectionEnd === input.value.length) {
      manualDateFields.current.delete(input)
    }
  }
  const handleDatePaste = (input: HTMLInputElement, text: string) => {
    if (text.includes('-')) manualDateFields.current.add(input)
  }
  const finishDateField = (input: HTMLInputElement) => {
    formatDateField(input, true)
    manualDateFields.current.delete(input)
  }

  const onAddPerson = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const sexAtBirth = data.get('sexAtBirth')
    const person: Person = {
      id: crypto.randomUUID(),
      firstName: String(data.get('firstName')).trim(),
      lastName: String(data.get('lastName')).trim(),
      ...(String(data.get('alternateName') ?? '').trim()
        ? { alternateName: String(data.get('alternateName')).trim() } : {}),
      ...(isSexAtBirth(sexAtBirth) ? { sexAtBirth } : {}),
      ...(parseDateInput(String(data.get('birthDate') ?? ''), language)
        ? { birthDate: parseDateInput(String(data.get('birthDate') ?? ''), language) } : {}),
      ...(parseDateInput(String(data.get('deathDate') ?? ''), language)
        ? { deathDate: parseDateInput(String(data.get('deathDate') ?? ''), language) } : {}),
      ...(data.get('birthPlace') ? { birthPlace: String(data.get('birthPlace')).trim() } : {}),
      ...(String(data.get('profession') ?? '').trim() ? { profession: String(data.get('profession')).trim() } : {}),
      ...(String(data.get('residence') ?? '').trim() ? { residence: String(data.get('residence')).trim() } : {}),
      ...(String(data.get('nationality') ?? '').trim() ? { nationality: String(data.get('nationality')).trim() } : {}),
      ...(data.get('biography') ? { biography: String(data.get('biography')).trim() } : {}),
      ...(data.get('email') ? { email: String(data.get('email')).trim() } : {}),
      ...(data.get('whatsapp') ? { whatsapp: String(data.get('whatsapp')).trim() } : {}),
      ...(data.get('notes') ? { notes: String(data.get('notes')).trim() } : {}),
    }
    if (!person.firstName || !person.lastName) {
      setNotice(t('nameRequired'))
      return
    }
    if (croppedPhoto) person.photo = croppedPhoto
    commitPerson(person)
  }
  const commitPerson = (person: Person) => {
    const next = { ...archive, people: [...archive.people, person] }
    try { validateArchive(next) } catch (error) {
      setNotice(error instanceof Error ? error.message : t('error'))
      return
    }
    setArchive(next)
    setSelectedId(person.id)
    setCroppedPhoto(null)
    window.setTimeout(() => {
      const point = treePositions(next).get(person.id)
      const box = canvasRef.current?.getBoundingClientRect()
      if (point && box) setView((current) => ({
        ...current,
        x: box.width / 2 - point.x * current.scale,
        y: box.height / 2 - point.y * current.scale,
      }))
    }, 0)
    setModal(null)
  }
  const onEditPerson = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    const data = new FormData(event.currentTarget)
    const sexAtBirth = data.get('sexAtBirth')
    const person: Person = {
      ...editing,
      firstName: String(data.get('firstName')).trim(),
      lastName: String(data.get('lastName')).trim(),
      alternateName: String(data.get('alternateName') || '').trim() || undefined,
      sexAtBirth: isSexAtBirth(sexAtBirth) ? sexAtBirth : undefined,
      birthDate: parseDateInput(String(data.get('birthDate') || ''), language),
      deathDate: parseDateInput(String(data.get('deathDate') || ''), language),
      birthPlace: String(data.get('birthPlace') || '') || undefined,
      profession: String(data.get('profession') || '').trim() || undefined,
      residence: String(data.get('residence') || '').trim() || undefined,
      nationality: String(data.get('nationality') || '').trim() || undefined,
      biography: String(data.get('biography') || '') || undefined,
      email: String(data.get('email') || '') || undefined,
      whatsapp: String(data.get('whatsapp') || '') || undefined,
      notes: String(data.get('notes') || '') || undefined,
    }
    if (data.get('removePhoto')) person.photo = undefined
    if (!person.firstName || !person.lastName) {
      setNotice(t('nameRequired'))
      return
    }
    if (croppedPhoto) person.photo = croppedPhoto
    saveEditedPerson(person)
  }
  const saveEditedPerson = (person: Person) => {
    const next = { ...archive, people: archive.people.map((item) => item.id === person.id ? person : item) }
    try { validateArchive(next) } catch (error) {
      setNotice(error instanceof Error ? error.message : t('error'))
      return
    }
    setArchive(next)
    setEditing(null)
    setCroppedPhoto(null)
    setModal(null)
  }
  const onAddRelationship = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const data = new FormData(event.currentTarget)
    const otherPersonId = String(data.get('person') ?? '')
    if (!otherPersonId) {
      setNotice(t('selectPersonRequired'))
      return
    }
    try {
      setArchive(relationTo(archive, selected.id, data.get('type') as RelationshipType, otherPersonId))
      setModal(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('error'))
    }
  }
  const removeRelationship = (relationship: Relationship) => {
    if (!window.confirm(t('removeRelationshipConfirm'))) return
    setArchive((current) => ({
      ...current,
      relationships: current.relationships.filter((item) => item.id !== relationship.id),
    }))
  }
  const removeSelected = () => {
    if (!selected || !window.confirm(t('removeConfirm'))) return
    setArchive({
      ...archive,
      people: archive.people.filter((person) => person.id !== selected.id),
      relationships: archive.relationships.filter((relationship) => relationship.from !== selected.id && relationship.to !== selected.id),
    })
    setSelectedId(null)
  }
  const beginKeyFlow = (purpose: 'open' | 'save') => {
    setKeyPurpose(purpose)
    setReplaceKey(false)
    setRememberPassphrase(purpose === 'save' && rememberedKeyAvailable)
    setModal('key')
  }
  const persistPassphraseChoice = async (key: string, shouldRemember: boolean): Promise<string | null> => {
    try {
      if (shouldRemember) {
        await saveRememberedPassphrase(key)
        setRememberedKeyAvailable(true)
      } else if (rememberedKeyAvailable) {
        await clearRememberedPassphrase()
        setRememberedKeyAvailable(false)
      }
      return null
    } catch (error) {
      return error instanceof Error ? error.message : t('rememberedKeyUnavailable')
    }
  }
  const forgetRememberedPassphrase = async () => {
    try {
      await clearRememberedPassphrase()
      setRememberedKeyAvailable(false)
      setRememberPassphrase(false)
      setNotice(t('rememberedKeyForgotten'))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('rememberedKeyUnavailable'))
    }
  }
  const applyPendingImport = async () => {
    if (!pendingArchive) return
    const storageWarning = await persistPassphraseChoice(pendingPassphrase, rememberPassphrase)
    installArchive(pendingArchive, pendingPassphrase || undefined)
    if (storageWarning) setNotice(storageWarning)
  }
  const selectArchiveFile = async (file: File | undefined, input: HTMLInputElement) => {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) {
      setNotice(t('archiveTooLarge'))
      input.value = ''
      return
    }
    setBusyAction('importing')
    try {
      setPendingEnvelope(JSON.parse(await file.text()) as unknown)
      setKeyPurpose('open')
      setModal('key')
    } catch {
      setNotice(t('invalidArchiveFile'))
    } finally {
      input.value = ''
      setBusyAction(null)
    }
  }
  const saveArchive = async (key: string) => {
    setBusyAction('saving')
    try {
      validateArchive(archive)
      const prepared = await prepareArchivePhotos(archive, key, passphrase || key)
      const encrypted = await encryptPreparedArchive(prepared, key)
      await decryptArchive(encrypted, key)
      const storageWarning = await persistPassphraseChoice(key, rememberPassphrase)
      const keyChanged = Boolean(passphrase && passphrase !== key)
      setArchive(prepared)
      setPassphrase(key)
      download(JSON.stringify(encrypted, null, 2), archivePath)
      setModal(null)
      setReplaceKey(false)
      setNotice(storageWarning ?? (keyChanged ? `${t('saved')} ${t('keyChangedNotice')}` : t('saved')))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('saveFailure'))
    } finally {
      setBusyAction(null)
    }
  }
  const clearPhotoCache = async () => {
    setClearingImageCache(true)
    try {
      const persistentCleared = await clearImageCache()
      setNotice(persistentCleared ? t('imageCacheCleared') : t('imageCacheMemoryOnly'))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('imageCacheClearFailure'))
    } finally {
      setClearingImageCache(false)
    }
  }
  const download = (content: string, filename: string, type = 'application/json') => {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const publishArchive = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const githubToken = String(data.get('token') || '')
    const key = publishNewKey ? String(data.get('publishPassphrase') || '') : passphrase
    if (!key) {
      setNotice(t('passphraseRequired'))
      return
    }
    if (publishNewKey && key.length < 12) {
      setNotice(t('passphraseGuidance'))
      return
    }
    if (publishNewKey && key !== data.get('publishPassphraseConfirmation')) {
      setNotice(t('passphraseMismatch'))
      return
    }
    setBusyAction('publishing')
    try {
      const prepared = await prepareArchivePhotos(archive, key, passphrase || key)
      const encrypted = await encryptPreparedArchive(prepared, key)
      await decryptArchive(encrypted, key)
      await publishEncryptedArchive({
        owner: String(data.get('owner')),
        repo: String(data.get('repo')),
        branch: String(data.get('branch')),
        path: String(data.get('path')),
        token: githubToken,
      }, JSON.stringify(encrypted))
      const storageWarning = await persistPassphraseChoice(key, rememberPassphrase)
      setArchive(prepared)
      setPassphrase(key)
      setNotice(storageWarning ?? (key !== passphrase
        ? `${t('published')} ${t('keyChangedNotice')}`
        : t('published')))
      setModal(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('publishFailure'))
    } finally {
      setBusyAction(null)
    }
  }
  const familyList = (title: string, entries: Array<{ person: Person; relationship?: Relationship }>) => entries.length > 0 && (
    <section className="family-list">
      <h3>{title}</h3>
      {entries.map(({ person, relationship }) => <div key={relationship?.id ?? person.id} className="family-person-row">
        <button className="relative-person" onClick={() => selectPerson(person.id)}>
          <span className="mini-avatar">{person.firstName.slice(0, 1)}{person.lastName.slice(0, 1)}</span>
          {person.firstName} {person.lastName}
        </button>
        {admin && relationship && <button className="remove-relationship icon-button"
          aria-label={t('removeRelationship', { name: `${person.firstName} ${person.lastName}` })}
          title={t('removeRelationship', { name: `${person.firstName} ${person.lastName}` })}
          onClick={() => removeRelationship(relationship)}><Trash2 size={15} /></button>}
      </div>)}
    </section>
  )

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label={t('brand')}>
          <span className="brand-mark"><Heart size={22} fill="currentColor" /></span>
          <span><strong>{t('brand')}</strong><small>{t('subtitle')}</small></span>
        </a>
        <div className="header-actions">
          <label className="language-select"><Languages size={16} aria-hidden="true" />
            <span className="sr-only">{t('language')}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t('language')}>
              <option value="it">Italiano</option><option value="en">English</option><option value="eo">Esperanto</option>
            </select><ChevronDown size={14} />
          </label>
          <button className="button button-quiet image-cache-clear" aria-label={t('clearImageCache')} title={t('clearImageCache')}
            disabled={clearingImageCache} onClick={() => {
            if (window.confirm(t('clearImageCacheConfirm'))) void clearPhotoCache()
          }}>{clearingImageCache ? <LoaderCircle className="button-spinner" size={15} /> : <Trash2 size={15} />}<span>{t('clearImageCache')}</span></button>
          {rememberedKeyAvailable && <button className="button button-quiet remembered-key-clear" aria-label={t('forgetRememberedKey')}
            title={t('forgetRememberedKey')} onClick={() => void forgetRememberedPassphrase()}>
            <KeyRound size={15} /><span>{t('forgetRememberedKey')}</span>
          </button>}
          {admin ? <button className="button button-admin" onClick={leaveAdmin}>
            <ShieldCheck size={16} /><span className="admin-button-name">{t('admin')}</span>
            <span className="admin-button-exit">{t('exitAdmin')}</span>
          </button>
            : <button className="button button-quiet" onClick={enterAdmin}><LockKeyhole size={16} />{t('admin')}</button>}
        </div>
      </header>

      <section className="welcome-row">
        <div><span className="eyebrow"><Sparkles size={14} /> {t('heroEyebrow')}</span>
          <h1>{t('brand')}<span className="title-leaf">.</span></h1>
          <p>{t('subtitle')}</p>
        </div>
        <div className="privacy-pill"><span className="privacy-dot" /> <ShieldCheck size={16} /> {t('privacyBadge')}</div>
      </section>

      <section className="workspace">
        <div className="tree-area" ref={treeAreaRef}>
          <div className="tree-toolbar">
            <div className="search-wrap"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} aria-label={t('search')} />
              {query && <button className="icon-button clear-search" aria-label={t('close')} onClick={() => setQuery('')}><X size={15} /></button>}
              {query.trim() && <div className="search-results" role="listbox" aria-label={t('searchResults')}>
                {filtered.slice(0, 8).map((person) => <button key={person.id} role="option" aria-selected={person.id === selectedId}
                  onClick={() => { setQuery(''); selectPerson(person.id) }}>
                  <span className="mini-avatar">{person.firstName.slice(0, 1)}{person.lastName.slice(0, 1)}</span>
                  <span>{person.firstName} {person.lastName}</span>
                  <small>{person.birthDate?.slice(0, 4) ?? ''}</small>
                </button>)}
                {filtered.length === 0 && <p>{t('noSearchResults')}</p>}
              </div>}
              {cropFile && <ImageCropDialog file={cropFile} t={t} onCancel={() => setCropFile(null)}
                onComplete={(image) => { setCroppedPhoto(image); setCropFile(null) }} />}
            </div>
            <label className="generation-select"><Users size={16} /><span className="sr-only">{t('generation')}</span>
              <select value={generation} onChange={(event) => setGeneration(event.target.value)} aria-label={t('generation')}>
                <option value="all">{t('allGenerations')}</option>
                {[...new Set(generations.values())].sort((a, b) => a - b).map((level) =>
                  <option value={String(level)} key={level}>{t('generation')} {level + 1}</option>)}
              </select><ChevronDown size={14} />
            </label>
          </div>
          <div className="tree-stage" ref={stageRef}>
            {loadingPublishedArchive && <div className="archive-loading" role="status">
              <LoaderCircle className="button-spinner" size={18} />{t('loadingPublishedArchive')}
            </div>}
            {archive.people.length === 0 ? <div className="empty-state">
              <div className="empty-illustration"><span /><span /><span /><Heart size={28} /></div>
              <h2>{t('emptyTitle')}</h2><p>{t('emptyText')}</p>
              <div className="empty-actions">
                <label className={`button button-light ${busyAction === 'importing' ? 'is-busy' : ''}`}>
                  {busyAction === 'importing' ? <LoaderCircle className="button-spinner" size={15} /> : <Upload size={16} />}
                  {busyAction === 'importing' ? t('importingArchive') : t('openArchive')}
                  <input type="file" accept="application/json,.json" hidden disabled={busyAction !== null} onChange={(event) => {
                    void selectArchiveFile(event.currentTarget.files?.[0], event.currentTarget)
                  }} />
                </label>
                {admin && <button className="button button-primary" onClick={() => { setEditing(null); setCroppedPhoto(null); setModal('person') }}><UserRoundPlus size={16} />{t('addPerson')}</button>}
              </div>
              {admin && <p className="empty-hint">{t('adminHint')}</p>}
            </div> : <>
              <svg ref={canvasRef} className="tree-canvas" role="group" aria-label={`${t('brand')} — ${archive.people.length} persone`}
                onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
                onClick={(event) => {
                  if (event.target !== event.currentTarget || suppressClick.current) return
                  setSelectedId(null)
                }}>
                <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
                  {familyConnectors.map(({ key, parentIds, childIds }) => {
                    if (![...parentIds, ...childIds].every((id) => filtered.some((person) => person.id === id))) return null
                    const parentPoints = parentIds.map((id) => positions.get(id)).filter((point) => point !== undefined)
                    const childPoints = childIds.map((id) => positions.get(id)).filter((point) => point !== undefined)
                    if (parentPoints.length === 0 || childPoints.length === 0) return null
                    const parentLeft = Math.min(...parentPoints.map((point) => point.x))
                    const parentRight = Math.max(...parentPoints.map((point) => point.x))
                    const parentCenter = (parentLeft + parentRight) / 2
                    const childLeft = Math.min(...childPoints.map((point) => point.x))
                    const childRight = Math.max(...childPoints.map((point) => point.x))
                    const parentBottom = Math.max(...parentPoints.map((point) => point.y + 54))
                    const childTop = Math.min(...childPoints.map((point) => point.y - 54))
                    const parentsBusY = (parentBottom + childTop) / 2
                    const childrenBusY = childTop - 12
                    const parentBranches = parentPoints.map((point) => `M ${point.x} ${point.y + 54} L ${point.x} ${parentsBusY}`).join(' ')
                    const parentsBus = parentPoints.length > 1 ? `M ${parentLeft} ${parentsBusY} L ${parentRight} ${parentsBusY}` : ''
                    const familyTrunk = `M ${parentCenter} ${parentsBusY} L ${parentCenter} ${childrenBusY} L ${childLeft} ${childrenBusY}`
                    const childrenBus = childPoints.length > 1 ? `L ${childRight} ${childrenBusY}` : ''
                    const childBranches = childPoints.map((point) =>
                      `M ${point.x} ${childrenBusY} L ${point.x} ${point.y - 54}`).join(' ')
                    return <path key={key} className="family-line"
                      d={`${parentBranches} ${parentsBus} ${familyTrunk} ${childrenBus} ${childBranches}`} />
                  })}
                  {archive.relationships.filter((relationship) => relationship.type === 'partner').map((relationship) => {
                    const from = positions.get(relationship.from)
                    const to = positions.get(relationship.to)
                    if (!from || !to || !filtered.some((p) => p.id === relationship.from) || !filtered.some((p) => p.id === relationship.to)) return null
                    const direction = to.x >= from.x ? 1 : -1
                    const path = from.y === to.y
                      ? `M ${from.x + direction * 80} ${from.y} L ${to.x - direction * 80} ${to.y}`
                      : `M ${from.x + direction * 80} ${from.y} C ${from.x + direction * 105} ${from.y - 15}, ${to.x - direction * 105} ${to.y - 15}, ${to.x - direction * 80} ${to.y}`
                    return <g key={relationship.id}>
                      <path className="partner-line" d={path} />
                      <Heart className="partner-heart" x={(from.x + to.x) / 2 - 6} y={(from.y + to.y) / 2 - 6} size={12} />
                    </g>
                  })}
                  {filtered.map((person) => {
                    const point = positions.get(person.id)!
                    const active = selectedId === person.id
                    const connected = relatedIds.has(person.id)
                    const years = [person.birthDate?.slice(0, 4), person.deathDate?.slice(0, 4)].filter(Boolean).join(' — ')
                    return <g key={person.id} transform={`translate(${point.x - 80} ${point.y - 52})`}>
                      <g ref={(node) => {
                        if (node) personNodeRefs.current.set(person.id, node)
                        else personNodeRefs.current.delete(person.id)
                      }} role="button" tabIndex={0}
                        aria-label={`${person.firstName} ${person.lastName}${years ? `, ${years}` : ''}`} aria-pressed={active}
                        className={`person-node ${active ? 'selected' : ''} ${selectedId && !active && !connected ? 'dimmed' : ''} ${keyboardFocusedId === person.id ? 'keyboard-focused' : ''}`}
                        onFocus={() => {
                          if (keyboardNavigationMode.current) setKeyboardFocusedId(person.id)
                        }}
                        onBlur={() => setKeyboardFocusedId((current) => current === person.id ? null : current)}
                        onPointerDown={(event) => {
                          keyboardNavigationMode.current = false
                          setKeyboardFocusedId(null)
                          if (event.pointerType !== 'touch') event.stopPropagation()
                        }}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (suppressClick.current) { suppressClick.current = false; return }
                          selectPerson(person.id)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            keyboardNavigationMode.current = true
                            setKeyboardFocusedId(person.id)
                            selectPerson(person.id)
                            return
                          }
                          const directions = {
                            ArrowLeft: [-1, 0],
                            ArrowRight: [1, 0],
                            ArrowUp: [0, -1],
                            ArrowDown: [0, 1],
                          } as const
                          const direction = directions[event.key as keyof typeof directions]
                          if (!direction) return
                          event.preventDefault()
                          keyboardNavigationMode.current = true
                          const current = positions.get(person.id)
                          if (!current) return
                          const next = filtered
                            .filter((candidate) => candidate.id !== person.id)
                            .map((candidate) => {
                              const candidatePoint = positions.get(candidate.id)
                              if (!candidatePoint) return null
                              const dx = candidatePoint.x - current.x
                              const dy = candidatePoint.y - current.y
                              const primary = dx * direction[0] + dy * direction[1]
                              if (primary <= 0) return null
                              const secondary = Math.abs(dx * direction[1] - dy * direction[0])
                              return { candidate, score: primary + secondary * 1.5 }
                            })
                            .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
                            .sort((a, b) => a.score - b.score)[0]
                          if (!next) return
                          setSelectedId(next.candidate.id)
                          setKeyboardFocusedId(next.candidate.id)
                          personNodeRefs.current.get(next.candidate.id)?.focus({ preventScroll: true })
                        }}>
                        <rect width="160" height="104" rx="18" />
                        {person.photo ? <TreePhoto key={`${person.id}:${person.photo}`} personId={person.id} source={person.photo} passphrase={passphrase}
                          onError={(message) => setNotice(`${t('photoVariantFailure')} ${message}`)} />
                          : <g><circle cx="34" cy="34" r="22" className="node-avatar" /><text x="34" y="39" textAnchor="middle" className="avatar-initial">{person.firstName.slice(0, 1)}{person.lastName.slice(0, 1)}</text></g>}
                        <text x="66" y="30" className="node-name">{person.firstName.slice(0, 13)}</text>
                        <text x="66" y="49" className="node-lastname">{person.lastName.slice(0, 13)}</text>
                        <text x="14" y="82" className="node-years">{years || '· · ·'}</text>
                      </g>
                      {admin && <g transform="translate(146 14)" role="button" tabIndex={0}
                        aria-label={`${t('editPerson')}: ${person.firstName} ${person.lastName}`}
                        className="node-edit-button"
                        onPointerDown={(event) => {
                          if (event.pointerType !== 'touch') event.stopPropagation()
                        }}
                        onClick={(event) => { event.stopPropagation(); editPerson(person) }}
                        onKeyDown={(event) => {
                          event.stopPropagation()
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            editPerson(person)
                          }
                        }}>
                        <circle r="12" />
                        <Pencil x={-6} y={-6} size={12} />
                      </g>}
                    </g>
                  })}
                </g>
              </svg>
              <div className="canvas-hint"><MousePointer2 size={14} /> {t('treeGestureHint')}</div>
              <div className="zoom-controls">
                <button aria-label={t('zoomIn')} title={t('zoomIn')} onClick={() => setView((v) => ({ ...v, scale: Math.min(2.2, v.scale * 1.15) }))}><Plus size={17} /></button>
                <span>{Math.round(view.scale * 100)}%</span>
                <button aria-label={t('zoomOut')} title={t('zoomOut')} onClick={() => setView((v) => ({ ...v, scale: Math.max(0.4, v.scale / 1.15) }))}><Minus size={17} /></button>
                <i />
                <button aria-label={t('resetView')} title={t('resetView')} onClick={resetView}><Maximize2 size={16} /></button>
                <i />
                <button aria-label={treeFullscreen ? t('exitFullscreen') : t('fullScreen')}
                  title={treeFullscreen ? t('exitFullscreen') : t('fullScreen')}
                  onClick={() => void toggleTreeFullscreen()}>
                  {treeFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                </button>
              </div>
            </>}
            {archive.people.length > 0 && admin && <button className="floating-add" onClick={() => { setEditing(null); setCroppedPhoto(null); setModal('person') }}><Plus size={18} /><span>{t('addPerson')}</span></button>}
            {archive.people.length > 0 && <label className={`archive-open ${busyAction === 'importing' ? 'is-busy' : ''}`}>
              {busyAction === 'importing' ? <LoaderCircle className="button-spinner" size={15} /> : <Upload size={15} />}
              {busyAction === 'importing' ? t('importingArchive') : t('openArchive')}
              <input type="file" accept="application/json,.json" hidden disabled={busyAction !== null} onChange={(event) => {
                void selectArchiveFile(event.currentTarget.files?.[0], event.currentTarget)
              }} />
            </label>}
          </div>
          <footer className="tree-footer"><span><span className="privacy-dot" /> {t('peopleCount', { count: archive.people.length })}</span>
            <span><FileLock2 size={14} /> {t('privacyFooter')}</span></footer>
        </div>

        <aside className={`detail-panel ${selected ? 'has-selection' : ''}`}>
          {selected ? <>
            <button className="detail-close icon-button" onClick={() => setSelectedId(null)} aria-label={t('close')}><X size={18} /></button>
            <div className="profile-hero">
              <div className="profile-avatar">{selected.photo ? <ProfilePhoto key={`${selected.id}:${selected.photo}`} personId={selected.id}
                source={selected.photo} passphrase={passphrase} onError={(message) => setNotice(`${t('photoVariantFailure')} ${message}`)} />
                : <span>{selected.firstName.slice(0, 1)}{selected.lastName.slice(0, 1)}</span>}</div>
              <div className="profile-identity"><span className="profile-label">{t('profileStory')}</span><h2>{selected.firstName} {selected.lastName}</h2>
                {selected.birthDate && <p>{selected.birthDate.slice(0, 4)}{selected.deathDate ? ` — ${selected.deathDate.slice(0, 4)}` : ` — ${t('aliveToday')}`}</p>}
                {admin && <button className="button button-light profile-edit" aria-label={`${t('editPerson')}: ${selected.firstName} ${selected.lastName}`}
                  title={t('editPerson')} onClick={editSelected}>
                  <BookOpen size={15} /><span>{t('editPerson')}</span>
                </button>}
              </div>
            </div>
            <section className="family-block"><h3><Users size={15} />{t('family')}</h3>
              {archive.people.length > 1 && <section className="kinship-calculator">
                <h4>{t('kinshipCalculator')}</h4>
                <PersonSearchPicker
                  people={archive.people.filter((person) => person.id !== selected.id)}
                  value={kinshipPerson?.id ?? ''}
                  onChange={setKinshipPersonId}
                  label={t('kinshipCompare')}
                  placeholder={t('searchPerson')}
                  noResults={t('noPeopleFound')}
                />
                {kinshipPerson && (kinshipPath
                  ? <div className="kinship-result" aria-live="polite">
                    <strong>{t('kinshipPath')}</strong>
                    {kinshipPath.steps.length === 0
                      ? <p>{t('kinshipSamePerson')}</p>
                      : <ol>{kinshipPath.steps.map((step, index) => {
                        const person = archive.people.find((entry) => entry.id === step.personId)
                        if (!person) return null
                        const relationLabel = step.type === 'parent'
                          ? t('kinshipParent')
                          : step.type === 'child' ? t('kinshipChild') : t('kinshipPartner')
                        return <li key={`${step.personId}-${index}`}>
                          <span>{relationLabel}</span>
                          <strong>{person.firstName} {person.lastName}</strong>
                        </li>
                      })}</ol>}
                    {kinshipPath.bloodSteps > 0 && <p>{t('kinshipBloodSteps', { count: kinshipPath.bloodSteps })}</p>}
                    {kinshipPath.partnerSteps > 0 && <p>{t('kinshipPartnerSteps', { count: kinshipPath.partnerSteps })}</p>}
                  </div>
                  : <p className="kinship-result muted-copy" aria-live="polite">{t('kinshipNoConnection')}</p>)}
              </section>}
              {familyList(t('parents'), relationshipEntries(selected.id, 'parent-child', 'in'))}
              {familyList(t('children'), relationshipEntries(selected.id, 'parent-child', 'out'))}
              {familyList(t('partners'), relationshipEntries(selected.id, 'partner'))}
              {familyList(t('siblings'), uniquePeople(relationships(selected.id, 'parent-child', 'in').flatMap((parent) =>
                relationships(parent.id, 'parent-child', 'out').filter((child) => child.id !== selected.id))
              ).map((person) => ({ person })))}
              {relationships(selected.id, 'parent-child').length === 0 && relationships(selected.id, 'partner').length === 0 &&
                <p className="muted-copy">{t('noFamilyConnections')}</p>}
            </section>
            {upcomingBirthday && <div className="birthday-card"><span className="birthday-icon">🎂</span>
              <div><strong>{t('birthdayIn', { days: upcomingBirthday.days })}</strong>
                <small>{formatCalendarDate(upcomingBirthday.date, language)}</small></div></div>}
            <div className="detail-body">
              <div className="detail-facts">
                {selected.birthDate && <div><span>{t('birth')}</span><strong>{formatDate(selected.birthDate, language)}</strong></div>}
                {selected.deathDate && <div><span>{t('death')}</span><strong>{formatDate(selected.deathDate, language)}</strong></div>}
                {selected.birthPlace && <div><span>{t('birthPlace')}</span><strong>{selected.birthPlace}</strong></div>}
                {selected.alternateName && <div><span>{t('alternateName')}</span><strong>{selected.alternateName}</strong></div>}
                {selected.sexAtBirth && <div><span>{t('sexAtBirth')}</span><strong>{t(
                  selected.sexAtBirth === 'M' ? 'sexM' : selected.sexAtBirth === 'F' ? 'sexF'
                    : selected.sexAtBirth === 'X' ? 'sexX' : 'sexU',
                )}</strong></div>}
                {selected.profession && <div><span>{t('profession')}</span><strong>{selected.profession}</strong></div>}
                {selected.residence && <div><span>{t('residence')}</span><strong>{selected.residence}</strong></div>}
                {selected.nationality && <div><span>{t('nationality')}</span><strong>{selected.nationality}</strong></div>}
              </div>
              {selected.biography && <section className="bio-block"><h3>{t('biography')}</h3><p>{selected.biography}</p></section>}
              {selected.notes && <section className="bio-block"><h3>{t('notes')}</h3><p>{selected.notes}</p></section>}
              <div className="contact-actions">
                {selected.email && <a className="contact-button" href={`mailto:${encodeURIComponent(selected.email)}?subject=${encodeURIComponent(t('greetingSubject', { name: selected.firstName }))}&body=${encodeURIComponent(t('greetingEmail', { name: selected.firstName }))}`}><Mail size={16} />{t('email')}</a>}
                {selected.whatsapp && /^\+?[0-9\s().-]{7,20}$/.test(selected.whatsapp) && <a className="contact-button" target="_blank" rel="noreferrer" href={`https://wa.me/${selected.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(t('greetingWhatsApp', { name: selected.firstName }))}`}><Heart size={16} />{t('whatsapp')}</a>}
              </div>
              {admin && <div className="admin-tools"><button className="button button-danger" onClick={removeSelected}>{t('remove')}</button>
                {archive.people.length > 1 && <button className="button button-light" onClick={() => {
                  setRelationshipPersonId('')
                  setModal('relationship')
                }}><Users size={15} />{t('relationship')}</button>}
              </div>}
            </div>
          </> : <div className="detail-empty"><div className="detail-empty-icon"><CircleHelp size={25} /></div><h3>{t('family')}</h3><p>{t('selectPerson')}</p></div>}
        </aside>
      </section>

      {admin && <section className="admin-dock">
        <div className="dock-title"><ShieldCheck size={18} /><span><strong>{t('adminMode')}</strong><small>{t('adminHint')}</small></span></div>
        <div className="dock-actions"><button className="button button-primary" disabled={busyAction !== null} onClick={() => beginKeyFlow('save')}><Download size={16} />{t('save')}</button>
          <button className="button button-light" disabled={busyAction !== null} onClick={() => { void exportPlainArchive() }}>
            {busyAction === 'exporting-json' ? <LoaderCircle className="button-spinner" size={15} /> : <Download size={16} />}
            {busyAction === 'exporting-json' ? t('exportingArchive') : t('exportPlain')}
          </button>
          <button className="button button-light" disabled={busyAction !== null} onClick={() => { void exportGedcomArchive() }}>
            {busyAction === 'exporting-gedzip' ? <LoaderCircle className="button-spinner" size={15} /> : <Download size={16} />}
            {busyAction === 'exporting-gedzip' ? t('exportingArchive') : t('exportGedcom')}
          </button>
          <label className={`button button-light ${busyAction === 'importing' ? 'is-busy' : ''}`}>
            {busyAction === 'importing' ? <LoaderCircle className="button-spinner" size={15} /> : <Upload size={16} />}
            {busyAction === 'importing' ? t('importingArchive') : t('importPlain')}
            <input type="file" accept="application/json,.json" hidden disabled={busyAction !== null} onChange={(event) => {
              void selectPlainArchive(event.currentTarget.files?.[0], event.currentTarget)
            }} />
          </label>
          <button className="button button-light" disabled={busyAction !== null} onClick={() => {
            setPublishNewKey(!passphrase)
            setRememberPassphrase(rememberedKeyAvailable)
            setModal('publish')
          }}><Upload size={16} />{t('publish')}</button></div>
      </section>}

      {notice && <div className={`notice ${noticeFading ? 'is-fading' : ''}`} role="status"><Check size={17} />{notice}<button onClick={() => setNotice('')} aria-label={t('close')}><X size={16} /></button></div>}

      {modal && <div className="modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget && busyAction === null) cancelModal()
      }}>
        <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <button className="modal-close icon-button" aria-label={t('close')} disabled={busyAction !== null} onClick={cancelModal}><X size={18} /></button>
          {modal === 'admin' && <><div className="modal-symbol"><LockKeyhole size={23} /></div><h2 id="modal-title">{t('admin')}</h2><p>{t('adminHint')}</p>
            <form onSubmit={authenticateAdmin} className="form-stack"><label>{t('password')}<input autoFocus name="password" type="password" required /></label>
              <div className="inline-warning"><ShieldCheck size={16} /> {t('publicPasswordWarning')}</div>
              <div className="modal-actions"><button type="button" className="button button-light" onClick={() => setModal(null)}>{t('cancel')}</button><button className="button button-primary">{t('confirm')}</button></div>
            </form></>}
          {modal === 'import-review' && pendingArchive && <><div className="modal-symbol"><FileLock2 size={23} /></div><h2 id="modal-title">{t('importReview')}</h2>
            <p>{t('importReviewSummary', { incoming: pendingArchive.people.length, current: archive.people.length, relationships: pendingArchive.relationships.length })}</p>
            <div className="inline-warning"><ShieldCheck size={16} /> {t('importReplaceWarning')}</div>
            <div className="modal-actions"><button type="button" className="button button-light" onClick={cancelModal}>{t('cancel')}</button>
              <button type="button" className="button button-primary" onClick={() => void applyPendingImport()}>{t('applyImport')}</button></div>
          </>}
          {modal === 'key' && <><div className="modal-symbol"><FileLock2 size={23} /></div><h2 id="modal-title">{keyPurpose === 'open' ? t('openArchive') : t('save')}</h2>
            <p>{keyPurpose === 'save' ? t('passphraseGuidance') : t('savedDataWarning')}</p>
            {keyPurpose === 'save' && passphrase && !replaceKey ? <div className="key-choice">
              <div className="inline-warning"><ShieldCheck size={16} /> {t('activeKeyInfo')}</div>
              <div className="remember-key-option">
                <span id="remember-key-label">{t('rememberPassphrase')}</span>
                <button className="remember-key-switch" type="button" role="switch"
                  aria-checked={rememberPassphrase} aria-labelledby="remember-key-label"
                  onClick={() => setRememberPassphrase((remember) => !remember)}>
                  <span className="remember-key-switch-track" aria-hidden="true" />
                </button>
              </div>
              <div className="modal-actions"><button type="button" className="button button-light" disabled={busyAction !== null} onClick={() => { setReplaceKey(true) }}>{t('newKey')}</button>
                <button type="button" className="button button-primary" disabled={busyAction !== null} onClick={() => void saveArchive(passphrase)}>
                  {busyAction === 'saving' && <LoaderCircle className="button-spinner" size={15} />}
                  {busyAction === 'saving' ? t('savingArchive') : t('reuseKey')}
                </button></div>
            </div> : <form className="form-stack" onSubmit={async (event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              const key = data.get('passphrase') as string
              if (keyPurpose === 'save' && key !== data.get('passphraseConfirmation')) {
                setNotice(t('passphraseMismatch'))
                return
              }
              if (keyPurpose === 'open' && pendingEnvelope) {
                setBusyAction('opening')
                try {
                  const result = await decryptArchive(pendingEnvelope as EncryptedArchive, key)
                  if (archive.people.length > 0) {
                    setPendingArchive(result)
                    setPendingPassphrase(key)
                    setPendingEnvelope(null)
                    setModal('import-review')
                  } else {
                    const storageWarning = await persistPassphraseChoice(key, rememberPassphrase)
                    installArchive(result, key)
                    if (storageWarning) setNotice(storageWarning)
                  }
                } catch (error) { setNotice(error instanceof Error ? error.message : t('archiveOpenFailure')) }
                finally { setBusyAction(null) }
              } else await saveArchive(key)
            }}><label>{t('passphrase')}<input autoFocus name="passphrase" type="password" minLength={keyPurpose === 'save' ? 12 : 1} required /></label>
              {keyPurpose === 'save' && <label>{t('passphraseConfirmation')}<input name="passphraseConfirmation" type="password" minLength={12} required /></label>}
              <div className="remember-key-option">
                <span id="remember-key-label">{t('rememberPassphrase')}</span>
                <button className="remember-key-switch" type="button" role="switch"
                  aria-checked={rememberPassphrase} aria-labelledby="remember-key-label"
                  onClick={() => setRememberPassphrase((remember) => !remember)}>
                  <span className="remember-key-switch-track" aria-hidden="true" />
                </button>
              </div>
              <div className="modal-actions"><button type="button" className="button button-light" disabled={busyAction !== null} onClick={() => setModal(null)}>{t('cancel')}</button>
                <button className="button button-primary" disabled={busyAction !== null}>
                  {busyAction && <LoaderCircle className="button-spinner" size={15} />}
                  {busyAction === 'opening' ? t('openingArchive') : busyAction === 'saving' ? t('savingArchive') : t('confirm')}
                </button></div>
            </form>}</>}
          {modal === 'person' && <><div className="modal-symbol"><UserRoundPlus size={23} /></div><h2 id="modal-title">{editing ? t('editPerson') : t('addPerson')}</h2>
            <form className="form-stack person-form" onSubmit={editing ? onEditPerson : onAddPerson}>
              <div className="two-fields"><label>{t('firstName')}<input autoFocus name="firstName" required defaultValue={editing?.firstName} /></label><label>{t('lastName')}<input name="lastName" required defaultValue={editing?.lastName} /></label></div>
              <label>{t('alternateName')}<input name="alternateName" defaultValue={editing?.alternateName} /></label>
              <label>{t('sexAtBirth')}<select name="sexAtBirth" defaultValue={editing?.sexAtBirth ?? ''}>
                <option value="">{t('notSpecified')}</option>
                <option value="M">{t('sexM')}</option>
                <option value="F">{t('sexF')}</option>
                <option value="X">{t('sexX')}</option>
                <option value="U">{t('sexU')}</option>
              </select></label>
              <div className="two-fields"><label>{t('birthDate')}<input name="birthDate" inputMode="numeric" pattern={dateInputPattern(language)} placeholder={language === 'it' ? 'DD-MM-YYYY' : 'YYYY-MM-DD'} defaultValue={formatDateInput(editing?.birthDate, language)} onFocus={(event) => {
                if (event.currentTarget.value.includes('-')) manualDateFields.current.add(event.currentTarget)
              }} onKeyDown={(event) => handleDateKeyDown(event.currentTarget, event.key)} onPaste={(event) => handleDatePaste(event.currentTarget, event.clipboardData.getData('text'))} onChange={(event) => formatDateField(event.currentTarget)} onBlur={(event) => finishDateField(event.currentTarget)} /></label><label>{t('deathDate')}<input name="deathDate" inputMode="numeric" pattern={dateInputPattern(language)} placeholder={language === 'it' ? 'DD-MM-YYYY' : 'YYYY-MM-DD'} defaultValue={formatDateInput(editing?.deathDate, language)} onFocus={(event) => {
                if (event.currentTarget.value.includes('-')) manualDateFields.current.add(event.currentTarget)
              }} onKeyDown={(event) => handleDateKeyDown(event.currentTarget, event.key)} onPaste={(event) => handleDatePaste(event.currentTarget, event.clipboardData.getData('text'))} onChange={(event) => formatDateField(event.currentTarget)} onBlur={(event) => finishDateField(event.currentTarget)} /></label></div>
              <label>{t('birthPlace')}<input name="birthPlace" defaultValue={editing?.birthPlace} /></label>
              <label>{t('profession')}<input name="profession" defaultValue={editing?.profession} /></label>
              <label>{t('residence')}<input name="residence" defaultValue={editing?.residence} /></label>
              <label>{t('nationality')}<input name="nationality" defaultValue={editing?.nationality} /></label>
              <label>{t('biography')}<textarea name="biography" rows={2} defaultValue={editing?.biography} /></label>
              <div className="two-fields"><label>{t('emailAddress')}<input name="email" type="email" defaultValue={editing?.email} /></label><label>WhatsApp<input name="whatsapp" type="tel" defaultValue={editing?.whatsapp} /></label></div>
              <label>{t('notes')}<textarea name="notes" rows={2} defaultValue={editing?.notes} /></label>
              <div className="photo-field">
                <label className="field-label" htmlFor="person-photo">{t('choosePhoto')}</label>
                <input id="person-photo" name="photo" type="file" accept={photoTypes.join(',')} onChange={(event) => choosePhoto(event.currentTarget.files?.[0], event.currentTarget)} />
                {croppedPhoto && <span className="crop-ready">{t('cropReady')}</span>}
                {editing?.photo && <><small>{t('photoReplacement')}</small>
                  <label className="photo-remove-option"><input name="removePhoto" type="checkbox" /><span>{t('removePhoto')}</span></label>
                </>}</div>
              <div className="modal-actions"><button type="button" className="button button-light" onClick={() => { setModal(null); setEditing(null) }}>{t('cancel')}</button><button className="button button-primary">{editing ? t('confirm') : t('create')}</button></div>
            </form></>}
          {modal === 'relationship' && selected && <><div className="modal-symbol"><Users size={23} /></div><h2 id="modal-title">{t('relationship')}</h2>
            <form className="form-stack" onSubmit={onAddRelationship}>
              <label>{t('relationshipType')}<select name="type"><option value="parent-child">{t('parentChild')}</option><option value="partner">{t('partner')}</option></select></label>
              <PersonSearchPicker
                people={archive.people.filter((person) => person.id !== selected.id)}
                value={relationshipPersonId}
                onChange={setRelationshipPersonId}
                label={t('person')}
                placeholder={t('searchPerson')}
                noResults={t('noPeopleFound')}
              />
              <p className="form-note">{t('parentRelationshipHint')}</p>
              <div className="modal-actions"><button type="button" className="button button-light" onClick={() => setModal(null)}>{t('cancel')}</button><button className="button button-primary">{t('confirm')}</button></div>
            </form></>}
          {modal === 'publish' && <><div className="modal-symbol"><Upload size={23} /></div><h2 id="modal-title">{t('publish')}</h2>
            <p>{t('publishWarning')}</p>
            <form className="form-stack" onSubmit={publishArchive}>
              {passphrase && <div className="key-choice">
                <div className="inline-warning"><ShieldCheck size={16} /> {t('activeKeyInfo')}</div>
                <div className="key-choice-actions">
                  <button type="button" className={`button ${publishNewKey ? 'button-light' : 'button-primary'}`}
                    aria-pressed={!publishNewKey} disabled={busyAction !== null}
                    onClick={() => setPublishNewKey(false)}>{t('reuseKey')}</button>
                  <button type="button" className={`button ${publishNewKey ? 'button-primary' : 'button-light'}`}
                    aria-pressed={publishNewKey} disabled={busyAction !== null}
                    onClick={() => setPublishNewKey(true)}>{t('newKey')}</button>
                </div>
              </div>}
              {publishNewKey && <>
                <label>{t('passphrase')}<input autoFocus name="publishPassphrase" type="password" minLength={12} required /></label>
                <label>{t('passphraseConfirmation')}<input name="publishPassphraseConfirmation" type="password" minLength={12} required /></label>
              </>}
              <div className="remember-key-option">
                <span id="publish-remember-key-label">{t('rememberPassphrase')}</span>
                <button className="remember-key-switch" type="button" role="switch"
                  aria-checked={rememberPassphrase} aria-labelledby="publish-remember-key-label"
                  onClick={() => setRememberPassphrase((remember) => !remember)}>
                  <span className="remember-key-switch-track" aria-hidden="true" />
                </button>
              </div>
              <div className="two-fields"><label>{t('githubOwner')}<input name="owner" required /></label><label>{t('githubRepo')}<input name="repo" required defaultValue="moltisanti-family-tree" /></label></div>
              <div className="two-fields"><label>{t('githubBranch')}<input name="branch" required defaultValue="main" /></label><label>{t('githubPath')}<input name="path" required defaultValue={archivePath} readOnly /></label></div>
              <label>{t('githubToken')}<input name="token" type="password" autoComplete="off" required /></label>
              <p className="form-note">{t('tokenScopeHint')}</p>
              <div className="modal-actions"><button type="button" className="button button-light" disabled={busyAction !== null} onClick={() => setModal(null)}>{t('cancel')}</button>
                <button className="button button-primary" disabled={busyAction !== null}>
                  {busyAction === 'publishing' ? <LoaderCircle className="button-spinner" size={15} /> : <Upload size={16} />}
                  {busyAction === 'publishing' ? t('publishing') : t('publish')}
                </button></div>
            </form></>}
        </section>
      </div>}
    </main>
  )
}

interface PersonSearchPickerProps {
  people: Person[]
  value: string
  onChange: (personId: string) => void
  label: string
  placeholder: string
  noResults: string
}

function PersonSearchPicker({
  people,
  value,
  onChange,
  label,
  placeholder,
  noResults,
}: PersonSearchPickerProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const selected = people.find((person) => person.id === value)
  const options = people.filter((person) =>
    `${person.firstName} ${person.lastName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const choose = (person: Person) => {
    onChange(person.id)
    setQuery('')
    setOpen(false)
  }

  return <div className="relationship-picker">
    <label htmlFor={id}>{label}</label>
    <input
      id={id}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={`${id}-options`}
      aria-activedescendant={open && options[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
      aria-required="true"
      autoComplete="off"
      value={open ? query : selected ? `${selected.firstName} ${selected.lastName}` : query}
      placeholder={placeholder}
      onFocus={() => {
        setQuery('')
        setActiveIndex(0)
        setOpen(true)
      }}
      onChange={(event) => {
        setQuery(event.target.value)
        onChange('')
        setActiveIndex(0)
        setOpen(true)
      }}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setOpen(true)
          setActiveIndex((index) => Math.max(0, Math.min(index + 1, options.length - 1)))
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          setActiveIndex((index) => Math.max(index - 1, 0))
        } else if (event.key === 'Enter' && open && options[activeIndex]) {
          event.preventDefault()
          choose(options[activeIndex]!)
        } else if (event.key === 'Escape') {
          setOpen(false)
        }
      }}
    />
    <input type="hidden" name="person" value={value} />
    {open && <div id={`${id}-options`} className="relationship-picker-options" role="listbox">
      {options.length > 0 ? options.map((person, index) => (
        <button
          id={`${id}-option-${index}`}
          key={person.id}
          type="button"
          role="option"
          aria-label={`${person.firstName} ${person.lastName}`}
          aria-selected={person.id === value}
          className={index === activeIndex ? 'active' : ''}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => choose(person)}
        >
          <span className="mini-avatar">{person.firstName.slice(0, 1)}{person.lastName.slice(0, 1)}</span>
          <span>{person.firstName} {person.lastName}</span>
        </button>
      )) : <p>{noResults}</p>}
    </div>}
  </div>
}

export default App
