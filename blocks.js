/**
 * Exact-source extraction of one declaration from a Cordis patch file.
 *
 * A patch is a YAML entry list: top-level `- id: row` items, or `- insert:`
 * items whose rows are nested list items. The Plugins page shows the declaration
 * as the file writes it, comments included, so this returns source lines rather
 * than a parsed object.
 */

/**
 * Return every list item that declares `id: <id>`, as its exact source text.
 *
 * @param {string} text patch file contents.
 * @param {string} id patch id to find.
 * @returns {string[]} matching item blocks, in file order, without duplicates.
 */
export function findBlocks(text, id) {
  if (typeof text !== 'string' || text === '' || typeof id !== 'string' || id === '') return []
  const lines = text.split(/\r?\n/)
  const token = escapeRegExp(id)
  const declaration = new RegExp(`^(\\s*)(?:-\\s+)?id:\\s*(?:"${token}"|'${token}'|${token})\\s*$`)
  const blocks = []
  for (let index = 0; index < lines.length; index += 1) {
    const match = declaration.exec(lines[index])
    if (!match) continue
    const indent = match[1].length
    let start = index
    if (!/^\s*-\s/.test(lines[index])) {
      for (let scan = index - 1; scan >= 0; scan -= 1) {
        const line = lines[scan]
        if (line.trim() === '') continue
        const lineIndent = line.match(/^\s*/)[0].length
        if (lineIndent < indent) break
        if (lineIndent === indent && /^\s*-\s/.test(line)) {
          start = scan
          break
        }
      }
    }
    let end = lines.length
    for (let scan = start + 1; scan < lines.length; scan += 1) {
      const line = lines[scan]
      if (line.trim() === '') continue
      const lineIndent = line.match(/^\s*/)[0].length
      if (lineIndent <= indent) {
        end = scan
        break
      }
    }
    while (end > start && lines[end - 1].trim() === '') end -= 1
    const block = lines.slice(start, end).join('\n').replace(/\s+$/, '')
    if (block !== '' && !blocks.includes(block)) blocks.push(block)
  }
  return blocks
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
