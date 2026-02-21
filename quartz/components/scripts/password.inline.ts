
const initPasswordProtection = async () => {
  const encryptedDiv = document.querySelector(".encrypted-page") as HTMLElement
  if (!encryptedDiv) return

  // Check if overlay already exists (prevent duplicates)
  if (document.getElementById("password-overlay")) return

  const storageKey = "quartz-password"
  const savedPassword = localStorage.getItem(storageKey)

  const ciphertext = encryptedDiv.dataset.ciphertext!
  const iv = encryptedDiv.dataset.iv!
  const salt = encryptedDiv.dataset.salt!

  async function decrypt(password: string) {
    try {
      const encoder = new TextEncoder()
      const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"],
      )

      const key = await window.crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)),
          iterations: 100000,
          hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      )

      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: Uint8Array.from(atob(iv), (c) => c.charCodeAt(0)),
        },
        key,
        Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0)),
      )

      const decoder = new TextDecoder()
      return decoder.decode(decrypted)
    } catch (e) {
      console.error(e)
      throw new Error("Decryption failed")
    }
  }

  async function unlock(password: string) {
    try {
      const contentHtml = await decrypt(password)
      const bodyContainer = encryptedDiv.parentElement
      if (bodyContainer) {
        bodyContainer.innerHTML = contentHtml
        // Re-evaluate scripts if necessary
        const scripts = bodyContainer.querySelectorAll("script")
        scripts.forEach((script) => {
          const newScript = document.createElement("script")
          Array.from(script.attributes).forEach((attr) =>
            newScript.setAttribute(attr.name, attr.value),
          )
          newScript.appendChild(document.createTextNode(script.innerHTML))
          script.parentNode?.replaceChild(newScript, script)
        })
      }
      
      // Remove overlay
      const overlay = document.getElementById("password-overlay")
      if (overlay) overlay.remove()
      document.body.classList.remove("locked")
      
      localStorage.setItem(storageKey, password)

      // Trigger hydration of components (Explorer, Mermaid, etc.)
      document.dispatchEvent(new CustomEvent("nav", { detail: { url: window.location.pathname } }))
    } catch {
      const errorMsg = document.getElementById("password-error")
      if (errorMsg) errorMsg.style.display = "block"
      localStorage.removeItem(storageKey)
    }
  }

  // Create overlay if not already unlocked
  if (savedPassword) {
    try {
        await unlock(savedPassword)
        return
    } catch {
        // saved password invalid, proceed to show overlay
    }
  }

  const overlay = document.createElement("div")
  overlay.id = "password-overlay"
  overlay.innerHTML = `
    <div class="password-container">
      <h2>Enter Password</h2>
      <input type="password" id="password-input" placeholder="Password" />
      <button id="password-submit">Unlock</button>
      <p id="password-error" style="color: red; display: none;">Incorrect Password</p>
    </div>
  `
  document.body.appendChild(overlay)
  document.body.classList.add("locked")

  const input = document.getElementById("password-input") as HTMLInputElement
  const submitBtn = document.getElementById("password-submit") as HTMLButtonElement

  submitBtn.addEventListener("click", () => unlock(input.value))
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") unlock(input.value)
  })
  
  input.focus()
}

document.addEventListener("nav", initPasswordProtection)
if (document.readyState === "complete" || document.readyState === "interactive") {
  initPasswordProtection()
} else {
  document.addEventListener("DOMContentLoaded", initPasswordProtection)
}
