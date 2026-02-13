document.addEventListener("DOMContentLoaded", () => {
  const correctPin = "6969"
  const storageKey = "site_unlocked"

  // Check if already unlocked
  if (localStorage.getItem(storageKey) === "true") {
    return
  }

  // Create overlay
  const overlay = document.createElement("div")
  overlay.id = "password-overlay"
  overlay.innerHTML = `
    <div class="password-container">
      <h2>Enter PIN</h2>
      <input type="password" id="password-input" maxlength="4" placeholder="****" />
      <button id="password-submit">Unlock</button>
      <p id="password-error" style="color: red; display: none;">Incorrect PIN</p>
    </div>
  `
  document.body.appendChild(overlay)
  document.body.classList.add("locked")

  const input = document.getElementById("password-input") as HTMLInputElement
  const submitBtn = document.getElementById("password-submit") as HTMLButtonElement
  const errorMsg = document.getElementById("password-error") as HTMLParagraphElement

  const unlock = () => {
    if (input.value === correctPin) {
      localStorage.setItem(storageKey, "true")
      document.body.removeChild(overlay)
      document.body.classList.remove("locked")
    } else {
      errorMsg.style.display = "block"
      input.value = ""
    }
  }

  submitBtn.addEventListener("click", unlock)

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      unlock()
    }
  })

  // Focus input
  input.focus()
})
