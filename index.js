/**
 * Host half of the plugin-inspector bundle.
 *
 * The Plugins page is browser code and cannot read files, and an installed
 * bundle cannot add a Remote namespace (the client Remote assembly is fixed at
 * build time). This half therefore serves a read-only inspection payload from a
 * small same-origin route: the declaration text of the plugin's patch entries
 * plus the code files installed behind it.
 *
 * It never writes anything.
 */
import { createRequire } from 'node:module'
import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { homedir } from 'node:os'

import { findBlocks } from './blocks.js'

const ROUTE = '/plugin-inspector'
const MAX_DECLARATION_BYTES = 512 * 1024
const MAX_BODY_BYTES = 16 * 1024

const MAX_CODE_FILE_BYTES = 256 * 1024
const MAX_README_BYTES = 64 * 1024
const MAX_CODE_TOTAL_BYTES = 1600 * 1024
const MAX_CODE_FILES = 16
const MAX_SOURCE_FILES = 10

const CODE_KIND_ORDER = { host: 0, client: 1, manifest: 2, source: 3, readme: 4, types: 5 }
const BUNDLE_CACHE_TTL_MS = 5000

/** Bundle patch reads are cheap; repeat lookups reuse them for a moment. */
const bundleCache = new Map()

export const inject = ['webServer']

export function apply(ctx) {
  const handler = async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'cache-control': 'no-store' })
        res.end()
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, errors: ['Use POST.'] })
        return
      }
      if (!sameOrigin(req)) {
        sendJson(res, 403, { ok: false, errors: ['Cross-origin request refused.'] })
        return
      }
      const request = await readJsonBody(req)
      const payload = await collect(ctx, request)
      sendJson(res, 200, payload)
    } catch (error) {
      sendJson(res, 500, { ok: false, errors: [describeError(error)] })
    }
  }

  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: ROUTE, handler }),
    'plugin-inspector: route',
  )
}

/** @param {import('node:http').ServerResponse} res */
function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(payload))
}

function sameOrigin(req) {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  const parsed = JSON.parse(text)
  return parsed && typeof parsed === 'object' ? parsed : {}
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} request
 */
async function collect(ctx, request) {
  const errors = []
  const notes = []
  const units = []
  const files = new Map()
  const profile = profileFacts(ctx)
  const profileSources = await readProfileSources(ctx, errors)
  const kind = typeof request.kind === 'string' ? request.kind : 'row'
  const targetIds = collectIds(request)

  for (const source of profileSources) rememberFile(files, source)

  const bundles = await installedBundles(ctx, errors)
  let bundleName = typeof request.bundle === 'string' && request.bundle !== '' ? request.bundle : undefined
  if (!bundleName && (request.rowId || request.entryId)) {
    bundleName = ownerBundle(bundles, request.rowId, request.entryId)
  }

  if (bundleName && kind === 'bundle') {
    for (const bundle of bundles) {
      if (bundle.name !== bundleName) continue
      for (const row of bundle.rows ?? []) {
        addId(targetIds, row.rowId)
        addId(targetIds, row.entryId)
      }
    }
  }

  for (const id of targetIds) {
    for (const source of profileSources) {
      for (const block of findBlocks(source.text, id)) {
        units.push({ layer: 'profile', label: source.label, path: source.path, id, yaml: block })
      }
    }
  }

  let bundle = null
  if (bundleName) {
    bundle = await readBundlePatch(bundleName, errors)
    if (bundle && kind !== 'bundle') {
      for (const id of targetIds) {
        for (const file of bundle.files) {
          for (const block of findBlocks(file.text, id)) {
            units.push({ layer: 'bundle', label: bundle.name, path: file.path, id, yaml: block })
          }
        }
      }
    }
    if (!bundle) notes.push(`Could not read the patch list of ${bundleName}.`)
  } else if (kind === 'item') {
    for (const candidate of bundles) {
      if (!candidate.name) continue
      const relevant = (candidate.rows ?? []).some((row) => {
        for (const id of targetIds) {
          if (idMatches(row.rowId, id) || idMatches(row.entryId, id)) return true
        }
        return false
      })
      if (!relevant) continue
      const found = await readBundlePatch(candidate.name, errors)
      if (!found || found.files.length === 0) continue
      bundle = found
      bundleName = candidate.name
      for (const id of targetIds) {
        for (const file of found.files) {
          for (const block of findBlocks(file.text, id)) {
            units.push({ layer: 'bundle', label: found.name, path: file.path, id, yaml: block })
          }
        }
      }
      break
    }
  }

  if (units.length === 0 && kind !== 'bundle') {
    notes.push(
      bundleName
        ? `No entry for this plugin was found in the profile patch or in ${bundleName}.`
        : 'No entry for this plugin was found in the profile patch.',
    )
  }

  const bundleView =
    kind === 'bundle' && bundle && bundle.files.length > 0
      ? {
          name: bundle.name,
          files: bundle.files.map((file) => ({ path: file.path, text: file.text, truncated: file.truncated })),
        }
      : null

  const code = request.includeCode === true ? await collectCode(ctx, request, bundleName, errors) : null

  return {
    ok: true,
    profile,
    files: [...files.values()],
    units,
    bundle: bundleView,
    code,
    notes,
    errors,
  }
}

