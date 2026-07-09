import crypto from 'crypto'

// Reversible storage for auto-generated mogul-account passwords, so an
// OWNER/MANAGER can re-reveal credentials to hand off later (bcrypt in
// User.password cannot be reversed, by design). AES-256-GCM with a key
// derived from a server-side secret — never derived from user input, never
// sent to the client.
const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY or NEXTAUTH_SECRET must be set to store mogul credentials')
  }
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptCredential(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join('.')
}

export function decryptCredential(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split('.')
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
  return plaintext.toString('utf8')
}

// Readable-but-random password for auto-provisioned mogul accounts —
// avoids ambiguous characters (0/O, 1/l/I) since these get read aloud/typed
// by hand when an owner shares them.
const PASSWORD_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function generateReadablePassword(length = 12): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARS[crypto.randomInt(PASSWORD_CHARS.length)]
  }
  return out
}
