/**
 * TikZJax Standalone Core Implementation
 * Extracted from obsidian-tikzjax (original by kisonecat and drgrice1)
 * 
 * This module provides a clean interface for rendering TikZ code to SVGs.
 */

// Global state for TikZJax
let isTikZJaxInitialized = false;

/**
 * Loads the necessary dependencies for TikZJax.
 * Call this once before attempting to render.
 */
async function loadTikZJaxDependencies(basePath = '') {
    if (isTikZJaxInitialized) return;

    // 1. Load LocalForage for caching (Required by TikZJax)
    if (!window.localforage) {
        await loadScript('https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js');
    }

    // 2. Configure LocalForage
    try {
        window.localforage.config({ name: 'TikzJax', storeName: 'svgImages' });
    } catch (e) {
        console.warn("LocalForage already configured or failed:", e);
    }

    // 3. Load SVGO (Optional but recommended for mobile compatibility)
    // SVGO is an ESM module in the provided browser build
    // We don't load it here as we'll use the module script in the HTML
    // if (basePath) {
    //     await loadScript(`${basePath}/svgo.browser.js`);
    // }

    // 4. Load TikZJax Core
    // Standard loading with a script tag is better for TikZJax's worker detection
    const script = document.createElement('script');
    script.src = `${basePath}/tikzjax.js`;
    script.id = 'tikzjax'; 
    
    await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });

    // Add CSS fix for SVGs if not already present
    // These styles are critical for correct LaTeX text rendering in the SVG
    if (!document.getElementById('tikzjax-style')) {
        // Fetch the external styles from the obsidian-tikzjax folder
        const styleResponse = await fetch(`${basePath}/styles.css`);
        const cssContent = await styleResponse.text();

        const style = document.createElement('style');
        style.id = 'tikzjax-style';
        style.textContent = cssContent + `
            /* Fix for axis labels and text in TikZJax */
            svg {
                display: block;
                overflow: visible;
                margin-left: auto;
                margin-right: auto;
            }
        `;
        document.head.appendChild(style);
    }

    isTikZJaxInitialized = true;
}

/**
 * Renders TikZ source code to an SVG string.
 * 
 * @param {string} source - The raw TikZ/LaTeX source code.
 * @param {object} options - Configuration options.
 * @returns {Promise<string>} - The rendered SVG as a string.
 */
async function renderTikZToSVG(source, options = {}) {
    const {
        invertColors = false,
        optimize = true,
        timeout = 30000
    } = options;

    // Tidy source
    const cleanSource = source
        .replaceAll("&nbsp;", "")
        .split("\n")
        .map(line => line.trim())
        .filter(line => line)
        .join("\n");

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error("TikZJax rendering timed out"));
        }, timeout);

        // TikZJax uses MutationObserver to detect <script type="text/tikz">
        // We create a temporary one and wait for it to be replaced by an SVG
        const tempDiv = document.createElement('div');
        tempDiv.style.display = 'none';
        document.body.appendChild(tempDiv);

        const script = document.createElement('script');
        script.type = 'text/tikz';
        script.textContent = cleanSource;
        tempDiv.appendChild(script);

        const handleFinished = (e) => {
            clearTimeout(timer);
            let svgEl = e.target;
            let svg = svgEl.outerHTML;

            // Fix for TikZJax character encoding issues (specifically soft hyphens vs real minus)
            // As seen in obsidian-tikzjax/tikzjax.js
            svg = svg.replaceAll("&#173;", "&#172;");

            // obsidian-tikzjax specific post-processing
            // Unique-ify IDs based on a hash of the source to prevent conflicts
            const hash = btoa(cleanSource).substring(0, 16).replace(/[^a-z0-9]/gi, '');
            let pgfMatches = svg.match(/\bid="pgf[^"]*"/g);
            if (pgfMatches) {
                pgfMatches.sort((a, b) => b.length - a.length);
                for (let match of pgfMatches) {
                    let id = match.replace(/id="pgf(.*)"/, "$1");
                    svg = svg.replaceAll("pgf" + id, `pgf${hash}${id}`);
                }
            }

            if (invertColors) {
                svg = colorSVGinDarkMode(svg);
            }

            if (optimize) {
                const optimizer = window.optimize || (window.svgo && window.svgo.optimize);
                if (optimizer) {
                    try {
                        svg = optimizer(svg, {
                            plugins: [{ name: 'preset-default', params: { overrides: { cleanupIDs: false } } }]
                        }).data;
                    } catch (err) {
                        console.warn("SVGO optimization failed:", err);
                    }
                }
            }

            tempDiv.remove();
            resolve(svg);
        };

        // Listen for the specific event dispatched by TikZJax
        document.addEventListener('tikzjax-load-finished', handleFinished, { once: true });
    });
}

/**
 * Utility to load external scripts
 */
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

/**
 * Colors SVG for dark mode by replacing black/white with variables
 */
function colorSVGinDarkMode(svg) {
    return svg.replaceAll(/("#000"|"black")/g, `"currentColor"`)
              .replaceAll(/("#fff"|"white")/g, `"var(--background-primary)"`);
}

// Export for usage
window.TikZJaxRenderer = {
    load: loadTikZJaxDependencies,
    render: renderTikZToSVG
};