/**
 * Resolve the package that provides this subject and read its installed files:
 * the manifest, the Host entry, the browser bundle when the package declares
 * `dsh.client`, any shipped `src` sources, the README, and the type entry.
 */
async function collectCode(ctx, request, bundleName, errors) {
  const requested = typeof request.moduleName === 'string' ? request.moduleName : ''
  let specifier = requested
  if (specifier === '' && request.entryId) {
    specifier = (await entryModuleName(ctx, request.entryId, errors)) || ''
  }
  if (specifier === '' && bundleName) specifier = bundleName
  if (specifier === '') return null

  const packageName = packageRootOf(specifier)
  const packageJsonPath = resolvePackageJson(packageName)
  if (!packageJsonPath) {
    errors.push(`code: package not found on disk: ${packageName}`)
    return null
  }

  let manifest
  try {
    manifest = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  } catch (error) {
    errors.push(`code: ${packageJsonPath}: ${describeError(error)}`)
    return null
  }

  const packageDir = dirname(packageJsonPath)
  const state = { dir: packageDir, files: [], used: new Set(), total: 0, notes: [] }

  await addCodeFile(state, packageJsonPath, 'manifest')

  const entryPath = resolveModulePath(specifier)
  if (entryPath) await addCodeFile(state, entryPath, 'host')
  else state.notes.push(`The module entry could not be resolved: ${specifier}`)

  const clientPath = clientEntryPath(packageName, manifest, packageDir)
  if (clientPath) await addCodeFile(state, clientPath, 'client')

  for (const sourcePath of listSourceFiles(packageDir)) {
    await addCodeFile(state, sourcePath, 'source')
    if (state.files.length >= MAX_CODE_FILES) break
  }

  const readmePath = join(packageDir, 'README.md')
  if (existsSync(readmePath)) await addCodeFile(state, readmePath, 'readme')

  const typesPath = join(packageDir, 'lib', 'types', 'index.d.ts')
  if (existsSync(typesPath)) await addCodeFile(state, typesPath, 'types')

  state.files.sort((left, right) => (CODE_KIND_ORDER[left.kind] ?? 99) - (CODE_KIND_ORDER[right.kind] ?? 99))
  if (state.files.length === 0) state.notes.push('No readable code file was found for this package.')

  return {
    packageName,
    packageDir,
    files: state.files,
    notes: state.notes,
  }
}

