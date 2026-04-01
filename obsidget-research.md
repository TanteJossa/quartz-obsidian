# Obsidian-Obsidget Research Report

## Overview
`obsidian-obsidget` is an Obsidian plugin that allows users to create and embed interactive widgets in their Markdown notes. It uses a custom code block syntax and provides a gallery of pre-made widgets.

## Syntax
Widgets are defined using a code block with the `widget` language identifier:

\`\`\`widget
ID: widget-id (optional)
HTML content (optional if ID is provided and found in gallery)
---
CSS content
---
JS content
---
JSON Data
\`\`\`

### Section Breakdown
1.  **ID/HTML**: 
    *   Can start with `ID: my-widget-id`.
    *   If the rest of this section is empty, the plugin treats it as a "Linked Widget" and attempts to load the HTML, CSS, and JS from the gallery.
    *   If not empty, it's a "Local Widget" and uses the provided HTML.
2.  **CSS**: Styles for the widget.
3.  **JS**: Logic for the widget.
4.  **JSON Data**: Initial state or configuration for the widget.

## Linked Widgets & Gallery
*   **Location**: Gallery widgets are stored in `.obsidian/plugins/obsidian-obsidget/gallery/`.
*   **Format**: Files are `.tsx` or `.ts` containing a default export of a JSON object.
*   **Example Structure**:
    ```json
    {
      "id": "calculator-studio",
      "name": "Calculator Studio",
      "html": "...",
      "css": "...",
      "js": "...",
      "data": { ... }
    }
    ```

## Rendering Logic
1.  **Encapsulation**: Each widget is rendered inside a **Shadow DOM** to prevent style leakage and JS conflicts.
2.  **JS Execution**: The JavaScript code is wrapped in a function that receives an `api` object.
3.  **API Provided to Widgets**:
    *   `root`: The Shadow Root of the widget.
    *   `getState()`: Retrieves the JSON data from the 4th section of the code block.
    *   `saveState(data)`: (Obsidian-only) Writes updated JSON data back to the Markdown file.
    *   `instanceId`: Unique identifier for the widget instance.
    *   `requestUrl`: Obsidian's API for making network requests.
    *   `getFrontmatter(path)` / `updateFrontmatter(data, path)`: File metadata access.
    *   `getFiles(extension)`, `readFile(path)`, `writeFile(path, content)`: Vault access.
4.  **Event Binding**: The plugin automatically binds `on*` attributes in the HTML (e.g., `onclick`) to the widget's JS context.

## Quartz Integration Strategy
1.  **New Transformer**: Create `quartz/plugins/transformers/obsidget.ts`.
2.  **Markdown Parser**:
    *   Detect `code` nodes with `lang === "widget"`.
    *   Parse the sections using `---` as a delimiter.
    *   If it's a linked widget, resolve the template from a configurable gallery path.
3.  **HAST Transformation**:
    *   Convert the code block to a `div` with a specific class (e.g., `obsidget-container`).
    *   Store the HTML, CSS, JS, and Data in `data-*` attributes or as children.
4.  **Client-side JS**:
    *   Inject a script that finds all `obsidget-container` elements.
    *   Initialize each widget using Shadow DOM.
    *   Provide a mock/limited version of the `api` object (since Quartz is static).
    *   `getState` will work, but `saveState` and vault operations will not (unless using a backend).
5.  **CSS Injection**:
    *   Inject base styles for the widget containers.
