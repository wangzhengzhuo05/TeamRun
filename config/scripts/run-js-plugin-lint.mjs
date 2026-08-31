import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { parseSync, visitorKeys } from 'oxc-parser'

const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/
const FALLBACK_CHILD_KEYS = new Set(['parent', 'loc', 'range', 'start', 'end'])

function normalizedPath(filePath) {
  return filePath.split(path.sep).join('/')
}

function configuredSeverity(value) {
  const severity = Array.isArray(value) ? value[0] : value
  if (severity === 'error' || severity === 2) {
    return 'error'
  }
  if (severity === 'warn' || severity === 'warning' || severity === 1) {
    return 'warning'
  }
  return null
}

function childNodes(node) {
  const keys =
    visitorKeys[node.type] ?? Object.keys(node).filter((key) => !FALLBACK_CHILD_KEYS.has(key))
  const children = []
  for (const key of keys) {
    const value = node[key]
    if (Array.isArray(value)) {
      children.push(...value.filter((child) => child?.type))
    } else if (value?.type) {
      children.push(value)
    }
  }
  return children
}

function attachParents(node, parent = null) {
  Object.defineProperty(node, 'parent', { value: parent, configurable: true })
  for (const child of childNodes(node)) {
    attachParents(child, node)
  }
}

function sourcePosition(source, index) {
  const prefix = source.slice(0, index)
  const lastNewline = prefix.lastIndexOf('\n')
  return {
    line: (prefix.match(/\n/g)?.length ?? 0) + 1,
    column: index - lastNewline
  }
}

function diagnosticSpan(source, node) {
  const start = node?.start ?? node?.range?.[0] ?? 0
  const end = node?.end ?? node?.range?.[1] ?? start
  const position = sourcePosition(source, start)
  return {
    offset: Buffer.byteLength(source.slice(0, start)),
    length: Buffer.byteLength(source.slice(start, end)),
    ...position
  }
}

function parseDiagnostic(filename, source, error) {
  const label = error.labels?.[0]
  const node = { start: label?.start ?? 0, end: label?.end ?? label?.start ?? 0 }
  return {
    message: error.message,
    code: 'parse-error',
    severity: 'error',
    filename,
    labels: [{ span: diagnosticSpan(source, node), message: label?.message ?? null }]
  }
}

function ruleDiagnostic({ filename, source, pluginName, ruleName, severity, descriptor }) {
  return {
    message: descriptor.message,
    code: `${pluginName}(${ruleName})`,
    severity,
    filename,
    labels: [{ span: diagnosticSpan(source, descriptor.node), message: null }]
  }
}

function visitorHandlers(plugins, rules, contextValues) {
  const handlers = new Map()
  const exitHandlers = new Map()

  for (const [ruleKey, setting] of Object.entries(rules)) {
    const severity = configuredSeverity(setting)
    if (!severity) {
      continue
    }
    const descriptor = plugins.find(({ name }) => ruleKey.startsWith(`${name}/`))
    if (!descriptor) {
      throw new Error(`No JavaScript plugin is configured for ${ruleKey}.`)
    }
    const ruleName = ruleKey.slice(descriptor.name.length + 1)
    const rule = descriptor.plugin.rules?.[ruleName]
    if (!rule) {
      throw new Error(`JavaScript plugin ${descriptor.name} does not provide ${ruleName}.`)
    }
    const context = {
      filename: contextValues.filename,
      getFilename: () => contextValues.filename,
      settings: contextValues.settings,
      sourceCode: { getText: (node) => contextValues.source.slice(node.start, node.end) },
      report: (report) => {
        contextValues.diagnostics.push(
          ruleDiagnostic({
            ...contextValues,
            pluginName: descriptor.name,
            ruleName,
            severity,
            descriptor: report
          })
        )
      }
    }
    for (const [selector, visit] of Object.entries(rule.create(context))) {
      const exit = selector.endsWith(':exit')
      const nodeType = exit ? selector.slice(0, -5) : selector
      if (nodeType.includes(':')) {
        throw new Error(`Unsupported JavaScript plugin visitor selector: ${selector}`)
      }
      const target = exit ? exitHandlers : handlers
      const visits = target.get(nodeType) ?? []
      visits.push(visit)
      target.set(nodeType, visits)
    }
  }
  return { handlers, exitHandlers }
}

function traverse(node, handlers, exitHandlers) {
  for (const visit of handlers.get(node.type) ?? []) {
    visit(node)
  }
  for (const child of childNodes(node)) {
    traverse(child, handlers, exitHandlers)
  }
  for (const visit of exitHandlers.get(node.type) ?? []) {
    visit(node)
  }
}

