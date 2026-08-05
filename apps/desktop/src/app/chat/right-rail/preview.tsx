import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { SetTitlebarToolGroup } from '@/app/shell/titlebar-controls'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { PaneTab, PaneTabLabel } from '@/components/ui/pane-tab'
import { Tip } from '@/components/ui/tooltip'
import { translateNow, useI18n } from '@/i18n'
import { ESCAPE_PRIORITY, isTopEscapeLayer, pushEscapeLayer } from '@/lib/escape-layers'
import { formatCombo } from '@/lib/keybinds/combo'
import { cn } from '@/lib/utils'
import { $panesFlipped, $rightRailActiveTabId, selectRightRailTab } from '@/store/layout'
import { notifyError } from '@/store/notifications'
import {
  $previewReloadRequest,
  $previewTabs,
  closeOtherRightRailTabs,
  closeRightRail,
  closeRightRailTab,
  closeRightRailTabsToRight,
  type PreviewTarget
} from '@/store/preview'
import { $dirtyPreviewUrls } from '@/store/preview-edit'

import { PreviewPane } from './preview-pane'

export const PREVIEW_RAIL_MIN_WIDTH = '18rem'
export const PREVIEW_RAIL_MAX_WIDTH = '38rem'

interface ChatPreviewRailProps {
  onRestartServer?: (url: string, context?: string) => Promise<string>
  setTitlebarToolGroup?: SetTitlebarToolGroup
}

function tabLabelFor(target: PreviewTarget): string {
  // Artifacts are titled, not located — their label is the whole name.
  if (target.kind === 'artifact') {
    return target.label || translateNow('preview.tab')
  }

  const value = target.label || target.path || target.source || target.url
  const tail = value.split(/[\\/]/).filter(Boolean).at(-1)

  return tail || value || translateNow('preview.tab')
}

