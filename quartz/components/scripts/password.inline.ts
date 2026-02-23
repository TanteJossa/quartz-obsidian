import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import posthog from "posthog-js";

const firebaseConfig = {
  apiKey: "AIzaSyCIxeHOP2T39mp83RKPO_bmoBvsqCUhmtk",
  authDomain: "joost-koch.firebaseapp.com",
  projectId: "joost-koch",
  storageBucket: "joost-koch.firebasestorage.app",
  messagingSenderId: "234817865209",
  appId: "1:234817865209:web:ef865f6b8888a45b202928",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

posthog.init('phc_O1BFFfiozBk5Rg86tAFZ28EANuE3Kh5MWA2KVmSabmk', {
  api_host: 'https://eu.i.posthog.com',
  person_profiles: 'always',
  session_recording: {
    strictMinimumDuration: true
  }
});

const initPasswordProtection = async () => {
  const encryptedDiv = document.querySelector(".encrypted-page") as HTMLElement
  if (!encryptedDiv) {
    // Already unlocked or page not protected. Still track page views if logged in.
    if (auth.currentUser) {
      posthog.capture('$pageview');
    }
    return;
  }

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

  async function processUnlock(contentHtml: string, password: string) {
    // Now wait for Firebase Auth state to be determined
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        // User is logged in. Reveal content.
        posthog.identify(user.uid, { email: user.email });
        
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
        
        const overlay = document.getElementById("password-overlay")
        if (overlay) overlay.remove()
        
        const googleOverlay = document.getElementById("google-login-overlay")
        if (googleOverlay) googleOverlay.remove()
        
        document.body.classList.remove("locked")
        localStorage.setItem(storageKey, password)

        // Trigger hydration of components
        document.dispatchEvent(new CustomEvent("nav", { detail: { url: window.location.pathname } }))
        posthog.capture('$pageview');

      } else {
        // Not logged in. Show Google Login UI instead of password UI.
        const pOverlay = document.getElementById("password-overlay")
        if (pOverlay) pOverlay.style.display = "none";

        let gOverlay = document.getElementById("google-login-overlay");
        if (!gOverlay) {
          gOverlay = document.createElement("div")
          gOverlay.id = "google-login-overlay"
          gOverlay.innerHTML = `
            <div class="password-container" style="text-align: center;">
              <h2>Sign In</h2>
              <p>Please sign in with Google to continue.</p>
              <button id="google-login-btn" style="padding: 10px 20px; font-size: 16px; cursor: pointer; background: #4285F4; color: white; border: none; border-radius: 4px;">Sign in with Google</button>
            </div>
          `
          document.body.appendChild(gOverlay)
          
          document.getElementById("google-login-btn")?.addEventListener("click", () => {
            signInWithPopup(auth, provider).catch(error => {
              console.error("Google Sign-in failed", error);
              alert("Sign in failed. Please try again.");
            });
          });
        }
      }
    });
  }

  async function unlock(password: string) {
    try {
      const contentHtml = await decrypt(password)
      // Hide password error if any
      const errorMsg = document.getElementById("password-error")
      if (errorMsg) errorMsg.style.display = "none"

      await processUnlock(contentHtml, password);
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
