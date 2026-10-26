import type { Language } from './i18n'

const ISO_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/

export function formatDateDraft(value: string, language: Language): string {
  const digits = value.replace(/\D/g, '')
  const groups = language === 'it' ? [2, 2, 4] : [4, 2, 2]
  let formatted = ''
  let offset = 0

  groups.forEach((size, index) => {
    if (offset >= digits.length) return
    const group = digits.slice(offset, offset + size)
    formatted += group
    offset += group.length
    if (offset < digits.length || (group.length === size && index < groups.length - 1)) formatted += '-'
  })

  return formatted + digits.slice(offset)
}

export function finalizeDateDraft(value: string, language: Language): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 4) return digits
  return formatDateDraft(value, language).replace(/-$/, '')
}

export function formatDateInput(value: string | undefined, language: Language): string {
  if (!value || language !== 'it') return value ?? ''
  const match = ISO_DATE.exec(value)
  if (!match) return value
  const [, year, month, day] = match
  if (day && month) return `${day}-${month}-${year}`
  if (month) return `${month}-${year}`
  return year!
}

export function parseDateInput(value: string, language: Language): string | undefined {
  const input = value.trim()
  if (!input) return undefined
  if (language !== 'it') return input

  const fullDate = /^(\d{2})-(\d{2})-(\d{4})$/.exec(input)
  if (fullDate) return `${fullDate[3]}-${fullDate[2]}-${fullDate[1]}`
  const monthAndYear = /^(\d{2})-(\d{4})$/.exec(input)
  if (monthAndYear) return `${monthAndYear[2]}-${monthAndYear[1]}`
  return input
}

export function formatDate(value: string, language: Language): string {
  if (language === 'it') return formatDateInput(value, language)

  const parts = value.split('-').map(Number)
  if (parts.length === 1) return value
  const date = new Date(parts[0]!, (parts[1] ?? 1) - 1, parts[2] ?? 1)
  const locale = language === 'eo' ? 'eo' : 'en'
  return new Intl.DateTimeFormat(locale, parts.length === 2
    ? { year: 'numeric', month: 'long' }
    : { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
}

export function formatCalendarDate(date: Date, language: Language): string {
  const value = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  return formatDate(value, language)
}

export function dateInputPattern(language: Language): string {
  return language === 'it'
    ? '[0-9]{2}-[0-9]{2}-[0-9]{4}|[0-9]{2}-[0-9]{4}|[0-9]{4}'
    : '[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?'
}