export function ChatPreviewRail({ onRestartServer, setTitlebarToolGroup }: ChatPreviewRailProps) {
  const { t } = useI18n()
  const previewReloadRequest = useStore($previewReloadRequest)
  const activeTabId = useStore($rightRailActiveTabId)
  const panesFlipped = useStore($panesFlipped)
  const previewTabs = useStore($previewTabs)
  const dirtyPreviewUrls = useStore($dirtyPreviewUrls)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const exitFullscreen = useCallback(() => setIsFullscreen(false), [])

  const requestExitFullscreen = useCallback(() => {
    if (isTopEscapeLayer(ESCAPE_PRIORITY.previewFullscreen)) {
      setIsFullscreen(false)
    }
  }, [])

  const tabs = useMemo(
    () =>
      previewTabs.map(({ id, target }) => {
        const label = tabLabelFor(target)

        return { id, label, target, tooltip: target.kind === 'artifact' ? label : target.path || target.url || label }
      }),
    [previewTabs]
  )

  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? tabs[0]

  useEffect(() => {
    if (activeTab && activeTab.id !== activeTabId) {
      selectRightRailTab(activeTab.id)
    }
  }, [activeTab, activeTabId])

  useEffect(() => {
    if (!isFullscreen) {
      return
    }

    return pushEscapeLayer(ESCAPE_PRIORITY.previewFullscreen)
  }, [isFullscreen])

  useEffect(() => {
    if (!isFullscreen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== 'Escape' ||
        !isTopEscapeLayer(ESCAPE_PRIORITY.previewFullscreen)
      ) {
        return
      }

      event.preventDefault()
      requestExitFullscreen()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isFullscreen, requestExitFullscreen])

  useEffect(() => {
    if (!isFullscreen) {
      return
    }

    return window.hermesDesktop?.onPreviewEscapeRequested?.(requestExitFullscreen)
  }, [isFullscreen, requestExitFullscreen])

  if (!activeTab) {
    return null
  }

  const isPreview = activeTab.target.kind === 'url'

  const openInBrowser = async () => {
    try {
      const bridge = window.hermesDesktop?.openPreviewInBrowser ?? window.hermesDesktop?.openExternal

      if (!bridge) {
        throw new Error('Desktop preview browser bridge is unavailable')
      }

      await bridge(activeTab.target.url)
    } catch (error) {
      notifyError(error, t.preview.unavailable)
    }
  }

  return (
    <aside
      aria-label={isFullscreen ? t.preview.tab : undefined}
      aria-modal={isFullscreen || undefined}
      className={cn(
        'flex h-full w-full min-w-0 flex-col overflow-hidden border-(--ui-stroke-tertiary) bg-(--ui-editor-surface-background) text-(--ui-text-tertiary)',
        isFullscreen ? 'fixed inset-0 z-(--z-modal) border-0' : panesFlipped ? 'relative border-r' : 'relative border-l'
      )}
      data-fullscreen={isFullscreen}
      role={isFullscreen ? 'dialog' : undefined}
      // Windows/WSLg paint Electron's Window Controls Overlay across our
      // titlebar band, so the editor-style tab strip (which normally sits IN that
      // band) would land under the fixed titlebar tools. --right-rail-top-inset
      // (set by AppShell only when the overlay is present) drops the rail one
      // titlebar-height so it opens below the band. 0px elsewhere → unchanged.
      style={{ paddingTop: 'var(--right-rail-top-inset, 0px)' }}
    >
      <div className="group/rail-tabs flex h-(--titlebar-height) shrink-0 bg-(--ui-sidebar-surface-background)">
        <div
          className="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
        >
          {tabs.map((tab, index) => {
            const active = tab.id === activeTab.id
            const hasOthers = tabs.length > 1
            const hasTabsToRight = index < tabs.length - 1
            const dirty = Boolean(dirtyPreviewUrls[tab.target.url])

            return (
              <ContextMenu key={tab.id}>
                <ContextMenuTrigger asChild>
                  <PaneTab active={active} dirty={dirty} onClose={() => closeRightRailTab(tab.id)}>
                    <Tip label={tab.tooltip}>
                      <PaneTabLabel
                        aria-selected={active}
                        as="button"
                        className="normal-case tracking-normal"
                        onClick={() => selectRightRailTab(tab.id)}
                        role="tab"
                        type="button"
                      >
                        {tab.target.kind === 'artifact' && (
                          <Codicon className="mr-1 shrink-0 text-[0.6875rem] opacity-70" name="sparkle" />
                        )}
                        {tab.label}
                      </PaneTabLabel>
                    </Tip>
                  </PaneTab>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => closeRightRailTab(tab.id)}>
                    {t.common.close}
                    <span className="ml-auto pl-4 text-(--ui-text-tertiary)">{formatCombo('mod+w')}</span>
                  </ContextMenuItem>
                  <ContextMenuItem disabled={!hasOthers} onSelect={() => closeOtherRightRailTabs(tab.id)}>
                    {t.preview.closeOthers}
                  </ContextMenuItem>
                  <ContextMenuItem disabled={!hasTabsToRight} onSelect={() => closeRightRailTabsToRight(tab.id)}>
                    {t.preview.closeToRight}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={closeRightRail}>{t.preview.closeAll}</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )
          })}
        </div>
        {isPreview && (
          <Tip label={t.preview.openInBrowser}>
            <Button
              aria-label={t.preview.openInBrowser}
              onClick={() => void openInBrowser()}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <Codicon name="globe" />
            </Button>
          </Tip>
        )}
        <Tip label={isFullscreen ? t.preview.exitFullscreen : t.preview.enterFullscreen}>
          <Button
            aria-label={isFullscreen ? t.preview.exitFullscreen : t.preview.enterFullscreen}
            aria-pressed={isFullscreen}
            onClick={() => setIsFullscreen(fullscreen => !fullscreen)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Codicon name={isFullscreen ? 'screen-normal' : 'screen-full'} />
          </Button>
        </Tip>
        <button
          aria-label={t.preview.closePane}
          className="mr-1.5 grid size-6 shrink-0 self-center place-items-center rounded-md text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-hover/rail-tabs:opacity-100 [-webkit-app-region:no-drag]"
          onClick={closeRightRail}
          type="button"
        >
          <Codicon name="close" size="0.75rem" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <PreviewPane
          embedded
          onRestartServer={isPreview ? onRestartServer : undefined}
          reloadRequest={previewReloadRequest}
          setTitlebarToolGroup={setTitlebarToolGroup}
          target={activeTab.target}
        />
      </div>
    </aside>
  )
}