export function lintSourceWithPlugins({ filename, source, plugins, rules, settings = {} }) {
  const applicablePlugins = plugins.filter(
    ({ sourceHints }) => !sourceHints || sourceHints.some((hint) => source.includes(hint))
  )
  const applicableRules = Object.fromEntries(
    Object.entries(rules).filter(([ruleKey]) =>
      applicablePlugins.some(({ name }) => ruleKey.startsWith(`${name}/`))
    )
  )
  if (Object.keys(applicableRules).length === 0) {
    return []
  }
  const result = parseSync(filename, source, {
    range: true,
    sourceType: 'unambiguous',
    preserveParens: false
  })
  if (result.errors.length > 0) {
    return result.errors.map((error) => parseDiagnostic(filename, source, error))
  }
  const diagnostics = []
  attachParents(result.program)
  const visitors = visitorHandlers(applicablePlugins, applicableRules, {
    filename,
    source,
    settings,
    diagnostics
  })
  traverse(result.program, visitors.handlers, visitors.exitHandlers)
  return diagnostics
}

function pathMatchesPattern(relativePath, pattern) {
  const candidates = relativePath
    .split('/')
    .map((_, index, parts) => parts.slice(0, index + 1).join('/'))
  return candidates.some((candidate) => path.posix.matchesGlob(candidate, pattern))
}

function ignored(relativePath, patterns) {
  return (
    relativePath === '.git' || patterns.some((pattern) => pathMatchesPattern(relativePath, pattern))
  )
}

function collectSourceFiles(root, targets, ignorePatterns) {
  const files = new Set()
  const visit = (candidate) => {
    const absolutePath = path.resolve(root, candidate)
    const relativePath = normalizedPath(path.relative(root, absolutePath))
    if (ignored(relativePath, ignorePatterns)) {
      return
    }
    const stats = statSync(absolutePath)
    if (stats.isDirectory()) {
      for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
        if (!entry.isSymbolicLink()) {
          visit(path.join(absolutePath, entry.name))
        }
      }
    } else if (stats.isFile() && SOURCE_FILE_PATTERN.test(absolutePath)) {
      files.add(absolutePath)
    }
  }
  for (const target of targets) {
    visit(target)
  }
  return [...files].sort()
}

function rulesForFile(config, root, filename) {
  const relativePath = normalizedPath(path.relative(root, filename))
  const rules = { ...config.rules }
  for (const override of config.overrides ?? []) {
    if (override.files.some((pattern) => path.posix.matchesGlob(relativePath, pattern))) {
      Object.assign(rules, override.rules)
    }
  }
  return rules
}

async function loadPlugins(config, configPath) {
  return Promise.all(
    config.plugins.map(async ({ name, specifier, sourceHints }) => {
      const resolved = specifier.startsWith('.')
        ? path.resolve(path.dirname(configPath), specifier)
        : import.meta.resolve(specifier)
      const module = await import(
        resolved.startsWith('file:') ? resolved : pathToFileURL(resolved).href
      )
      return { name, plugin: module.default, sourceHints }
    })
  )
}

function parseArguments(argv) {
  let configPath = null
  let format = 'default'
  let denyWarnings = false
  const targets = []
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--config') {
      configPath = argv[(index += 1)]
    } else if (argument === '--format') {
      format = argv[(index += 1)]
    } else if (argument.startsWith('--format=')) {
      format = argument.slice('--format='.length)
    } else if (argument === '--deny-warnings') {
      denyWarnings = true
    } else if (argument !== '--') {
      targets.push(argument)
    }
  }
  if (!configPath) {
    throw new Error('Pass --config with a JavaScript plugin lint configuration.')
  }
  return { configPath, format, denyWarnings, targets }
}

function printDiagnostics(diagnostics, root) {
  for (const diagnostic of diagnostics) {
    const span = diagnostic.labels[0].span
    const filename = normalizedPath(path.relative(root, diagnostic.filename))
    console.error(
      `${filename}:${span.line}:${span.column} ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`
    )
  }
}

export async function main(argv = process.argv.slice(2), root = process.cwd()) {
  const options = parseArguments(argv)
  const configPath = path.resolve(root, options.configPath)
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const plugins = await loadPlugins(config, configPath)
  const files = collectSourceFiles(root, options.targets.length > 0 ? options.targets : ['.'], [
    '**/node_modules',
    '**/.git',
    ...(config.ignorePatterns ?? [])
  ])
  const diagnostics = files.flatMap((filename) =>
    lintSourceWithPlugins({
      filename,
      source: readFileSync(filename, 'utf8'),
      plugins,
      rules: rulesForFile(config, root, filename),
      settings: config.settings
    })
  )
  if (options.format === 'json') {
    process.stdout.write(
      `${JSON.stringify({ diagnostics, number_of_files: files.length, number_of_rules: Object.keys(config.rules).length })}\n`
    )
  } else {
    printDiagnostics(diagnostics, root)
    console.log(
      `JavaScript plugin lint: ${diagnostics.length} finding(s) across ${files.length} file(s).`
    )
  }
  const errors = diagnostics.some(({ severity }) => severity === 'error')
  return errors || (options.denyWarnings && diagnostics.length > 0) ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
