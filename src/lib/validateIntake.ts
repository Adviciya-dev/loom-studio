import type { CmsOption } from '@/types'

export interface IntakeFormState {
  siteUrl: string
  siteName: string
  cms: CmsOption
  cmsOther: string
  industry: string
  nicheKeywords: string
  targetMarket: string
  competitors: string[]
  localRepoPath: string | null
  businessGoal: string
  budgetTimeline: string
}

export interface FormErrors {
  siteUrl?: string
  siteName?: string
  cmsOther?: string
  industry?: string
  nicheKeywords?: string
  targetMarket?: string
  competitors: (string | undefined)[]
  localRepoPath?: string
  businessGoal?: string
}

export const INITIAL_FORM_STATE: IntakeFormState = {
  siteUrl: '',
  siteName: '',
  cms: 'wordpress',
  cmsOther: '',
  industry: '',
  nicheKeywords: '',
  targetMarket: '',
  competitors: [''],
  localRepoPath: null,
  businessGoal: '',
  budgetTimeline: '',
}

export function normaliseUrl(url: string): string {
  const t = url.trim()
  if (!t) return ''
  const lower = t.toLowerCase()
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return 'https://' + t
  // Re-write the scheme to lowercase so "Https://..." becomes "https://..."
  if (lower.startsWith('https://') && !t.startsWith('https://')) return 'https://' + t.slice(8)
  if (lower.startsWith('http://') && !t.startsWith('http://')) return 'http://' + t.slice(7)
  return t
}

export function isValidUrl(url: string): boolean {
  const n = normaliseUrl(url)
  if (!n) return false
  try {
    new URL(n)
    return true
  } catch {
    return false
  }
}

export function validateForm(form: IntakeFormState): FormErrors {
  const errors: FormErrors = { competitors: [] }
  if (!isValidUrl(form.siteUrl)) errors.siteUrl = 'Enter a valid URL (e.g. https://example.com)'
  if (!form.siteName.trim()) errors.siteName = 'This field is required'
  if (form.cms === 'other' && !form.cmsOther.trim()) errors.cmsOther = 'This field is required'
  if (!form.industry.trim()) errors.industry = 'This field is required'
  if (!form.nicheKeywords.trim()) errors.nicheKeywords = 'This field is required'
  if (!form.targetMarket.trim()) errors.targetMarket = 'This field is required'
  if (!form.businessGoal.trim()) errors.businessGoal = 'This field is required'
  form.competitors.forEach((url, i) => {
    if (url.trim() && !isValidUrl(url)) errors.competitors[i] = 'Enter a valid URL'
  })
  return errors
}

export function hasErrors(errors: FormErrors): boolean {
  return !!(
    errors.siteUrl ||
    errors.siteName ||
    errors.cmsOther ||
    errors.industry ||
    errors.nicheKeywords ||
    errors.targetMarket ||
    errors.businessGoal ||
    errors.competitors.some(Boolean)
  )
}
