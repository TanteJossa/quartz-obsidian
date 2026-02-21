import { webcrypto } from "node:crypto"

const algorithm = { name: "AES-GCM", length: 256 }

export async function encrypt(text: string, password: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  
  const keyMaterial = await webcrypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  )
  
  const key = await webcrypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    algorithm,
    false,
    ["encrypt"]
  )
  
  const encrypted = await webcrypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    data
  )
  
  return {
    ciphertext: Buffer.from(encrypted).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    salt: Buffer.from(salt).toString("base64")
  }
}
