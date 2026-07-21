/**
 * Length-prefixed string codec for the binary journal format.
 * Layout: u32 byte-length prefix (little-endian) + UTF-8 body.
 */

export function writePascalString(text: string): Buffer {
  const body = Buffer.from(text, 'utf8');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

export function readPascalString(buf: Buffer, offset: number): { value: string; next: number } {
  const length = buf.readUInt32LE(offset);
  const start = offset + 4;
  const value = buf.toString('utf8', start, start + length);
  return { value, next: start + length };
}
