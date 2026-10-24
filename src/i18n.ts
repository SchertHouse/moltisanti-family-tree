import en from './locales/en.json'
import eo from './locales/eo.json'
import it from './locales/it.json'

export const translations = { it, en, eo } as const
export type Language = keyof typeof translations
export type TranslationKey = keyof typeof en

export function browserLanguage(): Language {
  const language = navigator.language.split('-')[0]
  return language === 'it' || language === 'eo' || language === 'en' ? language : 'en'
}

export function translate(language: Language, key: TranslationKey, values?: Record<string, string | number>): string {
  let text: string = translations[language][key] ?? translations.en[key]
  for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}
