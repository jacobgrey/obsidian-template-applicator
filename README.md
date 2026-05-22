# Template Applicator

An Obsidian plugin that does two things:

1. **Creates new notes in the folder selected in the file explorer.** When you click a folder in the left sidebar tree, the next `Ctrl/Cmd+N` (or "New note" ribbon button) creates the note inside that folder — even if you haven't opened a file there. Falls back to Obsidian's built-in "Default location for new notes" setting when nothing is selected.
2. **Auto-applies a template matching the folder's name.** When a new note is created inside, say, `Meetings/`, the plugin looks for `Templates/Meetings.md` in your configured templates folder and applies it. Works with Templater (`<% tp.* %>` syntax) if installed, falls back to the core Templates plugin (`{{title}}`, `{{date}}`, `{{time}}`) otherwise.

## Settings

- **Create new notes in selected folder** — toggle behavior 1.
- **Apply folder-name templates** — toggle behavior 2.
- **Detected templates folder** — read-only display of where the plugin will look for templates (sourced from Templater or the core Templates plugin).

## Commands

- **New note in selected folder** — same routing as the Ctrl+N override, exposed as a discrete command for hotkey binding.

## Build

```
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault's `.obsidian/plugins/template-applicator/` folder, then enable the plugin in Obsidian.
