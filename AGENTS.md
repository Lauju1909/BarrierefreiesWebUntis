# 🤖 Hinweise für KI-Agenten (AI Agents Guide)

## ⚡ Automatisiertes Build-, Auto-Versioning- und Release-System
- **Automatische Versionserhöhung:** Die Versionsnummer in `version.json` wird bei jedem Push auf den Branch `main` **vollautomatisch durch GitHub Actions erhöht** (z. B. `1.9.29` -> `1.9.30`).
- **Automatischer Multi-Plattform Build (Windows & Linux):**
  - **Windows:** GitHub Actions kompiliert auf einem virtuellen Windows-Server (`windows-latest`) automatisch:
    - `Barrierefreies_WebUntis.exe` (über `csc.exe` aus `Program.cs`)
    - `Feedback_Zentrale.exe` (über `csc.exe` aus `FeedbackProgram.cs`)
  - **Linux:** GitHub Actions kompiliert auf einem Ubuntu-Server (`ubuntu-latest`) automatisch ein natives, eigenständiges Linux-Binary:
    - `Barrierefreies_WebUntis-Linux` (über PyInstaller aus `server.py` inklusive aller Assets `index.html`, `style.css`, `app.js`, `canteen_seed.json`)
- **Automatisches GitHub-Release:** Für jeden Commit auf `main` wird automatisch ein neues GitHub-Release erstellt und sowohl die Windows- als auch die Linux-Dateien als Download angehängt.
- **Saubere Trennung der Auto-Updater:**
  - Der Windows-Updater (`Program.cs`) aktualisiert ausschließlich die Windows-EXE und Windows-Dateien.
  - Der Linux-Betrieb (`server.py`) arbeitet völlig unabhängig davon und wird durch Windows-Updates niemals beeinträchtigt.

## 📌 Was KI-Agenten beachten MÜSSEN:
1. **Keine manuellen Releases oder Versionsnummern-Änderungen erzwingen:** Entwickle Programm-Features und Bugfixes normal. Nach dem Push auf `main` übernimmt GitHub Actions das Hochzählen der Patch-Version, das Taggen und das Veröffentlichen des Multiplattform-Releases vollautomatisch.
2. **Barrierefreiheit (WCAG 2.2 AAA & NVDA / JAWS / Orca):** Alle Änderungen müssen 100% barrierefrei bleiben (vollständige Tastaturbedienung, ARIA-Live-Regionen, keine störenden Emojis im Screenreader-Modus).
