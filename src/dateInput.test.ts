import { describe, expect, it } from 'vitest'
import {
  dateInputPattern, finalizeDateDraft, formatCalendarDate, formatCalendarMonth, formatDate, formatDateDraft, formatDateInput, parseDateInput,
} from './dateInput'

describe('localized date input', () => {
  it('converts Italian full dates between DD-MM-YYYY and the stored ISO format', () => {
    expect(parseDateInput('24-10-2026', 'it')).toBe('2026-10-24')
    expect(formatDateInput('2026-10-24', 'it')).toBe('24-10-2026')
    expect(formatDate('2026-10-24', 'it')).toBe('24-10-2026')
    expect(formatCalendarDate(new Date(2026, 9, 24), 'it')).toBe('24-10-2026')
  })

  it('formats standalone month names in the active locale', () => {
    expect(formatCalendarMonth(5, 'it')).toBe('giugno')
    expect(formatCalendarMonth(5, 'en')).toBe('June')
    expect(formatCalendarMonth(5, 'eo')).toBe('Junio')
    expect(() => formatCalendarMonth(12, 'it')).toThrow(RangeError)
  })

  it('preserves supported partial dates and non-Italian ISO input', () => {
    expect(parseDateInput('10-2026', 'it')).toBe('2026-10')
    expect(formatDateInput('2026-10', 'it')).toBe('10-2026')
    expect(parseDateInput('2026-10-24', 'en')).toBe('2026-10-24')
    expect(formatDateInput('2026-10-24', 'en')).toBe('2026-10-24')
  })

  it('uses the matching input pattern for each language', () => {
    expect(dateInputPattern('it')).toContain('[0-9]{2}-[0-9]{2}-[0-9]{4}')
    expect(dateInputPattern('en')).toBe('[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?')
  })

  it('inserts date separators while typing digits and preserves year-only dates', () => {
    expect(formatDateDraft('24102026', 'it')).toBe('24-10-2026')
    expect(formatDateDraft('241', 'it')).toBe('24-1')
    expect(formatDateDraft('20261024', 'en')).toBe('2026-10-24')
    expect(finalizeDateDraft('2026-', 'it')).toBe('2026')
    expect(finalizeDateDraft('2026-', 'en')).toBe('2026')
  })
})
