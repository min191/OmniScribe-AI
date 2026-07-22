import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

globalThis.ResizeObserver = ResizeObserverMock
window.matchMedia ||= () => ({ matches: true, addEventListener() {}, removeEventListener() {} })

HTMLDialogElement.prototype.showModal ||= function showModal() {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close ||= function close() {
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
}
