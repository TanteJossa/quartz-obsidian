document.addEventListener("nav", async () => {
  console.log("TikZJax: nav event triggered")
  const tikzScripts = document.querySelectorAll('script[type="text/tikz"]')
  console.log(`TikZJax: Found ${tikzScripts.length} tikz scripts`)
  if (tikzScripts.length === 0) return

  const renderTikZ = () => {
    // @ts-ignore
    if (typeof window.tikzjax !== "undefined") {
      console.log("TikZJax: window.tikzjax is defined, rendering...")
      // @ts-ignore
      window.tikzjax.render()
      return true
    }
    return false
  }

  if (!renderTikZ()) {
    console.log("TikZJax: window.tikzjax not ready, starting polling...")
    const maxRetries = 100
    let retries = 0
    const interval = setInterval(() => {
      retries++
      if (renderTikZ()) {
        console.log("TikZJax: Polling success")
        clearInterval(interval)
      } else if (retries >= maxRetries) {
        console.warn("TikZJax: Max retries reached, window.tikzjax still undefined")
        clearInterval(interval)
      }
    }, 100)
  }
})

window.addEventListener("load", () => {
  console.log("TikZJax: window load event triggered")
  const tikzScripts = document.querySelectorAll('script[type="text/tikz"]')
  if (tikzScripts.length === 0) return

  // @ts-ignore
  if (typeof window.tikzjax !== "undefined") {
    console.log("TikZJax: rendering on window load")
    // @ts-ignore
    window.tikzjax.render()
  }
})

