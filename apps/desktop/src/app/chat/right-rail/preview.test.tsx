import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ESCAPE_PRIORITY, pushEscapeLayer } from '@/lib/escape-layers'
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

  return render(
    <>
      <button type="button">Shell action</button>
      <ChatPreviewRail />
    </>
  )
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
    expect(screen.getByRole('dialog', { name: 'Preview' })).toBe(rail)
    expect(screen.getByRole('button', { name: 'Exit fullscreen preview' })).toBeDefined()
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

  it('leaves fullscreen open when a higher-priority overlay owns Escape', () => {
    const rendered = renderPreviewRail()
    const rail = rendered.container.querySelector('aside')
    const removeOverlayLayer = pushEscapeLayer(ESCAPE_PRIORITY.overlay)

    try {
      fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen preview' }))
      fireEvent.keyDown(window, { key: 'Escape' })

      expect(rail?.getAttribute('data-fullscreen')).toBe('true')
    } finally {
      removeOverlayLayer()
    }
  })

  it('lets an open tab menu consume Escape before exiting fullscreen', () => {
    const rendered = renderPreviewRail()
    const rail = rendered.container.querySelector('aside')

    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen preview' }))
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Example Domain' }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    expect(rail?.getAttribute('data-fullscreen')).toBe('true')
  })

  it('makes the covered shell inert and restores focus when fullscreen exits', () => {
    const rendered = renderPreviewRail()
    const rail = rendered.container.querySelector('aside')
    const shellAction = screen.getByRole('button', { name: 'Shell action' })
    const enterFullscreen = screen.getByRole('button', { name: 'Enter fullscreen preview' })

    enterFullscreen.focus()
    fireEvent.click(enterFullscreen)

    expect(shellAction.hasAttribute('inert')).toBe(true)
    expect(rail?.hasAttribute('inert')).toBe(false)

    rendered.container.querySelector<HTMLElement>('webview')?.focus()
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(shellAction.hasAttribute('inert')).toBe(false)
    expect(window.document.activeElement).toBe(screen.getByRole('button', { name: 'Enter fullscreen preview' }))
  })

  it('opens the active fullscreen preview URL in the browser', async () => {
    const previousHermes = window.hermesDesktop
    const openPreviewInBrowser = vi.fn().mockResolvedValue(true)

    Object.defineProperty(window, 'hermesDesktop', {
      configurable: true,
      value: { ...previousHermes, openPreviewInBrowser },
      writable: true
    })

    try {
      renderPreviewRail()
      fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen preview' }))
      fireEvent.click(screen.getByRole('button', { name: 'Open in browser' }))

      await vi.waitFor(() => expect(openPreviewInBrowser).toHaveBeenCalledWith('https://example.com/'))
    } finally {
      Object.defineProperty(window, 'hermesDesktop', {
        configurable: true,
        value: previousHermes,
        writable: true
      })
    }
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