async function entryModuleName(ctx, entryId, errors) {
  const manager = getService(ctx, 'pluginManager')
  if (!manager || typeof manager.listPlugins !== 'function') return undefined
  try {
    const entries = await manager.listPlugins()
    const hit = (Array.isArray(entries) ? entries : []).find(
      (entry) => idMatches(entry.entryId, entryId) || idMatches(entry.patchId, entryId),
    )
    return typeof hit?.moduleName === 'string' ? hit.moduleName : undefined
  } catch (error) {
    errors.push(`code: listPlugins: ${describeError(error)}`)
    return undefined
  }
}

async function addCodeFile(state, path, kind) {
  if (!path || state.used.has(path) || state.files.length >= MAX_CODE_FILES) return
  if (!existsSync(path)) return
  let buffer
  try {
    buffer = await readFile(path)
  } catch (error) {
    state.notes.push(`${path}: ${describeError(error)}`)
    return
  }
  const limit = kind === 'readme' ? MAX_README_BYTES : MAX_CODE_FILE_BYTES
  const text = buffer.subarray(0, limit).toString('utf8')
  if (state.total + text.length > MAX_CODE_TOTAL_BYTES) {
    state.notes.push('The code size limit was reached; remaining files were skipped.')
    return
  }
  state.used.add(path)
  state.total += text.length
  state.files.push({
    path,
    rel: relative(state.dir, path).split(sep).join('/'),
    kind,
    bytes: buffer.length,
    truncated: buffer.length > limit,
    text,
  })
}

function clientEntryPath(packageName, manifest, packageDir) {
  if (!manifest || !manifest.dsh || !manifest.dsh.client) return undefined
  const candidates = []
  const exported = exportTarget(manifest.exports && manifest.exports['./client'])
  if (exported) candidates.push(join(packageDir, exported))
  candidates.push(join(packageDir, 'lib', 'client.js'), join(packageDir, 'client.js'))
  const resolved = resolveModulePath(`${packageName}/client`)
  if (resolved) candidates.push(resolved)
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return undefined
}

function exportTarget(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    for (const key of ['default', 'import', 'require']) {
      if (typeof value[key] === 'string') return value[key]
    }
  }
  return undefined
}

function listSourceFiles(packageDir) {
  const sourceDir = join(packageDir, 'src')
  if (!existsSync(sourceDir)) return []
  const found = []
  const walk = (dir, depth) => {
    if (depth > 3 || found.length >= MAX_SOURCE_FILES) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((left, right) => rankSource(left.name) - rankSource(right.name) || left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (found.length >= MAX_SOURCE_FILES) return
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue
        walk(path, depth + 1)
        continue
      }
      if (!/\.(ts|tsx|js|mjs|css|json)$/.test(entry.name)) continue
      if (entry.name.endsWith('.map')) continue
      if (/\.(test|spec)\./.test(entry.name)) continue
      found.push(path)
    }
  }
  walk(sourceDir, 0)
  return found
}

function rankSource(name) {
  if (name === 'index.ts' || name === 'index.tsx') return 0
  if (name === 'client.ts' || name === 'client.tsx') return 1
  return 2
}

/** The npm package a module specifier belongs to (`@scope/pkg/sub` → `@scope/pkg`). */
function packageRootOf(specifier) {
  if (typeof specifier !== 'string' || specifier === '') return specifier
  const parts = specifier.split('/')
  if (specifier.startsWith('@')) return parts.slice(0, 2).join('/')
  return parts[0]
}

async function readBundlePatch(name, errors) {
  const cached = bundleCache.get(name)
  if (cached && Date.now() - cached.at < BUNDLE_CACHE_TTL_MS) {
    if (cached.error) errors.push(`${name}: ${cached.error}`)
    return cached.value
  }
  let value = null
  let error = null
  try {
    const packageJsonPath = resolvePackageJson(name)
    if (!packageJsonPath) {
      error = 'package not found on disk'
    } else {
      const manifest = JSON.parse(await readFile(packageJsonPath, 'utf8'))
      const declared = manifest?.dsh?.bundle?.patch
      const specs = Array.isArray(declared)
        ? declared.filter((entry) => typeof entry === 'string' && entry !== '')
        : typeof declared === 'string' && declared !== ''
          ? [declared]
          : []
      if (specs.length === 0) {
        value = { name, files: [] }
      } else {
        const files = []
        for (const spec of specs) {
          const patchPath = join(dirname(packageJsonPath), spec)
          if (!existsSync(patchPath)) {
            errors.push(`${name}: no patch file at ${patchPath}`)
            continue
          }
          files.push(await readText(patchPath, MAX_DECLARATION_BYTES))
        }
        value = { name, files }
        if (files.length === 0) error = 'none of the declared patch files could be read'
      }
    }
  } catch (cause) {
    error = describeError(cause)
  }
  bundleCache.set(name, { at: Date.now(), value, error })
  if (error) errors.push(`${name}: ${error}`)
  return value
}

