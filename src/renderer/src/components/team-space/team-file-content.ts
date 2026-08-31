const CODE_EXTENSIONS = new Set([
  'c',
  'cpp',
  'css',
  'go',
  'html',
  'java',
  'js',
  'jsx',
  'json',
  'kt',
  'mjs',
  'php',
  'py',
  'rb',
  'rs',
  'sh',
  'sql',
  'swift',
  'toml',
  'ts',
  'tsx',
  'vue',
  'xml',
  'yaml',
  'yml'
])

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return window.btoa(binary)
}

export function textToBase64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value))
}

export function base64ToText(value: string): string {
  const binary = window.atob(value)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function supportsTeamFileText(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    [
      'application/json',
      'application/javascript',
      'application/typescript',
      'application/xml'
    ].includes(mimeType)
  )
}

export function inferTeamFileKind(path: string, mimeType: string): 'document' | 'code' | 'file' {
  const extension = path.split('.').at(-1)?.toLocaleLowerCase() ?? ''
  if (extension === 'md' || extension === 'mdx') {
    return 'document'
  }
  if (CODE_EXTENSIONS.has(extension) || mimeType.includes('javascript')) {
    return 'code'
  }
  return 'file'
}

export function inferTeamFileMimeType(path: string, provided: string): string {
  if (provided) {
    return provided
  }
  const extension = path.split('.').at(-1)?.toLocaleLowerCase()
  if (extension === 'md' || extension === 'mdx') {
    return 'text/markdown'
  }
  if (extension === 'json') {
    return 'application/json'
  }
  return CODE_EXTENSIONS.has(extension ?? '') ? 'text/plain' : 'application/octet-stream'
}
