import DOMPurify from 'dompurify'

function isRemoteUrl(value: string): boolean {
  return /^(?:https?:)?\/\//i.test(value.trim())
}

export function sanitizeCardHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'link',
      'meta',
    ],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|data|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  })

  const template = document.createElement('template')
  template.innerHTML = sanitized
  for (const element of template.content.querySelectorAll<HTMLElement>('*')) {
    for (const attribute of ['src', 'poster']) {
      const value = element.getAttribute(attribute)
      if (value && isRemoteUrl(value)) element.removeAttribute(attribute)
    }
    const srcset = element.getAttribute('srcset')
    if (srcset) {
      const localEntries = srcset
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry && !isRemoteUrl(entry.split(/\s+/)[0] ?? ''))
      if (localEntries.length) element.setAttribute('srcset', localEntries.join(', '))
      else element.removeAttribute('srcset')
    }
    const style = element.getAttribute('style')
    if (style && /url\s*\(/i.test(style)) element.removeAttribute('style')
    if (element instanceof HTMLAnchorElement) {
      element.rel = 'noopener noreferrer'
    }
  }
  return template.innerHTML
}
