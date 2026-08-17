/* eslint-disable @typescript-eslint/explicit-function-return-type */
;(() => {
  const maxAiExplanationTextLength = 10_000
  const maxReadAloudTextLength = 200
  const lookup = (word) => {
    const value = word?.trim()
    if (value && value.length <= 200) window.dictolEntry?.lookupWord(value)
  }

  const localAudio = new Audio()
  let generatedAudioUrl = ''
  const contextMenuHost = document.createElement('div')
  contextMenuHost.id = 'dictol-context-menu'
  contextMenuHost.style.cssText = 'position:fixed;display:none;z-index:2147483647;'

  const contextMenuRoot = contextMenuHost.attachShadow({ mode: 'closed' })
  const contextMenuStyle = document.createElement('style')
  contextMenuStyle.textContent = `
    :host { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .menu {
      display: flex;
      flex-direction: row;
      gap: 2px;
      padding: 4px;
      border: 1px solid rgba(255, 255, 255, .68);
      border-radius: 12px;
      background:
        linear-gradient(rgba(255, 255, 255, .16), rgba(255, 255, 255, .04)),
        rgba(246, 248, 245, .88);
      box-shadow: 0 8px 22px rgba(20, 24, 21, .15);
      -webkit-backdrop-filter: blur(22px) saturate(145%);
      backdrop-filter: blur(22px) saturate(145%);
    }
    button {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 30px;
      padding: 0 10px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #242824;
      font: 500 13px/1 inherit;
      white-space: nowrap;
      cursor: default;
    }
    button:hover { background: rgba(255, 255, 255, .52); }
    button:active { background: rgba(218, 224, 217, .62); }
    button:disabled { opacity: .38; cursor: not-allowed; }
    svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    @media (prefers-color-scheme: dark) {
      :host .menu {
        border-color: rgba(255, 255, 255, .14);
        background:
          linear-gradient(rgba(255, 255, 255, .07), transparent),
          rgba(30, 34, 30, .88);
        box-shadow: 0 10px 26px rgba(0, 0, 0, .34);
      }
      :host button { color: #ecefeb; }
      :host button:hover { background: rgba(255, 255, 255, .11); }
      :host button:active { background: rgba(255, 255, 255, .17); }
    }
  `
  const contextMenu = document.createElement('div')
  contextMenu.className = 'menu'

  const hideContextMenu = () => {
    contextMenuHost.style.display = 'none'
  }

  const releaseGeneratedAudioUrl = () => {
    if (!generatedAudioUrl) return
    URL.revokeObjectURL(generatedAudioUrl)
    generatedAudioUrl = ''
  }

  // 监听器只挂一次，避免连续播放时累积；releaseGeneratedAudioUrl 幂等，重复触发无副作用
  localAudio.addEventListener('ended', releaseGeneratedAudioUrl)
  localAudio.addEventListener('error', releaseGeneratedAudioUrl)

  const playAudioData = async (audioData) => {
    const audioBytes = audioData instanceof ArrayBuffer ? new Uint8Array(audioData) : audioData
    if (!audioBytes || audioBytes.byteLength === 0) return
    const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' })
    releaseGeneratedAudioUrl()
    generatedAudioUrl = URL.createObjectURL(audioBlob)

    if (!localAudio.paused) localAudio.pause()
    localAudio.src = generatedAudioUrl
    try {
      await localAudio.play()
    } catch (error) {
      // 快速连续点击时，上一次播放会被 pause() 以 AbortError 中断，属正常现象，不视为失败
      if (error?.name !== 'AbortError') throw error
    }
  }

  const readAloud = async (text, voice) => {
    const normalizedText = text?.trim?.() ?? ''
    if (!normalizedText || normalizedText.length > maxReadAloudTextLength) return

    try {
      const audioData = await window.dictolEntry.readAloud(normalizedText, voice)
      await playAudioData(audioData)
    } catch (error) {
      releaseGeneratedAudioUrl()
      window.dictolEntry?.showToast?.({
        type: 'error',
        message: '朗读失败，请检查网络连接后重试。'
      })
    }
  }
  window.playText = readAloud

  const createMenuButton = (label, icon, action) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.innerHTML = `${icon}<span>${label}</span>`
    button.addEventListener('pointerdown', (event) => event.preventDefault())
    button.addEventListener('click', () => {
      action()
      hideContextMenu()
    })
    return button
  }

  let contextMenuText = ''
  const copyButton = createMenuButton(
    '复制',
    '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    () => window.dictolEntry?.copyText(contextMenuText)
  )
  const lookupButton = createMenuButton(
    '查词',
    '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>',
    () => lookup(contextMenuText)
  )
  const readAloudButton = createMenuButton(
    '朗读',
    '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>',
    () => readAloud(contextMenuText)
  )
  const explainWithAiButton = createMenuButton(
    'AI 解释',
    '<svg viewBox="0 0 24 24"><path d="m12 3-1.9 5.1L5 10l5.1 1.9L12 17l1.9-5.1L19 10l-5.1-1.9L12 3Z"></path><path d="m19 15 .7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7L19 15Z"></path></svg>',
    () => window.dictolEntry?.explainWithAi?.(contextMenuText)
  )
  const setAiExplanationEnabled = (enabled) => {
    explainWithAiButton.style.display = enabled === true ? 'flex' : 'none'
  }
  setAiExplanationEnabled(false)
  const refreshAiExplanationAvailability = () => {
    const availability = window.dictolEntry?.canExplainWithAi?.()
    if (!availability) return
    availability.then(setAiExplanationEnabled).catch(() => setAiExplanationEnabled(false))
  }
  contextMenu.append(copyButton, lookupButton, readAloudButton, explainWithAiButton)
  contextMenuRoot.append(contextMenuStyle, contextMenu)

  refreshAiExplanationAvailability()
  window.dictolEntry?.onAiExplanationAvailabilityChanged?.(setAiExplanationEnabled)

  const showContextMenu = (x, y, text, centered = false, aboveY = y) => {
    contextMenuText = text
    lookupButton.disabled = text.length > 200
    readAloudButton.disabled = text.length > maxReadAloudTextLength
    explainWithAiButton.disabled = text.length > maxAiExplanationTextLength
    refreshAiExplanationAvailability()
    if (!contextMenuHost.isConnected) document.documentElement.append(contextMenuHost)
    contextMenuHost.style.left = `${x}px`
    contextMenuHost.style.top = `${y}px`
    contextMenuHost.style.display = 'block'
    requestAnimationFrame(() => {
      const bounds = contextMenuHost.getBoundingClientRect()
      const left = centered ? x - bounds.width / 2 : x
      const top = y + bounds.height > innerHeight - 8 ? aboveY - bounds.height : y
      contextMenuHost.style.left = `${Math.max(8, Math.min(left, innerWidth - bounds.width - 8))}px`
      contextMenuHost.style.top = `${Math.max(8, Math.min(top, innerHeight - bounds.height - 8))}px`
    })
  }
  const showContextMenuForSelection = () => {
    const selection = window.getSelection()
    const text = selection?.toString().trim() ?? ''
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !text) {
      hideContextMenu()
      return
    }
    const bounds = selection.getRangeAt(0).getBoundingClientRect()
    if (bounds.width === 0 && bounds.height === 0) {
      hideContextMenu()
      return
    }
    showContextMenu(bounds.left + bounds.width / 2, bounds.bottom + 8, text, true, bounds.top - 8)
  }

  document.addEventListener(
    'contextmenu',
    (event) => {
      const text = window.getSelection()?.toString().trim() ?? ''
      if (!text) {
        hideContextMenu()
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      showContextMenu(event.clientX, event.clientY, text)
    },
    true
  )
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.target !== contextMenuHost) hideContextMenu()
    },
    true
  )
  document.addEventListener(
    'pointerup',
    (event) => {
      if (event.target !== contextMenuHost) setTimeout(showContextMenuForSelection, 0)
    },
    true
  )
  document.addEventListener(
    'keyup',
    (event) => {
      if (event.shiftKey || event.key.startsWith('Arrow')) {
        setTimeout(showContextMenuForSelection, 0)
      }
    },
    true
  )
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') hideContextMenu()
    },
    true
  )
  addEventListener('blur', hideContextMenu)
  addEventListener('scroll', hideContextMenu, true)

  // 词条跳转
  document.addEventListener(
    'click',
    (event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      const href = anchor?.getAttribute('href')?.trim()
      if (!href || !/^entry:\/\//i.test(href)) return
      event.preventDefault()
      event.stopPropagation()
      const target = href.replace(/^entry:\/\/\/?/i, '').split('#', 1)[0]
      try {
        lookup(decodeURIComponent(target))
      } catch {
        lookup(target)
      }
    },
    true
  )
  // 播放内置音频
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented) return
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    const href = anchor?.href
    if (
      !href ||
      !/^dictol-resource:\/\//i.test(href) ||
      !/[.](?:mp3|wav|ogg|oga|spx|m4a)(?:[?#]|$)/i.test(href)
    ) {
      return
    }
    event.preventDefault()
    releaseGeneratedAudioUrl()
    localAudio.pause()
    localAudio.src = href
    localAudio.play().catch((error) =>
      window.dictolEntry?.showToast?.({
        type: 'error',
        message: `Failed to play dictionary audio: ${error.message}`
      })
    )
  })
  // -------------------------------------------------------------------------
})()
