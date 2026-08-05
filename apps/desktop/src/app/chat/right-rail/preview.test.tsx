import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { $rightRailActiveTabId } from '@/store/layout'
import { $previewTabs, previewTabId, type PreviewTarget } from '@/store/preview'

import { ChatPreviewRail } from './preview'

const target: PreviewTarget = {
  kind: 'url',
  label: 'Example Domain',
  source: 'https://example.com/',
  url: 'https://example.com/'
}

function renderPreviewRail() {
  const id = previewTabId(target)

  $previewTabs.set([{ id, target }])
  $rightRailActiveTabId.set(id)

  return render(<ChatPreviewRail />)
}

describe('ChatPreviewRail fullscreen mode', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    $previewTabs.set([])
    $rightRailActiveTabId.set(null)
    window.localStorage.clear()
  })

  it('expands the preview without remounting its webview and restores the rail', () => {
    const rendered = renderPreviewRail()
    const rail = rendered.container.querySelector('aside')
    const webview = rendered.container.querySelector('webview')

    expect(rail?.getAttribute('data-fullscreen')).toBe('false')
    expect(rail?.classList.contains('fixed')).toBe(false)
    expect(webview).toBeInstanceOf(HTMLElement)

    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen preview' }))

    expect(rail?.getAttribute('data-fullscreen')).toBe('true')
    expect(rail?.classList.contains('fixed')).toBe(true)
    expect(screen.getByRole('button', { name: 'Exit fullscreen preview' })).toBeInstanceOf(HTMLElement)
    expect(rendered.container.querySelector('webview')).toBe(webview)
    expect(screen.getByRole('button', { name: 'Open in browser' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen preview' }))

    expect(rail?.getAttribute('data-fullscreen')).toBe('false')
    expect(rail?.classList.contains('fixed')).toBe(false)
    expect(rendered.container.querySelector('webview')).toBe(webview)
  })

  it('exits fullscreen when Escape is pressed in the app shell', () => {
    const rendered = renderPreviewRail()
    const rail = rendered.container.querySelector('aside')

    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen preview' }))
    expect(rail?.getAttribute('data-fullscreen')).toBe('true')

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(rail?.getAttribute('data-fullscreen')).toBe('false')
  })

  it('exits fullscreen when Electron forwards Escape from the embedded webview', () => {
    let requestExit: () => void = () => undefined
    const previousHermes = window.hermesDesktop

    Object.defineProperty(window, 'hermesDesktop', {
      configurable: true,
      value: {
        ...previousHermes,
        onPreviewEscapeRequested: (callback: () => void) => {
          requestExit = callback

          return () => undefined
        }
      },
      writable: true
    })

    try {
      const rendered = renderPreviewRail()
      const rail = rendered.container.querySelector('aside')

      fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen preview' }))
      expect(rail?.getAttribute('data-fullscreen')).toBe('true')

      act(() => requestExit())

      expect(rail?.getAttribute('data-fullscreen')).toBe('false')
    } finally {
      Object.defineProperty(window, 'hermesDesktop', {
        configurable: true,
        value: previousHermes,
        writable: true
      })
    }
  })
})
