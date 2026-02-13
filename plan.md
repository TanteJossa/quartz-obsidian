# Plan for Sensitive Data Filtering and Password Protection

## 1. Sensitive Data Filtering
We need to exclude notes that have `site: false` in their frontmatter during the build process.

- [ ] Create `quartz/plugins/filters/site.ts`
    - Implement a filter plugin similar to `RemoveDrafts`.
    - Logic: check if `vfile.data.frontmatter.site` is explicitly `false`.
- [ ] Export the new filter in `quartz/plugins/filters/index.ts`.
- [ ] Register the new filter in `quartz.config.ts` under `plugins.filters`.

## 2. System-wide Password Protection
We will implement a client-side PIN protection system.

- [ ] Create `quartz/components/scripts/password.inline.ts`
    - Logic to check `localStorage` for a valid session.
    - If valid, hide the lock screen.
    - If invalid, show the lock screen and listen for PIN input.
    - Validate PIN against `6969`.
    - On success, set `localStorage` and unlock.
- [ ] Create `quartz/components/styles/password.scss`
    - Styles for a full-screen overlay that blocks content interaction.
    - Styling for the PIN input form.
- [ ] Create `quartz/components/PasswordProtection.tsx`
    - A Quartz component that:
        - Imports the inline script and styles.
        - Renders the lock screen HTML (overlay, input, button).
        - Is configured to load the script `beforeDOMLoaded` or `afterDOMLoaded` (likely `afterDOMLoaded` but needs to run fast, or CSS handles the initial hide).
- [ ] Export the new component in `quartz/components/index.ts`.
- [ ] Add `Component.PasswordProtection()` to `quartz.layout.ts`.
    - Add it to `sharedPageComponents` (e.g., in `beforeBody`) so it applies to all pages.

## Verification
- Verify that pages with `site: false` are not generated.
- Verify that opening the site shows a lock screen.
- Verify that entering `6969` unlocks the site and persists the session.
