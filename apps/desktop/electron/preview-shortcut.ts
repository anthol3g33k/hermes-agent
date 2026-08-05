interface GuestPreviewInput {
  key: string
  type: string
}

interface GuestPreviewInputSource {
  on(eventName: string, listener: (event: unknown, input: GuestPreviewInput) => void): void
}

export function installGuestPreviewEscapeShortcut(guest: GuestPreviewInputSource, sendEscapeRequest: () => void): void {
  guest.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      sendEscapeRequest()
    }
  })
}
