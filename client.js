/**
 * Client half of the plugin-inspector bundle: one section under a plugin's page
 * on the Plugins screen. It has two read-only views of the plugin:
 *
 * - Declaration: the exact YAML patch entries that declare it.
 * - Code: the installed files behind it (manifest, Host entry, browser bundle,
 *   shipped sources, README, types).
 *
 * The declaration is read when the page opens; the code is read only when the
 * Code tab is first shown, so opening a plugin page stays cheap.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-inspector',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'pluginInspector'
    const ENDPOINT = '/plugin-inspector'
    const MAX_PRE_HEIGHT = 320
    const MAX_FILE_HEIGHT = 420
    /** Visited pages keep their payload for the page lifetime; bound that cache. */
    const MAX_CACHE_ENTRIES = 10

    const zh = {
      section: '插件剖析',
      hint: '只读查看该插件的声明层，以及安装目录里真正运行的代码文件。',
      tabDeclaration: '声明',
      tabCode: '代码',
      loading: '正在读取插件信息…',
      loadingCode: '正在读取代码…',
      refresh: '刷新',
      retry: '重试',
      copy: '复制',
      copied: '已复制',
      profileLayer: 'Profile patch',
      bundleLayer: 'Bundle patch',
      showFile: '查看完整文件',
      hideFile: '收起完整文件',
      truncated: '文件较大，已截断显示。',
      empty: '在 Profile patch 和已安装 bundle 的 patch 中都没有找到该插件的声明。',
      profilePath: 'Profile patch',
      problems: '读取过程中的问题',
      unavailable: '当前运行方式（file://）无法访问本地文件。',
      noCode: '没有找到可读取的代码文件。',
      show: '展开',
      hide: '收起',
      mdRendered: '渲染',
      mdRaw: '原文',
      kindHost: '入口',
      kindClient: '浏览器端',
      kindManifest: '清单',
      kindSource: '源码',
      kindReadme: '说明',
      kindTypes: '类型',
    }

    const en = {
      section: 'Plugin Inspector',
      hint: 'Read-only view of the declaration layers and the code files installed behind this plugin.',
      tabDeclaration: 'Declaration',
      tabCode: 'Code',
      loading: 'Reading plugin information\u2026',
      loadingCode: 'Reading the code\u2026',
      refresh: 'Refresh',
      retry: 'Retry',
      copy: 'Copy',
      copied: 'Copied',
      profileLayer: 'Profile patch',
      bundleLayer: 'Bundle patch',
      showFile: 'Show the whole file',
      hideFile: 'Hide the whole file',
      truncated: 'Large file: only the beginning is shown.',
      empty: 'No declaration for this plugin was found in the profile patch or in an installed bundle patch.',
      profilePath: 'Profile patch',
      problems: 'Problems while reading',
      unavailable: 'This runtime (file://) cannot reach the local files.',
      noCode: 'No readable code file was found.',
      show: 'Show',
      hide: 'Hide',
      mdRendered: 'Rendered',
      mdRaw: 'Raw',
      kindHost: 'Entry',
      kindClient: 'Browser',
      kindManifest: 'Manifest',
      kindSource: 'Source',
      kindReadme: 'Readme',
      kindTypes: 'Types',
    }

    const S = {
      section: {
        marginTop: 24,
        paddingTop: 20,
        borderTop: '1px solid var(--dsw-alias-border-l1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      },
      head: { display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' },
      heading: { margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: 'var(--dsw-alias-label-primary)' },
      hint: { margin: '4px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)' },
      button: {
        flex: 'none',
        appearance: 'none',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: 8,
        padding: '4px 10px',
        fontSize: 12,
        lineHeight: 1.4,
        cursor: 'pointer',
        font: 'inherit',
      },
      tabs: { display: 'flex', gap: 6, alignItems: 'center' },
      tab: {
        appearance: 'none',
        border: '1px solid transparent',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        borderRadius: 8,
        padding: '4px 10px',
        fontSize: 12,
        lineHeight: 1.4,
        cursor: 'pointer',
        font: 'inherit',
      },
      tabActive: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontWeight: 600,
      },
      card: {
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      bar: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      badge: {
        flex: 'none',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        color: 'var(--dsw-alias-label-secondary)',
        textTransform: 'uppercase',
      },
      path: {
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        direction: 'rtl',
        textAlign: 'left',
        fontSize: 11,
        color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      size: {
        flex: 'none',
        fontSize: 11,
        color: 'var(--dsw-alias-label-secondary)',
        fontVariantNumeric: 'tabular-nums',
      },
      pre: {
        margin: 0,
        padding: '10px 12px',
        maxHeight: MAX_PRE_HEIGHT,
        overflow: 'auto',
        fontSize: 12,
        lineHeight: 1.55,
        tabSize: 2,
        whiteSpace: 'pre',
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-base)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      preFull: {
        margin: 0,
        padding: '10px 12px',
        maxHeight: MAX_FILE_HEIGHT,
        overflow: 'auto',
        fontSize: 12,
        lineHeight: 1.55,
        tabSize: 2,
        whiteSpace: 'pre',
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-base)',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      footer: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      link: {
        appearance: 'none',
        border: 'none',
        padding: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-brand-primary)',
        fontSize: 12,
        cursor: 'pointer',
        font: 'inherit',
      },
      muted: { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)' },
      error: { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-state-error-primary)' },
      inlineCode: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        color: 'var(--dsw-alias-label-primary)',
      },
      list: { display: 'flex', flexDirection: 'column', gap: 10 },
      packageRow: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
      packageName: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      modes: { display: 'flex', flex: 'none', gap: 2, alignItems: 'center' },
      modeButton: {
        appearance: 'none',
        border: '1px solid transparent',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        borderRadius: 7,
        padding: '2px 7px',
        fontSize: 11,
        lineHeight: 1.4,
        cursor: 'pointer',
        font: 'inherit',
      },
      modeActive: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontWeight: 600,
      },
      mdBody: {
        padding: '10px 12px',
        maxHeight: MAX_FILE_HEIGHT,
        overflow: 'auto',
        background: 'var(--dsw-alias-bg-base)',
      },
    }

    /**
     * Cache one entry per subject, holding the declaration and code payloads
     * separately. Opening a page fetches the declaration only; the code entry
     * appears when the Code tab is first shown.
     */
    const cache = new Map()

    function touchEntry(key) {
      let entry = cache.get(key)
      if (entry) cache.delete(key)
      else entry = {}
      cache.set(key, entry)
      while (cache.size > MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value
        if (oldest === key) break
        cache.delete(oldest)
      }
      return entry
    }

    function invalidate(key, slot) {
      const entry = cache.get(key)
      if (entry) delete entry[slot]
    }

    function loadSection(target, includeCode) {
      const entry = touchEntry(target.key)
      const slot = includeCode ? 'code' : 'declaration'
      if (entry[slot]) return entry[slot]
      const promise = fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ ...target.body, includeCode }),
        credentials: 'same-origin',
      })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json()
        })
        .then((payload) => {
          if (!payload || payload.ok !== true) {
            const first = payload && Array.isArray(payload.errors) && payload.errors[0]
            throw new Error(first || 'The inspection request failed.')
          }
          return payload
        })
      entry[slot] = promise
      promise.catch(() => {
        if (entry[slot] === promise) delete entry[slot]
      })
      return promise
    }

    async function copyText(text) {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(text)
          return true
        }
      } catch {
        // Fall through to the textarea path.
      }
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(area)
        return ok
      } catch {
        return false
      }
    }

    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return ''
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    function kindLabel(t, kind) {
      const keys = {
        host: 'kindHost',
        client: 'kindClient',
        manifest: 'kindManifest',
        source: 'kindSource',
        readme: 'kindReadme',
        types: 'kindTypes',
      }
      return t(keys[kind] || 'kindSource')
    }

    // ---- syntax highlighting -------------------------------------------------
    // No highlighter package ships with the harness client, so this is a small
    // tokenizer per language. It emits escaped HTML with theme-token classes;
    // very large files keep a highlighted head and an escaped plain tail.
    const HIGHLIGHT_LIMIT = 120 * 1024
    const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    const JS_KEYWORDS = new Set([
      'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
      'break', 'continue', 'new', 'class', 'extends', 'super', 'this', 'import', 'from', 'export', 'default',
      'async', 'await', 'yield', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of',
      'delete', 'void', 'static', 'get', 'set', 'interface', 'type', 'implements', 'readonly', 'public',
      'private', 'protected', 'declare', 'namespace', 'enum', 'abstract', 'as', 'satisfies',
    ])

    const HIGHLIGHT_CSS = [
      '.dsh-pi-code{color:var(--dsw-alias-label-primary)}',
      '.dsh-pi-k{color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dsh-pi-s{color:var(--dsw-alias-state-success-primary)}',
      '.dsh-pi-n{color:var(--dsw-alias-state-warn-primary)}',
      '.dsh-pi-b{color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dsh-pi-c{color:var(--dsw-alias-label-secondary);font-style:italic}',
      '.dsh-pi-t{color:var(--dsw-alias-state-warn-primary)}',
      '.dsh-pi-p{color:var(--dsw-alias-label-secondary)}',
      '.dsh-pi-h{color:var(--dsw-alias-label-primary);font-weight:600}',
      '.dsh-pi-l{color:var(--dsw-alias-brand-primary);text-decoration:underline}',
      '.dsh-pi-strong{color:var(--dsw-alias-label-primary);font-weight:600}',
      '.dsh-pi-md{color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:1.6;word-break:break-word}',
      '.dsh-pi-md h1,.dsh-pi-md h2,.dsh-pi-md h3,.dsh-pi-md h4,.dsh-pi-md h5,.dsh-pi-md h6{margin:0.8em 0 0.4em;line-height:1.3;font-weight:600}',
      '.dsh-pi-md h1{font-size:16px}.dsh-pi-md h2{font-size:14.5px}.dsh-pi-md h3{font-size:13.5px}',
      '.dsh-pi-md h4,.dsh-pi-md h5,.dsh-pi-md h6{font-size:12.5px}',
      '.dsh-pi-md p{margin:0.5em 0}',
      '.dsh-pi-md ul,.dsh-pi-md ol{margin:0.5em 0;padding-left:1.5em}',
      '.dsh-pi-md li{margin:0.2em 0}',
      '.dsh-pi-md code{padding:0.1em 0.3em;border-radius:4px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.95em}',
      '.dsh-pi-md pre{margin:0.6em 0;padding:8px 10px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base)}',
      '.dsh-pi-md pre code{padding:0;background:transparent}',
      '.dsh-pi-md blockquote{margin:0.6em 0;padding:0.2em 0.8em;border-left:3px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
      '.dsh-pi-md a{color:var(--dsw-alias-brand-primary)}',
      '.dsh-pi-md hr{margin:1em 0;border:0;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-pi-md table{margin:0.6em 0;border-collapse:collapse;font-size:12px}',
      '.dsh-pi-md th,.dsh-pi-md td{padding:4px 8px;border:1px solid var(--dsw-alias-border-l1);text-align:left;vertical-align:top}',
      '.dsh-pi-md th{background:var(--dsw-alias-bg-layer-2);font-weight:600}',
    ].join('')

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character])
    }

    function mark(kind, value) {
      return `<span class="dsh-pi-${kind}">${escapeHtml(value)}</span>`
    }

    function languageOf(file) {
      const path = String((file && (file.rel || file.path)) || '').toLowerCase()
      if (path.endsWith('.json')) return 'json'
      if (path.endsWith('.md') || path.endsWith('.markdown')) return 'md'
      if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml'
      if (/\.(js|mjs|cjs|ts|tsx|jsx)$/.test(path)) return 'js'
      return 'text'
    }

    function highlight(text, lang) {
      if (typeof text !== 'string' || text === '') return ''
      let head = text
      let tail = ''
      if (text.length > HIGHLIGHT_LIMIT) {
        const cut = text.lastIndexOf('\n', HIGHLIGHT_LIMIT)
        head = text.slice(0, cut > 0 ? cut : HIGHLIGHT_LIMIT)
        tail = text.slice(head.length)
      }
      let html
      if (lang === 'yaml') html = highlightYaml(head)
      else if (lang === 'json') html = highlightJson(head)
      else if (lang === 'js') html = highlightJs(head)
      else if (lang === 'md') html = highlightMarkdown(head)
      else html = escapeHtml(head)
      return tail ? html + escapeHtml(tail) : html
    }

    function highlightYaml(text) {
      const lines = text.split('\n')
      const out = []
      let blockIndent = -1
      for (const line of lines) {
        const trimmed = line.trim()
        const indent = line.length - line.trimStart().length
        if (blockIndent >= 0) {
          if (trimmed === '' || indent > blockIndent) {
            out.push(mark('s', line))
            continue
          }
          blockIndent = -1
        }
        out.push(yamlLine(line, () => {
          blockIndent = indent
        }))
      }
      return out.join('\n')

      function yamlLine(line, onBlock) {
        const lead = line.match(/^[ \t]*/)[0]
        let rest = line.slice(lead.length)
        let html = escapeHtml(lead)
        if (rest === '') return html
        if (rest.startsWith('#')) return html + mark('c', rest)
        if (/^(---|\.\.\.)\s*$/.test(rest)) return html + mark('p', rest)
        if (rest === '-') return html + mark('p', '-')
        if (/^-\s/.test(rest)) {
          html += mark('p', '- ')
          rest = rest.slice(2)
        }
        const key = /^((?:"[^"]*"|'[^']*'|[^\s:#"'[\]{},]+))(?=\s*:)/.exec(rest)
        if (key) {
          html += mark('k', key[1])
          rest = rest.slice(key[1].length)
          const colon = /^\s*:/.exec(rest)
          html += escapeHtml(colon[0].slice(0, -1)) + mark('p', ':')
          rest = rest.slice(colon[0].length)
        }
        const space = rest.match(/^[ \t]*/)[0]
        html += escapeHtml(space)
        rest = rest.slice(space.length)
        if (rest === '') return html
        const commentAt = yamlCommentIndex(rest)
        let value = commentAt >= 0 ? rest.slice(0, commentAt) : rest
        const comment = commentAt >= 0 ? rest.slice(commentAt) : ''
        const trailing = value.match(/\s*$/)[0]
        value = value.slice(0, value.length - trailing.length)
        if (value !== '') html += yamlValue(value, onBlock)
        html += escapeHtml(trailing)
        if (comment !== '') html += mark('c', comment)
        return html
      }

      function yamlValue(value, onBlock) {
        if (/^[|>][+-]?\d*$/.test(value)) {
          onBlock()
          return mark('p', value)
        }
        if (/^!!\S*/.test(value)) return mark('t', value)
        if (/^[&*][^\s]+/.test(value)) return mark('t', value)
        if (/^"(?:[^"\\]|\\.)*"$/.test(value) || /^'(?:[^']|'')*'$/.test(value)) return mark('s', value)
        if (/^(true|false|null|~|yes|no|on|off)$/i.test(value)) return mark('b', value)
        if (/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value)) return mark('n', value)
        return escapeHtml(value)
      }
    }

    function yamlCommentIndex(text) {
      let quote = ''
      for (let index = 0; index < text.length; index += 1) {
        const character = text[index]
        if (quote) {
          if (character === '\\' && quote === '"') {
            index += 1
            continue
          }
          if (character === quote) quote = ''
          continue
        }
        if (character === '"' || character === "'") {
          quote = character
          continue
        }
        if (character === '#' && (index === 0 || /\s/.test(text[index - 1]))) return index
      }
      return -1
    }

    function highlightJson(text) {
      const out = []
      let index = 0
      const length = text.length
      while (index < length) {
        const character = text[index]
        if (character === '"') {
          let end = index + 1
          while (end < length) {
            if (text[end] === '\\') {
              end += 2
              continue
            }
            if (text[end] === '"') {
              end += 1
              break
            }
            end += 1
          }
          const value = text.slice(index, end)
          let next = end
          while (next < length && /\s/.test(text[next])) next += 1
          out.push(mark(text[next] === ':' ? 'k' : 's', value))
          index = end
          continue
        }
        if (character === '-' || (character >= '0' && character <= '9')) {
          const match = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index))
          if (match) {
            out.push(mark('n', match[0]))
            index += match[0].length
            continue
          }
        }
        if (text.startsWith('true', index) || text.startsWith('false', index) || text.startsWith('null', index)) {
          const word = text.startsWith('true', index) ? 'true' : text.startsWith('false', index) ? 'false' : 'null'
          out.push(mark('b', word))
          index += word.length
          continue
        }
        if ('{}[],:'.includes(character)) {
          out.push(mark('p', character))
          index += 1
          continue
        }
        out.push(escapeHtml(character))
        index += 1
      }
      return out.join('')
    }

    function highlightJs(text) {
      const out = []
      let index = 0
      const length = text.length
      while (index < length) {
        const character = text[index]
        const next = text[index + 1]
        if (character === '/' && next === '/') {
          let end = text.indexOf('\n', index)
          if (end < 0) end = length
          out.push(mark('c', text.slice(index, end)))
          index = end
          continue
        }
        if (character === '/' && next === '*') {
          let end = text.indexOf('*/', index + 2)
          end = end < 0 ? length : end + 2
          out.push(mark('c', text.slice(index, end)))
          index = end
          continue
        }
        if (character === '"' || character === "'" || character === '`') {
          let end = index + 1
          while (end < length) {
            if (text[end] === '\\') {
              end += 2
              continue
            }
            if (text[end] === character) {
              end += 1
              break
            }
            if (character !== '`' && text[end] === '\n') break
            end += 1
          }
          out.push(mark('s', text.slice(index, end)))
          index = end
          continue
        }
        if (character >= '0' && character <= '9') {
          const match = /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(index))
          if (match) {
            out.push(mark('n', match[0]))
            index += match[0].length
            continue
          }
        }
        if (/[A-Za-z_$]/.test(character)) {
          let end = index + 1
          while (end < length && /[A-Za-z0-9_$]/.test(text[end])) end += 1
          const word = text.slice(index, end)
          if (JS_KEYWORDS.has(word)) {
            out.push(mark('k', word))
            index = end
            continue
          }
          if (word === 'true' || word === 'false' || word === 'null' || word === 'undefined' || word === 'NaN' || word === 'Infinity') {
            out.push(mark('b', word))
            index = end
            continue
          }
          let probe = end
          while (probe < length && /\s/.test(text[probe])) probe += 1
          let before = index - 1
          while (before >= 0 && /\s/.test(text[before])) before -= 1
          if (text[probe] === ':' && (text[before] === '{' || text[before] === ',')) {
            out.push(mark('k', word))
            index = end
            continue
          }
          out.push(escapeHtml(word))
          index = end
          continue
        }
        if ('{}[]().,;:+-*/%=<>!&|?~^'.includes(character)) {
          out.push(mark('p', character))
          index += 1
          continue
        }
        out.push(escapeHtml(character))
        index += 1
      }
      return out.join('')
    }

    function highlightMarkdown(text) {
      const lines = text.split('\n')
      const out = []
      let fence = false
      for (const line of lines) {
        const trimmed = line.trim()
        if (/^(```|~~~)/.test(trimmed)) {
          fence = !fence
          out.push(mark('p', line))
          continue
        }
        if (fence) {
          out.push(mark('s', line))
          continue
        }
        const heading = /^(#{1,6})(\s+)(.*)$/.exec(line)
        if (heading) {
          out.push(mark('p', heading[1]) + escapeHtml(heading[2]) + mark('h', heading[3]))
          continue
        }
        const quote = /^(\s*>+\s?)(.*)$/.exec(line)
        if (quote) {
          out.push(escapeHtml(quote[1]) + mark('c', quote[2]))
          continue
        }
        const list = /^(\s*)([-*+]|\d+\.)(\s+)(.*)$/.exec(line)
        if (list) {
          out.push(escapeHtml(list[1]) + mark('p', list[2]) + escapeHtml(list[3]) + markdownInline(list[4]))
          continue
        }
        out.push(markdownInline(line))
      }
      return out.join('\n')
    }

    function markdownInline(text) {
      let out = ''
      let index = 0
      while (index < text.length) {
        if (text.startsWith('**', index)) {
          const end = text.indexOf('**', index + 2)
          if (end > index) {
            out += mark('strong', text.slice(index, end + 2))
            index = end + 2
            continue
          }
        }
        if (text[index] === '`') {
          const end = text.indexOf('`', index + 1)
          if (end > index) {
            out += mark('s', text.slice(index, end + 1))
            index = end + 1
            continue
          }
        }
        if (text[index] === '[') {
          const labelEnd = text.indexOf('](', index)
          if (labelEnd > index) {
            const targetEnd = text.indexOf(')', labelEnd + 2)
            if (targetEnd > labelEnd) {
              out += mark('l', text.slice(index, targetEnd + 1))
              index = targetEnd + 1
              continue
            }
          }
        }
        out += escapeHtml(text[index])
        index += 1
      }
      return out
    }

    function safeUrl(value) {
      const url = String(value || '').trim()
      if (/^(https?:|mailto:|#|\/|\.\.?\/)/i.test(url)) return url
      return ''
    }

    function splitTableRow(line) {
      let text = line.trim()
      if (text.startsWith('|')) text = text.slice(1)
      if (text.endsWith('|')) text = text.slice(0, -1)
      return text.split('|').map((cell) => cell.trim())
    }

    function renderMarkdown(source) {
      const lines = String(source || '').split('\n')
      const out = []
      const paragraph = []
      let index = 0

      const flush = () => {
        if (paragraph.length === 0) return
        out.push(`<p>${mdInline(paragraph.join('\n'))}</p>`)
        paragraph.length = 0
      }

      while (index < lines.length) {
        const line = lines[index]
        if (!line.trim()) {
          flush()
          index += 1
          continue
        }

        const fence = /^\s*(```+|~~~+)\s*([\w-]*)\s*$/.exec(line)
        if (fence) {
          flush()
          const marker = fence[1][0]
          const code = []
          index += 1
          while (index < lines.length && !new RegExp('^\\s*' + (marker === '`' ? '```' : '~~~')).test(lines[index])) {
            code.push(lines[index])
            index += 1
          }
          index += 1
          out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
          continue
        }

        const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
        if (heading) {
          flush()
          const level = heading[1].length
          out.push(`<h${level}>${mdInline(heading[2])}</h${level}>`)
          index += 1
          continue
        }

        if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
          flush()
          out.push('<hr />')
          index += 1
          continue
        }

        if (/^\s{0,3}>/.test(line)) {
          flush()
          const inner = []
          while (index < lines.length && /^\s{0,3}>/.test(lines[index])) {
            inner.push(lines[index].replace(/^\s{0,3}>\s?/, ''))
            index += 1
          }
          out.push(`<blockquote>${renderMarkdown(inner.join('\n'))}</blockquote>`)
          continue
        }

        if (
          line.includes('|') &&
          index + 1 < lines.length &&
          /^\s*\|?\s*:?-{2,}/.test(lines[index + 1]) &&
          lines[index + 1].includes('|')
        ) {
          flush()
          const header = splitTableRow(line)
          const align = splitTableRow(lines[index + 1]).map((cell) => {
            const left = cell.startsWith(':')
            const right = cell.endsWith(':')
            if (left && right) return 'center'
            if (right) return 'right'
            if (left) return 'left'
            return ''
          })
          index += 2
          const rows = []
          while (index < lines.length && lines[index].trim() !== '' && lines[index].includes('|')) {
            rows.push(splitTableRow(lines[index]))
            index += 1
          }
          const head = header
            .map((cell, at) => `<th${align[at] ? ` style="text-align:${align[at]}"` : ''}>${mdInline(cell)}</th>`)
            .join('')
          const body = rows
            .map(
              (row) =>
                `<tr>${row
                  .map((cell, at) => `<td${align[at] ? ` style="text-align:${align[at]}"` : ''}>${mdInline(cell)}</td>`)
                  .join('')}</tr>`,
            )
            .join('')
          out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`)
          continue
        }

        const listItem = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line)
        if (listItem) {
          flush()
          const ordered = /\d+\./.test(listItem[2])
          const items = []
          while (index < lines.length) {
            const item = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[index])
            if (!item || /\d+\./.test(item[2]) !== ordered) break
            items.push(item[3])
            index += 1
          }
          const tag = ordered ? 'ol' : 'ul'
          out.push(`<${tag}>${items.map((item) => `<li>${mdInline(item)}</li>`).join('')}</${tag}>`)
          continue
        }

        paragraph.push(line)
        index += 1
      }

      flush()
      return out.join('\n')
    }

    function mdInline(text) {
      let out = ''
      let index = 0
      while (index < text.length) {
        const character = text[index]
        if (character === '\\' && index + 1 < text.length) {
          out += escapeHtml(text[index + 1])
          index += 2
          continue
        }
        const image = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(text.slice(index))
        if (image) {
          const url = safeUrl(image[2])
          if (url) {
            out += `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(image[1] || 'image')}</a>`
          } else {
            out += escapeHtml(image[1] || 'image')
          }
          index += image[0].length
          continue
        }
        if (character === '`') {
          const end = text.indexOf('`', index + 1)
          if (end > index) {
            out += `<code>${escapeHtml(text.slice(index + 1, end))}</code>`
            index = end + 1
            continue
          }
        }
        if (text.startsWith('**', index)) {
          const end = text.indexOf('**', index + 2)
          if (end > index) {
            out += `<strong>${mdInline(text.slice(index + 2, end))}</strong>`
            index = end + 2
            continue
          }
        }
        if (character === '*') {
          const end = text.indexOf('*', index + 1)
          if (end > index) {
            out += `<em>${mdInline(text.slice(index + 1, end))}</em>`
            index = end + 1
            continue
          }
        }
        if (character === '[') {
          const labelEnd = text.indexOf('](', index + 1)
          if (labelEnd > index) {
            const targetEnd = text.indexOf(')', labelEnd + 2)
            if (targetEnd > labelEnd) {
              const label = text.slice(index + 1, labelEnd)
              const url = safeUrl(text.slice(labelEnd + 2, targetEnd))
              if (url) {
                out += `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${mdInline(label)}</a>`
              } else {
                out += mdInline(label)
              }
              index = targetEnd + 1
              continue
            }
          }
        }
        const hardBreak = /^ {2,}\n/.exec(text.slice(index))
        if (hardBreak) {
          out += '<br />'
          index += hardBreak[0].length
          continue
        }
        out += escapeHtml(character)
        index += 1
      }
      return out
    }

    function MarkdownView(props) {
      const html = React.useMemo(() => renderMarkdown(props.text), [props.text])
      return h('div', {
        className: 'dsh-pi-md',
        style: props.style,
        dangerouslySetInnerHTML: { __html: html },
      })
    }

    function HighlightedCode(props) {
      const html = React.useMemo(() => highlight(props.text, props.lang || 'text'), [props.text, props.lang])
      return h('pre', {
        className: 'dsh-pi-code',
        style: props.style,
        spellCheck: false,
        dangerouslySetInnerHTML: { __html: html },
      })
    }

    function rowIdsOf(pkg) {
      const ids = []
      const rows = pkg && Array.isArray(pkg.rows) ? pkg.rows : []
      for (const row of rows) {
        if (row && typeof row.rowId === 'string') ids.push(row.rowId)
        if (row && typeof row.entryId === 'string') ids.push(row.entryId)
      }
      return ids
    }

    function targetOf(subject) {
      if (!subject || typeof subject !== 'object') return null
      const pkg = subject.pkg
      if (subject.kind === 'bundle' && pkg && typeof pkg.name === 'string' && pkg.name !== '') {
        return {
          key: `bundle:${pkg.name}`,
          body: { kind: 'bundle', bundle: pkg.name, ids: rowIdsOf(pkg) },
        }
      }
      if (subject.kind === 'row' && pkg && typeof pkg.name === 'string' && pkg.name !== '') {
        const row = subject.row && typeof subject.row === 'object' ? subject.row : {}
        const rowId = typeof row.rowId === 'string' ? row.rowId : typeof row.id === 'string' ? row.id : undefined
        const entryId = typeof row.entryId === 'string' ? row.entryId : typeof row.patchId === 'string' ? row.patchId : undefined
        const moduleName = typeof row.moduleName === 'string' ? row.moduleName : undefined
        if (!rowId && !entryId && !moduleName) return null
        return {
          key: `row:${pkg.name}:${entryId || moduleName || rowId}`,
          body: {
            kind: 'row',
            bundle: pkg.name,
            rowId,
            entryId,
            moduleName,
            ids: [rowId, entryId].filter((value) => typeof value === 'string'),
          },
        }
      }
      if (subject.kind === 'item' && typeof subject.id === 'string' && subject.id !== '') {
        return { key: `item:${subject.id}`, body: { kind: 'item', entryId: subject.id } }
      }
      return null
    }

    function TextBlock(props) {
      const { t, unit, copied, onCopy } = props
      const [showFile, setShowFile] = React.useState(false)
      const file = typeof props.file === 'string' ? props.file : ''
      const hasFile = file !== '' && file !== unit.yaml
      return h(
        'div',
        { style: S.card },
        h(
          'div',
          { style: S.bar },
          h('span', { style: S.badge }, unit.layer === 'profile' ? t('profileLayer') : t('bundleLayer')),
          h('span', { style: S.path, title: unit.path }, unit.path),
          h(
            'button',
            { type: 'button', style: S.button, onClick: () => onCopy(unit.yaml) },
            copied ? t('copied') : t('copy'),
          ),
        ),
        h(HighlightedCode, { text: unit.yaml, lang: 'yaml', style: S.pre }),
        hasFile
          ? h(
              'div',
              { style: S.footer },
              h(
                'button',
                { type: 'button', style: S.link, onClick: () => setShowFile((value) => !value) },
                showFile ? t('hideFile') : t('showFile'),
              ),
              unit.fileTruncated ? h('span', { style: S.muted }, t('truncated')) : null,
            )
          : null,
        hasFile && showFile ? h(HighlightedCode, { text: file, lang: 'yaml', style: S.preFull }) : null,
      )
    }

    function CodeFile(props) {
      const { t, file, copied, onCopy, defaultOpen } = props
      const [open, setOpen] = React.useState(defaultOpen === true)
      const markdown = languageOf(file) === 'md'
      const [mode, setMode] = React.useState('rendered')
      const modeButton = (id, label) =>
        h(
          'button',
          {
            type: 'button',
            style: mode === id ? { ...S.modeButton, ...S.modeActive } : S.modeButton,
            'aria-pressed': mode === id,
            onClick: () => setMode(id),
          },
          label,
        )
      return h(
        'div',
        { style: S.card },
        h(
          'div',
          { style: S.bar },
          h('span', { style: S.badge }, kindLabel(t, file.kind)),
          h('span', { style: S.path, title: file.path }, file.rel),
          h('span', { style: S.size }, formatBytes(file.bytes)),
          markdown
            ? h('span', { style: S.modes }, modeButton('rendered', t('mdRendered')), modeButton('raw', t('mdRaw')))
            : null,
          h('button', { type: 'button', style: S.button, onClick: () => setOpen((value) => !value) }, open ? t('hide') : t('show')),
          h(
            'button',
            { type: 'button', style: S.button, onClick: () => onCopy(file.text) },
            copied ? t('copied') : t('copy'),
          ),
        ),
        open && markdown && mode === 'rendered' ? h(MarkdownView, { text: file.text, style: S.mdBody }) : null,
        open && (!markdown || mode === 'raw')
          ? h(HighlightedCode, { text: file.text, lang: markdown ? 'md' : languageOf(file), style: S.pre })
          : null,
        open && file.truncated ? h('div', { style: S.footer }, h('span', { style: S.muted }, t('truncated'))) : null,
      )
    }

    /** Render the declaration payload: patch blocks, whole files, empty state, errors. */
    function declarationBody(data, t, copiedKey, onCopy) {
      const body = []
      const units = Array.isArray(data.units) ? data.units : []
      const fileMap = new Map()
      if (Array.isArray(data.files)) {
        for (const file of data.files) {
          if (file && typeof file.path === 'string') fileMap.set(file.path, file)
        }
      }
      const fileOf = (unit) => {
        const file = fileMap.get(unit.path)
        return file ? file.text : ''
      }
      if (data.bundle && Array.isArray(data.bundle.files)) {
        for (const file of data.bundle.files) {
          if (!file || typeof file.path !== 'string' || typeof file.text !== 'string') continue
          body.push(
            h(TextBlock, {
              key: `bundle:${data.bundle.name}:${file.path}`,
              t,
              copied: copiedKey === file.text,
              onCopy,
              file: '',
              unit: {
                layer: 'bundle',
                path: file.path,
                yaml: file.text,
                fileTruncated: file.truncated === true,
              },
            }),
          )
        }
      }
      if (units.length > 0) {
        body.push(
          h(
            'div',
            { key: 'units', style: S.list },
            units.map((unit, index) =>
              h(TextBlock, {
                key: `${unit.layer}:${unit.path}:${unit.id}:${index}`,
                t,
                copied: copiedKey === unit.yaml,
                onCopy,
                file: fileOf(unit),
                unit: { ...unit, fileTruncated: fileMap.has(unit.path) ? fileMap.get(unit.path).truncated === true : false },
              }),
            ),
          ),
        )
      }
      const notes = Array.isArray(data.notes) ? data.notes : []
      for (let index = 0; index < notes.length; index += 1) {
        body.push(h('p', { key: `note:${index}`, style: S.muted }, notes[index]))
      }
      const hasBundleFiles = Boolean(data.bundle && Array.isArray(data.bundle.files) && data.bundle.files.length > 0)
      if (units.length === 0 && !hasBundleFiles) {
        body.push(
          h(
            'p',
            { key: 'empty', style: S.muted },
            t('empty'),
            ' ',
            h(
              'span',
              null,
              t('profilePath'),
              ': ',
              h('code', { style: S.inlineCode }, (data.profile && data.profile.patchPath) || ''),
            ),
          ),
        )
      }
      const errors = Array.isArray(data.errors) ? data.errors : []
      if (errors.length > 0) {
        body.push(
          h(
            'details',
            { key: 'errors' },
            h('summary', { style: S.muted }, `${t('problems')} (${errors.length})`),
            h('pre', { style: S.pre, spellCheck: false }, errors.join('\n')),
          ),
        )
      }
      return body
    }

    /** Render the code payload: the package location plus one card per file. */
    function codeBody(data, t, copiedKey, onCopy) {
      const body = []
      const code = data && data.code
      if (!code) {
        body.push(h('p', { key: 'noCode', style: S.muted }, t('noCode')))
        return body
      }
      body.push(
        h(
          'div',
          { key: 'package', style: S.packageRow },
          h('span', { style: S.packageName }, code.packageName),
          h('code', { style: S.inlineCode, title: code.packageDir }, code.packageDir),
        ),
      )
      const codeFiles = Array.isArray(code.files) ? code.files : []
      codeFiles.forEach((file, index) => {
        body.push(
          h(CodeFile, {
            key: `${file.path}:${index}`,
            t,
            file,
            copied: copiedKey === file.text,
            onCopy,
            defaultOpen: index === 0,
          }),
        )
      })
      const codeNotes = Array.isArray(code.notes) ? code.notes : []
      for (let index = 0; index < codeNotes.length; index += 1) {
        body.push(h('p', { key: `codeNote:${index}`, style: S.muted }, codeNotes[index]))
      }
      return body
    }

    function InspectorSection(props) {
      const t = props.t
      const target = targetOf(props.subject)
      const targetKey = target ? target.key : ''
      const [tab, setTab] = React.useState('declaration')
      const [declaration, setDeclaration] = React.useState({ status: 'idle' })
      const [code, setCode] = React.useState({ status: 'idle' })
      const [declarationAttempt, setDeclarationAttempt] = React.useState(0)
      const [codeAttempt, setCodeAttempt] = React.useState(0)
      const [copiedKey, setCopiedKey] = React.useState('')

      React.useEffect(() => {
        if (!target) return undefined
        if (window.location.protocol === 'file:') {
          setDeclaration({ status: 'unavailable' })
          setCode({ status: 'unavailable' })
          return undefined
        }
        let alive = true
        setDeclaration({ status: 'loading' })
        setCode({ status: 'idle' })
        loadSection(target, false).then(
          (data) => {
            if (alive) setDeclaration({ status: 'ready', data })
          },
          (error) => {
            if (alive) setDeclaration({ status: 'error', message: String((error && error.message) || error) })
          },
        )
        return () => {
          alive = false
        }
      }, [targetKey, declarationAttempt])

      React.useEffect(() => {
        if (!target || tab !== 'code') return undefined
        const loaded = code.forKey === targetKey && (code.status === 'loading' || code.status === 'ready' || code.status === 'error')
        if (loaded) return undefined
        let alive = true
        setCode({ status: 'loading', forKey: targetKey })
        loadSection(target, true).then(
          (data) => {
            if (alive) setCode({ status: 'ready', data, forKey: targetKey })
          },
          (error) => {
            if (alive) setCode({ status: 'error', message: String((error && error.message) || error), forKey: targetKey })
          },
        )
        return () => {
          alive = false
        }
      }, [targetKey, tab, codeAttempt])

      if (!target) return null

      const refresh = () => {
        if (tab === 'code') {
          invalidate(target.key, 'code')
          setCode({ status: 'idle' })
          setCodeAttempt((value) => value + 1)
          return
        }
        invalidate(target.key, 'declaration')
        invalidate(target.key, 'code')
        setCode({ status: 'idle' })
        setDeclarationAttempt((value) => value + 1)
      }

      const onCopy = (text) => {
        copyText(text).then((ok) => {
          if (!ok) return
          setCopiedKey(text)
          window.setTimeout(() => setCopiedKey(''), 1600)
        })
      }

      const tabButton = (id, label) =>
        h(
          'button',
          {
            type: 'button',
            style: tab === id ? { ...S.tab, ...S.tabActive } : S.tab,
            'aria-pressed': tab === id,
            onClick: () => setTab(id),
          },
          label,
        )

      const view = tab === 'code' ? code : declaration
      const body = []
      if (view.status === 'idle' || view.status === 'loading') {
        body.push(h('p', { key: 'loading', style: S.muted }, tab === 'code' ? t('loadingCode') : t('loading')))
      } else if (view.status === 'unavailable') {
        body.push(h('p', { key: 'unavailable', style: S.muted }, t('unavailable')))
      } else if (view.status === 'error') {
        body.push(h('p', { key: 'error', style: S.error }, view.message))
        body.push(
          h('div', { key: 'retry' }, h('button', { type: 'button', style: S.button, onClick: refresh }, t('retry'))),
        )
      } else if (tab === 'code') {
        body.push(...codeBody(view.data, t, copiedKey, onCopy))
      } else {
        body.push(...declarationBody(view.data, t, copiedKey, onCopy))
      }

      return h(
        'section',
        { style: S.section, 'aria-label': t('section') },
        h('style', { key: 'highlight-css' }, HIGHLIGHT_CSS),
        h(
          'div',
          { style: S.head },
          h(
            'div',
            null,
            h('h3', { style: S.heading }, t('section')),
            h('p', { style: S.hint }, t('hint')),
          ),
          h(
            'button',
            { type: 'button', style: S.button, onClick: refresh, title: t('refresh'), 'aria-label': t('refresh') },
            t('refresh'),
          ),
        ),
        h(
          'div',
          { style: S.tabs, role: 'tablist' },
          tabButton('declaration', t('tabDeclaration')),
          tabButton('code', t('tabCode')),
        ),
        ...body,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'plugin-inspector: dictionaries')
        ctx.slots.inject('plugins.detail.section', () =>
          ctx.slots.register(
            { name: 'plugins.detail.section', id: 'plugin-inspector', order: 40, locale: NS },
            InspectorSection,
          ),
        )
      },
    }
  },
})
