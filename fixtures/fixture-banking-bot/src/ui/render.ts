export function renderRaw(el: HTMLElement, html: string): void {
  // Intentionally vulnerable: unsanitised HTML sink (triggers R010).
  el.innerHTML = html;
}
