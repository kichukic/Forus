// MD5, in plain JavaScript. React Native has no hashing of its own, and this
// is only ever asked to hash short strings (a request body, a timestamp), so
// a small implementation is quicker than pulling in a native library.
const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

// The sine table the algorithm is built on.
const K = new Uint32Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);

/** The bytes of a string, as UTF-8. */
export function utf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    // A pair of surrogates is one character, not two.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

function rotl(value: number, shift: number): number {
  return (value << shift) | (value >>> (32 - shift));
}

/** The MD5 digest of some bytes. */
export function md5Bytes(data: Uint8Array): Uint8Array {
  const bitLength = data.length * 8;
  // The message is padded with one 1 bit, then zeros, then its length in bits.
  const padded = new Uint8Array((((data.length + 8) >> 6) << 6) + 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLength >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLength / 4294967296), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const block = new Uint32Array(16);
  const words = new DataView(padded.buffer);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) block[i] = words.getUint32(offset + i * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const sum = (a + f + K[i] + block[g]) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl(sum, SHIFTS[i])) | 0;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  const digest = new Uint8Array(16);
  const out = new DataView(digest.buffer);
  out.setUint32(0, a0 >>> 0, true);
  out.setUint32(4, b0 >>> 0, true);
  out.setUint32(8, c0 >>> 0, true);
  out.setUint32(12, d0 >>> 0, true);
  return digest;
}

/** The MD5 digest of some text, as lower-case hex. */
export function md5Hex(text: string): string {
  let hex = '';
  for (const byte of md5Bytes(utf8Bytes(text))) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Some bytes as base64, without needing a platform helper. */
export function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += BASE64[a >> 2];
    out += BASE64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : BASE64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : BASE64[c & 63];
  }
  return out;
}

/** Hex as bytes, for a key that is written down as hex. */
export function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** The HMAC-MD5 of a message, as base64. */
export function hmacMd5Base64(key: Uint8Array | string, message: string): string {
  const keyBytes = typeof key === 'string' ? utf8Bytes(key) : key;
  const messageBytes = utf8Bytes(message);
  // A key longer than the block size is hashed down to size first.
  const shortened = keyBytes.length > 64 ? md5Bytes(keyBytes) : keyBytes;

  const inner = new Uint8Array(64 + messageBytes.length);
  const outer = new Uint8Array(64 + 16);
  for (let i = 0; i < 64; i++) {
    const byte = i < shortened.length ? shortened[i] : 0;
    inner[i] = byte ^ 0x36;
    outer[i] = byte ^ 0x5c;
  }
  inner.set(messageBytes, 64);
  outer.set(md5Bytes(inner), 64);
  return base64(md5Bytes(outer));
}
