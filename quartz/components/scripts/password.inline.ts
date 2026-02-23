import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import posthog from "posthog-js";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY as string,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN as string,
  projectId: process.env.FIREBASE_PROJECT_ID as string,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID as string,
  appId: process.env.FIREBASE_APP_ID as string,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

posthog.init(process.env.POSTHOG_API_KEY as string, {
  api_host: process.env.POSTHOG_API_HOST as string,
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

        // Add Logout Button
        let logoutBtn = document.getElementById("logout-btn");
        if (!logoutBtn) {
          logoutBtn = document.createElement("button");
          logoutBtn.id = "logout-btn";
          logoutBtn.innerText = "Log out";
          logoutBtn.style.position = "fixed";
          logoutBtn.style.bottom = "20px";
          logoutBtn.style.right = "20px";
          logoutBtn.style.padding = "10px 20px";
          logoutBtn.style.zIndex = "10000";
          logoutBtn.style.cursor = "pointer";
          logoutBtn.style.backgroundColor = "#ff4d4f";
          logoutBtn.style.color = "white";
          logoutBtn.style.border = "none";
          logoutBtn.style.borderRadius = "4px";
          
          logoutBtn.addEventListener("click", () => {
            auth.signOut().then(() => {
              window.location.reload();
            });
          });
          document.body.appendChild(logoutBtn);
        }

      } else {
        // Not logged in. Show Google Login UI instead of password UI.
        const pOverlay = document.getElementById("password-overlay")
        if (pOverlay) pOverlay.style.display = "none";

        // Remove logout button if present
        const logoutBtn = document.getElementById("logout-btn");
        if (logoutBtn) logoutBtn.remove();

        let gOverlay = document.getElementById("google-login-overlay");
        if (!gOverlay) {
          gOverlay = document.createElement("div")
          gOverlay.id = "google-login-overlay"
          gOverlay.innerHTML = `
            <div class="password-container" style="text-align: center;">
              <h2>Sign In</h2>
              <p>Please sign in with Google to continue.</p>
              <button id="google-login-btn" style="padding: 10px 20px; font-size: 16px; cursor: pointer; background: #4285F4; color: white; border: none; border-radius: 4px;">Sign in with Google</button>
              <p style="font-size: 12px; margin-top: 15px;">
                Door in te loggen ga ik akkoord met de <a href="#" id="terms-link" style="text-decoration: underline; cursor: pointer;">algemene voorwaarden</a>
              </p>
            </div>
            
            <div id="terms-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10001; justify-content: center; align-items: center;">
              <div style="background: white; padding: 20px; border-radius: 8px; max-width: 500px; width: 90%; position: relative; color: black;">
                <h3 style="margin-top: 0;">Algemene Voorwaarden & Privacy (AVG)</h3>
                <p style="color: black;">
                  Door gebruik te maken van deze website en in te loggen, gaat u ermee akkoord dat wij bepaalde persoonsgegevens en gebruiksgegevens verzamelen. Om de kwaliteit en gebruikerservaring van de site te verbeteren, monitoren en analyseren wij de interacties en het gedrag van gebruikers op ons platform.
                </p>
                <p style="color: black;">
                  Wij gaan zorgvuldig om met uw data. Conform de Algemene Verordening Gegevensbescherming (AVG) heeft u te allen tijde het recht om inzicht te krijgen in uw opgeslagen gegevens of een verzoek tot volledige verwijdering van uw data in te dienen.
                </p>
                <p style="color: black;">
                  Voor vragen over uw privacy of een verzoek tot gegevensverwijdering, kunt u contact opnemen via: <a href="mailto:joostkkoch@gmail.com">joostkkoch@gmail.com</a>.
                </p>
                <button id="close-terms-btn" style="margin-top: 15px; padding: 8px 16px; cursor: pointer;">Sluiten</button>
              </div>
            </div>
          `
          document.body.appendChild(gOverlay)
          
          document.getElementById("google-login-btn")?.addEventListener("click", () => {
            signInWithPopup(auth, provider).catch(error => {
              console.error("Google Sign-in failed", error);
              alert("Sign in failed. Please try again.");
            });
          });

          // Terms modal logic
          const termsLink = document.getElementById("terms-link");
          const termsModal = document.getElementById("terms-modal");
          const closeTermsBtn = document.getElementById("close-terms-btn");

          if (termsLink && termsModal && closeTermsBtn) {
            termsLink.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation(); // Prevent bubbling up to document
              termsModal.style.display = "flex";
            });

            const closeTerms = (e?: Event) => {
              if (e) e.stopPropagation();
              termsModal.style.display = "none";
            };

            closeTermsBtn.addEventListener("click", closeTerms);

            // Prevent closing when clicking inside the modal content
            const termsContent = termsModal.firstElementChild as HTMLElement;
            if (termsContent) {
                termsContent.addEventListener("click", (e) => {
                    e.stopPropagation(); // Stop clicks inside from reaching the modal background
                });
            }

            // Close when clicking the background (backdrop)
            termsModal.addEventListener("click", (e) => {
              if (e.target === termsModal) {
                 e.stopPropagation();
                 closeTerms();
              }
            });
          }
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
