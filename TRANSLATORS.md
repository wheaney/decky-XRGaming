# Translating XR Gaming Plugin

Thank you for helping translate the XR Gaming Decky plugin! This guide explains how to contribute a translation.

## Supported Languages

| Code    | Language              | File                                     |
|---------|-----------------------|------------------------------------------|
| `en`    | English (base)        | `src/locales/en/translation.json`        |
| `de`    | German                | `src/locales/de/translation.json`        |
| `es`    | Spanish               | `src/locales/es/translation.json`        |
| `fr`    | French                | `src/locales/fr/translation.json`        |
| `it`    | Italian               | `src/locales/it/translation.json`        |
| `ja`    | Japanese              | `src/locales/ja/translation.json`        |
| `zh-CN` | Simplified Chinese    | `src/locales/zh-CN/translation.json`     |
| `ru`    | Russian               | `src/locales/ru/translation.json`        |
| `ko`    | Korean                | `src/locales/ko/translation.json`        |
| `pt-BR` | Portuguese (Brazil)   | `src/locales/pt-BR/translation.json`     |
| `pl`    | Polish                | `src/locales/pl/translation.json`        |
| `tr`    | Turkish               | `src/locales/tr/translation.json`        |
| `zh-TW` | Traditional Chinese   | `src/locales/zh-TW/translation.json`     |

## How to Contribute a Translation

### 1. Open the English base file

The English file at `src/locales/en/translation.json` contains all translatable strings organized by section. Use this as your reference for what each key means.

### 2. Find your language file

Open the file for your language (e.g., `src/locales/de/translation.json` for German). The file starts as an empty JSON object `{}`. Any key that is missing from your language file will automatically fall back to English.

### 3. Add translations

Copy keys from the English file into your language file and replace the English values with your translations. You do **not** need to translate every key — untranslated keys will fall back to English.

**Example** — German partial translation:
```json
{
  "device": {
    "noDevice": "Kein Gerät verbunden",
    "connected": "verbunden"
  },
  "button": {
    "needHelp": "Hilfe benötigt?",
    "showAdvanced": "Erweiterte Einstellungen anzeigen",
    "hideAdvanced": "Erweiterte Einstellungen ausblenden"
  }
}
```

### 4. Important rules

- **Keep the same JSON structure** (nested keys) as the English file.
- **Do not translate key names** — only translate the values (strings on the right side of `:`).
- **Preserve placeholders** like `{{time}}`, `{{count}}`, `{{units}}` — these are filled in at runtime with dynamic values. Translate the surrounding text but keep the `{{...}}` placeholders as-is.
- **Preserve HTML tags** in strings that contain them (e.g., `<b>`, `<i>`) — these add formatting. Only translate the surrounding text.
- **Do not change** special Unicode characters like `\u2011` (non-breaking hyphen) or `\u00a0` (non-breaking space) — keep them as-is.

### 5. Submit your translation

Open a pull request with your updated language file. Please test your translation if possible (see the Development section below).

---

## Adding a New Language

If your language is not listed above:

1. Create a new directory: `src/locales/<language-code>/`
2. Create `src/locales/<language-code>/translation.json` starting with `{}`
3. Add the import and resource entry in `src/i18n.ts`
4. Open a pull request

Use [BCP 47](https://www.ietf.org/rfc/bcp/bcp47.txt) language tags (e.g., `pt-BR`, `zh-TW`).

---

## Maintaining Translations (for maintainers)

When new strings are added to the codebase:

1. Add the new English string(s) to `src/locales/en/translation.json` under the appropriate section.
2. Open an issue or PR noting which keys were added so translators can update their files.
3. Existing translations will continue to work — missing keys fall back to English automatically.

No build step is needed for translation files themselves; they are bundled into the plugin at build time.
