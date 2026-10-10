# 🤖 Hinweise für KI-Agenten (AI Agents Guide)

## ⚡ Automatisiertes Build- und Release-System
- **Automatische Versionserhöhung:** Die Versionsnummer in `version.json` wird bei jedem Push auf den Branch `main` **vollautomatisch durch GitHub Actions erhöht**.
- **Automatischer Windows EXE-Build:** GitHub Actions kompiliert auf einem virtuellen Windows-Server (`windows-latest`) automatisch:
  - `Barrierefreies_WebUntis.exe` (über `csc.exe` aus `Program.cs`)
  - `Feedback_Zentrale.exe` (über `csc.exe` aus `FeedbackProgram.cs`)
- **Automatisches GitHub-Release:** Für jeden Stand wird automatisch ein GitHub-Release erstellt und die frisch erstellten `.exe`-Dateien als Download angehängt.

## 📌 Was KI-Agenten beachten MÜSSEN:
1. **Keine manuellen Releases oder Versionsnummern-Änderungen erzwingen:** Ändere Programm-Code und HTML/CSS/JS wie gewünscht. Nach dem Push auf `main` übernimmt GitHub Actions das Hochzählen der Patch-Version, das Taggen und das Veröffentlichen des Releases vollautomatisch.
2. **Barrierefreiheit (WCAG 2.2 AAA & NVDA / JAWS):** Alle Änderungen müssen 100% barrierefrei bleiben (vollständige Tastaturbedienung, ARIA-Live-Regionen, keine störenden Emojis im Screenreader-Modus).