function resolvePackageJson(name) {
  for (const base of resolutionBases()) {
    try {
      const require = createRequire(join(base, '__dsh_resolution_probe__.cjs'))
      let entry
      try {
        entry = require.resolve(`${name}/package.json`)
      } catch {
        entry = require.resolve(name)
      }
      if (typeof entry !== 'string' || entry === '') continue
      const found = entry.endsWith('package.json') ? entry : nearestPackageJson(entry)
      if (found) return found
    } catch {
      // Try the next base.
    }
  }
  return null
}

function resolveModulePath(specifier) {
  if (typeof specifier !== 'string' || specifier === '') return null
  for (const base of resolutionBases()) {
    try {
      const require = createRequire(join(base, '__dsh_resolution_probe__.cjs'))
      const entry = require.resolve(specifier)
      if (typeof entry === 'string' && entry !== '') return entry
    } catch {
      // Try the next base.
    }
  }
  return null
}

function resolutionBases() {
  const bases = []
  const push = (value) => {
    if (typeof value !== 'string' || value === '') return
    if (value.startsWith('file:')) {
      try {
        value = decodeURIComponent(new URL(value).pathname).replace(/^\/([A-Za-z]:)/, '$1')
      } catch {
        return
      }
    }
    if (!existsSync(value)) return
    if (!bases.includes(value)) bases.push(value)
  }
  for (let index = 1; index < process.argv.length; index += 1) {
    const arg = process.argv[index]
    if (typeof arg !== 'string' || arg === '' || arg.startsWith('-')) continue
    push(arg)
    push(dirname(arg))
  }
  push(process.cwd())
  return bases
}

function nearestPackageJson(entry) {
  let dir = dirname(entry)
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function profileFacts(ctx) {
  const dir = profileDir(ctx)
  const name = process.env.DSH_PROFILE || dir.split(/[\\/]/).filter(Boolean).pop() || null
  return {
    name,
    dir,
    patchPath: join(dir, 'cordis.patch.yml'),
  }
}

/**
 * Locate the active profile directory without relying on one launcher: the
 * desktop host passes it as an argument, a CLI profile may expose it through the
 * Loader base, and `DSH_PROFILE_DIR` is set for child processes only.
 */
function profileDir(ctx) {
  const candidates = []
  const push = (value) => {
    if (typeof value !== 'string' || value === '') return
    let path = value
    if (path.startsWith('file:')) {
      try {
        path = decodeURIComponent(new URL(path).pathname).replace(/^\/([A-Za-z]:)/, '$1')
      } catch {
        return
      }
    }
    if (!isAbsolute(path)) return
    if (!candidates.includes(path)) candidates.push(path)
  }

  push(process.env.DSH_PROFILE_DIR)
  const loader = getService(ctx, 'loader')
  push(probe(() => ctx && ctx.baseDir))
  push(probe(() => ctx && ctx.root && ctx.root.baseDir))
  push(probe(() => loader && loader.baseUrl))
  push(probe(() => loader && loader.tree && loader.tree.baseUrl))
  push(probe(() => loader && loader.baseDir))
  for (let index = 1; index < process.argv.length; index += 1) {
    const arg = process.argv[index]
    if (typeof arg !== 'string' || arg === '' || arg.startsWith('-')) continue
    push(arg)
    push(dirname(arg))
  }
  push(process.cwd())
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  if (process.env.DSH_PROFILE) push(join(home, 'profiles', process.env.DSH_PROFILE))
  push(join(home, 'profiles'))
  for (const entry of safeReadDirs(join(home, 'profiles'))) push(entry)

  for (const candidate of candidates) {
    if (isProfileDir(candidate)) return candidate
  }
  return join(home, 'profiles', process.env.DSH_PROFILE || 'default')
}

function isAbsolute(path) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\') || path.startsWith('/')
}

