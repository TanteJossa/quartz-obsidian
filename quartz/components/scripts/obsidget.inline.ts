function b64ToUtf8(str: string | null): string {
  if (!str) return ""
  try {
    return decodeURIComponent(
      atob(str)
        .split("")
        .map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
        })
        .join(""),
    )
  } catch (e) {
    return atob(str)
  }
}

document.addEventListener("nav", () => {
  const elements = document.querySelectorAll(".obsidget:not([data-initialized])")
  elements.forEach((el) => {
    const id = el.id
    
    const getB64 = (cls: string) => {
      const sub = el.querySelector(`div.${cls}`)
      return b64ToUtf8(sub ? sub.textContent : "")
    }

    const htmlStr = getB64("obsidget-html")
    const cssStr = getB64("obsidget-css")
    const jsStr = getB64("obsidget-js")
    const stateStr = getB64("obsidget-state")

    let state
    try {
      state = JSON.parse(stateStr)
    } catch (e) {
      state = {}
    }

    const shadow = el.attachShadow({ mode: "open" })

    // Injected styles
    const style = document.createElement("style")
    style.textContent = cssStr
    shadow.appendChild(style)

    // Main container
    const container = document.createElement("div")
    container.className = "obsidget-container"
    container.innerHTML = htmlStr
    shadow.appendChild(container)

    const api = {
      root: shadow,
      container: container,
      state: state,
      id: id,
      setState: (newState: any) => {
        api.state = { ...api.state, ...newState }
      },
      render: () => {
        container.innerHTML = htmlStr
      },
    }

    // Execute Widget JS
    try {
      const func = new Function("api", jsStr)
      func(api)
    } catch (e) {
      console.error(`Error executing obsidget ${id}:`, e)
    }
  })
})
