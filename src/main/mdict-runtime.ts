export function decodeMdxRecord(bytes: Buffer, encoding: string): string {
  const normalizedEncoding = encoding.toLowerCase().replaceAll('_', '-')
  const decoder = new TextDecoder(
    normalizedEncoding === 'utf-16' ? 'utf-16le' : normalizedEncoding,
    { fatal: false }
  )
  return decoder.decode(bytes).replace(/\0+$/, '')
}