/** Cordis context properties throw when the plugin did not inject them. */
function probe(read) {
  try {
    return read()
  } catch {
    return undefined
  }
}

function isProfileDir(dir) {
  try {
    if (!existsSync(join(dir, 'cordis.yml'))) return false
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) return existsSync(join(dir, 'cordis.patch.yml'))
    return true
  } catch {
    return false
  }
}

function safeReadDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(dir, entry.name))
  } catch {
    return []
  }
}

async function readProfileSources(ctx, errors) {
  const dir = profileDir(ctx)
  const candidates = [
    { label: 'Profile patch', path: join(dir, 'cordis.patch.yml') },
    { label: 'Profile root', path: join(dir, 'cordis.yml') },
  ]
  const profileContext = getService(ctx, 'profileContext')
  if (profileContext && Array.isArray(profileContext.overlays)) {
    for (const overlay of profileContext.overlays) {
      const path = typeof overlay === 'string' ? overlay : overlay?.path
      if (typeof path === 'string' && path !== '') candidates.push({ label: 'Patch overlay', path })
    }
  }
  const sources = []
  const seen = new Set()
  for (const candidate of candidates) {
    if (seen.has(candidate.path)) continue
    seen.add(candidate.path)
    if (!existsSync(candidate.path)) continue
    try {
      sources.push({ label: candidate.label, ...(await readText(candidate.path, MAX_DECLARATION_BYTES)) })
    } catch (error) {
      errors.push(`${candidate.path}: ${describeError(error)}`)
    }
  }
  return sources
}

async function installedBundles(ctx, errors) {
  const manager = getService(ctx, 'pluginManager')
  if (!manager || typeof manager.listBundles !== 'function') return []
  try {
    const bundles = await manager.listBundles()
    return Array.isArray(bundles) ? bundles : []
  } catch (error) {
    errors.push(`listBundles: ${describeError(error)}`)
    return []
  }
}

function ownerBundle(bundles, rowId, entryId) {
  for (const bundle of bundles) {
    for (const row of bundle.rows ?? []) {
      if (rowId && idMatches(row.rowId, rowId)) return bundle.name
      if (entryId && idMatches(row.entryId, entryId)) return bundle.name
    }
  }
  return undefined
}

function collectIds(request) {
  const ids = new Set()
  addId(ids, request.entryId)
  addId(ids, request.rowId)
  if (Array.isArray(request.ids)) for (const id of request.ids) addId(ids, id)
  return ids
}

function addId(ids, id) {
  if (typeof id !== 'string' || id === '') return
  ids.add(id)
  const bare = id.replace(/^include:/, '')
  if (bare !== id) ids.add(bare)
}

/** Patch ids and Loader entry ids differ only by the `include:` prefix in shipped trees. */
function idMatches(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  if (left === right) return true
  return left.replace(/^include:/, '') === right.replace(/^include:/, '')
}

async function readText(path, maxBytes) {
  const buffer = await readFile(path)
  return {
    path,
    text: buffer.subarray(0, maxBytes).toString('utf8'),
    truncated: buffer.length > maxBytes,
  }
}

function rememberFile(files, source) {
  if (!files.has(source.path)) {
    files.set(source.path, { path: source.path, text: source.text, truncated: source.truncated })
  }
}

function getService(ctx, name) {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}

function describeError(error) {
  if (error instanceof Error) return error.message
  return String(error)
}
