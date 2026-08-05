import { describe, expect, it, vi } from 'vitest'

import { installGuestPreviewEscapeShortcut } from './preview-shortcut'

describe('guest preview Escape shortcut', () => {
  it('forwards keyDown Escape without claiming the guest input event', () => {
    let onBeforeInput: ((event: unknown, input: { key: string; type: string }) => void) | undefined

    const guest = {
      on: vi.fn((eventName: string, listener: typeof onBeforeInput) => {
        expect(eventName).toBe('before-input-event')
        onBeforeInput = listener
      })
    }

    const sendEscapeRequest = vi.fn()
    const inputEvent = { preventDefault: vi.fn() }

    installGuestPreviewEscapeShortcut(guest, sendEscapeRequest)
    onBeforeInput?.(inputEvent, { key: 'Escape', type: 'keyDown' })

    expect(sendEscapeRequest).toHaveBeenCalledOnce()
    expect(inputEvent.preventDefault).not.toHaveBeenCalled()

    onBeforeInput?.(inputEvent, { key: 'Escape', type: 'keyUp' })
    onBeforeInput?.(inputEvent, { key: 'Enter', type: 'keyDown' })

    expect(sendEscapeRequest).toHaveBeenCalledOnce()
  })
})
