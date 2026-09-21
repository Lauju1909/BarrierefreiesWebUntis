
// =============================================================================
// ISERV INTEGRATION MODULE (WCAG 2.2 AAA - E-MAIL, KALENDER & AUFGABEN)
// =============================================================================

function togglePasswordVisibility(inputId, btnEl) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    if (btnEl) btnEl.setAttribute('aria-label', 'Passwort verbergen');
    announceSR('Passwort wird im Klartext angezeigt.', 'polite');
  } else {
    inp.type = 'password';
    if (btnEl) btnEl.setAttribute('aria-label', 'Passwort anzeigen');
    announceSR('Passwort ist verborgen.', 'polite');
  }
  playEarcon('open');
}

function updateIServUIState() {
  const isEnabled = !!appData.config.iservEnabled;
  const formEl = document.getElementById('iserv-credentials-form');
  if (formEl) formEl.style.display = isEnabled ? 'block' : 'none';

  const badgeEl = document.getElementById('iserv-status-badge');
  if (badgeEl) {
    if (!isEnabled) {
      badgeEl.textContent = 'Deaktiviert';
      badgeEl.style.background = 'rgba(100, 116, 139, 0.15)';
      badgeEl.style.borderColor = 'var(--border-color)';
    } else {
      const hasCreds = !!(appData.config.iservServer && appData.config.iservUsername && appData.config.iservPassword);
      badgeEl.textContent = hasCreds ? 'Aktiviert & Verbunden' : 'Aktiviert (Zugangsdaten fehlen)';
      badgeEl.style.background = hasCreds ? 'rgba(22, 163, 74, 0.15)' : 'rgba(234, 179, 8, 0.15)';
      badgeEl.style.borderColor = hasCreds ? 'var(--accent-ok)' : 'var(--accent-warning)';
    }
  }

  // Filter Buttons in den Reitern ein-/ausblenden
  const btnMsgIserv = document.getElementById('btn-filter-msg-iserv');
  if (btnMsgIserv) btnMsgIserv.style.display = isEnabled ? 'inline-flex' : 'none';

  const btnHwIserv = document.getElementById('hw-filter-iserv');
  if (btnHwIserv) btnHwIserv.style.display = isEnabled ? 'inline-flex' : 'none';

  const btnExamIserv = document.getElementById('filter-iserv');
  if (btnExamIserv) btnExamIserv.style.display = isEnabled ? 'inline-flex' : 'none';

  const btnSync = document.getElementById('btn-iserv-sync');
  if (btnSync) btnSync.style.display = (isEnabled && appData.config.iservPassword) ? 'inline-flex' : 'none';
}

function toggleIServIntegration(enabled) {
  appData.config.iservEnabled = !!enabled;
  saveAppData();
  updateIServUIState();

  if (appData.config.iservEnabled) {
    playEarcon('success');
    announceSR('IServ-Funktionen wurden aktiviert. Bitte trage deine IServ-Zugangsdaten ein und teste die Verbindung.', 'assertive');
    if (appData.config.iservServer && appData.config.iservUsername && appData.config.iservPassword) {
      syncIServData(false);
    }
  } else {
    playEarcon('delete');
    announceSR('IServ-Funktionen wurden deaktiviert.', 'polite');
    renderMessagesView();
    renderHomework();
    renderExams();
  }
}

async function testAndSaveIServLogin() {
  const srvEl = document.getElementById('cfg-iserv-server');
  const userEl = document.getElementById('cfg-iserv-username');
  const passEl = document.getElementById('cfg-iserv-password');
  const statusBox = document.getElementById('iserv-status-box');

  const srv = (srvEl ? srvEl.value : '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const user = (userEl ? userEl.value : '').trim();
  const pass = (passEl ? passEl.value : '').trim();

  if (!srv || !user || !pass) {
    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.innerHTML = '<div style="color: var(--accent-danger); font-weight: bold;"><span class="emoji-icon" aria-hidden="true">⚠️ </span>Bitte Server, Benutzername und Passwort vollständig ausfüllen.</div>';
    }
    announceSR('Bitte Server, Benutzername und Passwort für IServ vollständig ausfüllen.', 'assertive');
    playEarcon('delete');
    return;
  }

  if (statusBox) {
    statusBox.style.display = 'block';
    statusBox.innerHTML = '<div style="color: var(--text-color); font-weight: bold;"><span class="emoji-icon" aria-hidden="true">⏳ </span>Verbindung zu ' + escHtml(srv) + ' wird geprüft...</div>';
  }
  announceSR('Verbindung zu IServ wird getestet...', 'polite');

  try {
    const res = await fetch('/api/iserv/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server: srv, username: user, password: pass })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      appData.config.iservEnabled = true;
      appData.config.iservServer = srv;
      appData.config.iservUsername = user;
      appData.config.iservPassword = pass;
      saveAppData();
      updateIServUIState();

      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.innerHTML = '<div style="background: rgba(22, 163, 74, 0.15); border: 2px solid var(--accent-ok); border-radius: var(--radius-sm); padding: 12px; color: var(--accent-ok); font-weight: bold;"><span class="emoji-icon" aria-hidden="true">✅ </span>Erfolgreich mit IServ verbunden! Zugangsdaten wurden sicher gespeichert.</div>';
      }

      playEarcon('success');
      const msg = 'Erfolgreich mit IServ verbunden! Lade jetzt E-Mails, Kalender und Aufgaben...';
      announceSR(msg, 'assertive');
      speak('Erfolgreich mit IServ verbunden.');

      await syncIServData(true);
    } else {
      const errMsg = data.error || 'Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.';
      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.innerHTML = '<div style="background: rgba(220, 38, 38, 0.15); border: 2px solid var(--accent-danger); border-radius: var(--radius-sm); padding: 12px; color: var(--accent-danger); font-weight: bold;"><span class="emoji-icon" aria-hidden="true">❌ </span>' + escHtml(errMsg) + '</div>';
      }
      playEarcon('delete');
      announceSR('IServ Verbindungsfehler: ' + errMsg, 'assertive');
      speak('IServ Verbindungsfehler: ' + errMsg);
    }
  } catch (err) {
    const errMsg = 'Server nicht erreichbar oder Netzwerkfehler: ' + (err.message || err);
    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.innerHTML = '<div style="background: rgba(220, 38, 38, 0.15); border: 2px solid var(--accent-danger); border-radius: var(--radius-sm); padding: 12px; color: var(--accent-danger); font-weight: bold;"><span class="emoji-icon" aria-hidden="true">❌ </span>' + escHtml(errMsg) + '</div>';
    }
    playEarcon('delete');
    announceSR(errMsg, 'assertive');
  }
}

async function syncIServData(userInitiated = false) {
  if (!appData.config.iservEnabled) return;
  const srv = appData.config.iservServer;
  const user = appData.config.iservUsername;
  const pass = appData.config.iservPassword;
  if (!srv || !user || !pass) return;

  const headers = {
    'X-IServ-Server': srv,
    'X-IServ-User': user,
    'X-IServ-Pass': pass
  };

  if (userInitiated) {
    announceSR('Synchronisiere IServ E-Mails, Kalender und Aufgaben...', 'polite');
  }

  // 1. IServ E-Mails abrufen
  try {
    const mRes = await fetch('/api/iserv/emails', { headers });
    if (mRes.ok) {
      const mData = await mRes.json();
      let rawList = [];
      if (mData.data && Array.isArray(mData.data)) rawList = mData.data;
      else if (mData.data && mData.data.data && Array.isArray(mData.data.data)) rawList = mData.data.data;
      else if (Array.isArray(mData)) rawList = mData;

      if (rawList.length === 0 && mData.data && mData.data.accounts && mData.data.accounts.valid) {
        const validAccs = Object.values(mData.data.accounts.valid);
        validAccs.forEach(acc => {
          const mboxes = acc.mailboxes && acc.mailboxes.mailboxes;
          if (mboxes) {
            const inbox = mboxes.inbox;
            if (inbox && inbox.totalCount > 0) {
              rawList.push({
                id: 'iserv-mail-inbox-summary',
                from: acc.displayName || acc.username || 'IServ Posteingang',
                subject: `Posteingang: ${inbox.totalCount} E-Mails (${inbox.unreadCount} ungelesen)`,
                preview: `In deinem offiziellen IServ-Postfach (${acc.displayName || ''}) befinden sich aktuell ${inbox.totalCount} E-Mails, davon ${inbox.unreadCount} neu/ungelesen. Klicke auf „In IServ öffnen“, um alle E-Mails direkt zu lesen oder zu beantworten.`,
                date: new Date().toISOString(),
                unread: (inbox.unreadCount > 0)
              });
            }
          }
        });
      }

      appData.iservEmails = rawList.map((m, idx) => {
        let senderStr = 'Unbekannt';
        if (m.from && Array.isArray(m.from) && m.from[0]) {
          senderStr = m.from[0].name || m.from[0].email || 'Unbekannt';
        } else if (typeof m.from === 'string') {
          senderStr = m.from;
        } else if (m.sender) {
          senderStr = m.sender;
        }

        let dateStr = '';
        if (m.date && typeof m.date === 'object' && m.date.date) {
          dateStr = m.date.date;
        } else if (m.date) {
          dateStr = String(m.date);
        }

        let isUnread = false;
        if (Array.isArray(m.flags)) {
          isUnread = !m.flags.includes('\\Seen') && !m.flags.includes('Seen');
        } else if (typeof m.unread === 'boolean') {
          isUnread = m.unread;
        }

        return {
          id: m.id || m.uid || ('iserv-mail-' + idx),
          type: 'iserv',
          sender: senderStr,
          subject: m.subject || '(Kein Betreff)',
          text: m.preview || m.text || m.body || m.snippet || '',
          date: dateStr || new Date().toISOString(),
          unread: isUnread
        };
      });
    }
  } catch (e) {
    console.warn('IServ Mail Sync Warnung:', e);
  }

  // 2. IServ Kalender abrufen
  try {
    const cRes = await fetch('/api/iserv/calendar', { headers });
    if (cRes.ok) {
      const cData = await cRes.json();
      let eventList = [];
      if (cData.upcoming) {
        if (Array.isArray(cData.upcoming)) {
          eventList = eventList.concat(cData.upcoming);
        } else if (cData.upcoming.events && Array.isArray(cData.upcoming.events)) {
          eventList = eventList.concat(cData.upcoming.events);
        }
      }
      if (cData.events) {
        if (Array.isArray(cData.events)) {
          eventList = eventList.concat(cData.events);
        } else if (typeof cData.events === 'object') {
          Object.values(cData.events).forEach(feedItems => {
            if (Array.isArray(feedItems)) eventList = eventList.concat(feedItems);
          });
        }
      }

      // Deduplizieren und normalisieren
      const seenIds = new Set();
      appData.iservEvents = [];
      eventList.forEach((ev, idx) => {
        const id = ev.id || ('iserv-ev-' + idx);
        if (seenIds.has(id)) return;
        seenIds.add(id);

        let sDate = ev.start || ev.startDate || ev.date || '';
        let eDate = ev.end || ev.endDate || sDate;
        let title = ev.title || ev.summary || 'IServ Termin';
        let desc = ev.description || ev.details || '';
        let loc = ev.location || ev.room || 'IServ';

        appData.iservEvents.push({
          id: id,
          title: title,
          description: desc,
          startDate: sDate,
          endDate: eDate,
          location: loc,
          allDay: !!ev.allDay
        });
      });
    }
  } catch (e) {
    console.warn('IServ Calendar Sync Warnung:', e);
  }

  // 3. IServ Aufgaben abrufen
  try {
    const exRes = await fetch('/api/iserv/exercises', { headers });
    if (exRes.ok) {
      const exData = await exRes.json();
      let rawTasks = [];
      if (exData.exercises && Array.isArray(exData.exercises)) rawTasks = exData.exercises;
      else if (exData.data && Array.isArray(exData.data)) rawTasks = exData.data;
      else if (exData.data && exData.data.data && Array.isArray(exData.data.data)) rawTasks = exData.data.data;
      else if (Array.isArray(exData)) rawTasks = exData;

      appData.iservTasks = rawTasks.map((t, idx) => {
        return {
          id: t.id || ('iserv-task-' + idx),
          title: t.title || t.name || t.subject || 'Aufgabe',
          subject: t.subject || t.course || '',
          teacher: t.teacher || t.author || '',
          dueDate: t.end || t.dueDate || t.date || '',
          completed: !!t.done || !!t.completed,
          description: t.description || t.text || t.content || ''
        };
      });
    }
  } catch (e) {
    console.warn('IServ Exercises Sync Warnung:', e);
  }

  saveAppData();
  renderMessagesView();
  renderHomework();
  renderExams();

  if (userInitiated) {
    playEarcon('success');
    const msg = `IServ aktualisiert: ${appData.iservEmails.length} E-Mails, ${appData.iservTasks.length} Aufgaben und ${appData.iservEvents.length} Termine geladen.`;
    announceSR(msg, 'polite');
    speak(msg);
  }
}

function speakIServEmail(mailId) {
  const mail = (appData.iservEmails || []).find(m => String(m.id) === String(mailId));
  if (!mail) return;
  const dObj = mail.date ? new Date(mail.date) : null;
  const dateFormatted = dObj && !isNaN(dObj) ? formatGermanDate(dObj) : '';
  const text = `IServ E-Mail von ${mail.sender}${dateFormatted ? ' vom ' + dateFormatted : ''}: Betreff: ${mail.subject}. Inhalt: ${mail.text || 'Keine Textvorschau vorhanden.'}`;
  speak(text, true);
  announceSR(text, 'assertive');
}

function speakIServTask(taskId) {
  const task = (appData.iservTasks || []).find(t => String(t.id) === String(taskId));
  if (!task) return;
  const dObj = task.dueDate ? new Date(task.dueDate) : null;
  const dateFormatted = dObj && !isNaN(dObj) ? formatGermanDate(dObj) : (task.dueDate || 'Kein Abgabetermin');
  const statusStr = task.completed ? 'Bereits erledigt' : 'Noch offen';
  const text = `IServ Aufgabe: ${task.title}. ${task.subject ? 'Fach ' + task.subject + '. ' : ''}${task.teacher ? 'Von Lehrkraft ' + task.teacher + '. ' : ''}Fällig am ${dateFormatted}. Status: ${statusStr}. ${task.description ? 'Beschreibung: ' + task.description : ''}`;
  speak(text, true);
  announceSR(text, 'assertive');
}


// =============================================================================
// BARRIEREFREIE AUDIO-SIGNALE (EARCONS FÜR BLINDE NUTZER)
// =============================================================================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtor();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playEarcon(type) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Dreiklang aufwärts (C5 - E5 - G5)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'done') {
      // Zweiklang Erledigt-Haken (G5 - C6)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(783.99, now);
      osc.frequency.setValueAtTime(1046.50, now + 0.06);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'open') {
      // Weicher Aufwärtston beim Öffnen von Dialogen
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.12);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'delete') {
      // Abwärtston beim Löschen
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(550, now);
      osc.frequency.exponentialRampToValueAtTime(330, now + 0.15);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch (e) { }
}

/**
 * Barrierefreier Stundenplan & Prüfungsmanager
 * Speziell für das LWL-Berufskolleg Soest (Förderschwerpunkt Sehen)
 * 100% NVDA / JAWS optimiert, WCAG 2.2 AAA
 * Reine WebUntis-API-Anbindung ohne manuelle Bearbeitung
 */

// =============================================================================
// 1. STANDARD-DATEN & VORKONFIGURATION (LWL-BERUFSKOLLEG SOEST)
// =============================================================================
const DEFAULT_CONFIG = {
  schoolName: 'LWL-Berufskolleg Soest',
  schoolShort: 'lwl-bk-soest',
  server: 'lwl-bk-soest.webuntis.com',
  tenantId: '5238400',
  username: '',
  password: '',
  rememberLogin: true,
  theme: 'theme-light',
  fontSize: 'font-normal',
  ttsEnabled: true,
  ttsRate: 1.0,
  textOnlyMode: false,
  iservEnabled: false,
  iservServer: 'lwl-bk-soest.de',
  iservUsername: '',
  iservPassword: ''
};



const DEFAULT_PERIODS = [
  { period: 1, start: '07:45', end: '08:30' },
  { period: 2, start: '08:30', end: '09:15' },
  { period: 3, start: '09:35', end: '10:20' },
  { period: 4, start: '10:20', end: '11:05' },
  { period: 5, start: '11:25', end: '12:10' },
  { period: 6, start: '12:10', end: '12:55' },
  { period: 7, start: '13:20', end: '14:05' },
  { period: 8, start: '14:10', end: '14:55' },
  { period: 9, start: '14:55', end: '15:40' },
  { period: 10, start: '15:40', end: '16:25' }
];

const DEFAULT_NRW_HOLIDAYS_2026_2027 = [
  { id: 'hol-schulstart-26', name: 'Schuljahresbeginn 2026/2027', longName: 'Erster Schultag nach den Sommerferien (LWL-Berufskolleg Soest)', startDate: '2026-09-02', endDate: '2026-09-02', startDateNum: 20260902, endDateNum: 20260902, type: 'appointment' },
  { id: 'hol-einheit-26', name: 'Tag der Deutschen Einheit', longName: 'Tag der Deutschen Einheit (Feiertag)', startDate: '2026-10-03', endDate: '2026-10-03', startDateNum: 20261003, endDateNum: 20261003, type: 'holiday' },
  { id: 'hol-herbst-26', name: 'Herbstferien', longName: 'Herbstferien 2026 (NRW)', startDate: '2026-10-17', endDate: '2026-10-31', startDateNum: 20261017, endDateNum: 20261031, type: 'holiday' },
  { id: 'hol-allerheiligen-26', name: 'Allerheiligen', longName: 'Allerheiligen (Feiertag)', startDate: '2026-11-01', endDate: '2026-11-01', startDateNum: 20261101, endDateNum: 20261101, type: 'holiday' },
  { id: 'hol-weihnachten-26', name: 'Weihnachtsferien', longName: 'Weihnachtsferien 2026/2027 (NRW)', startDate: '2026-12-23', endDate: '2027-01-06', startDateNum: 20261223, endDateNum: 20270106, type: 'holiday' },
  { id: 'hol-halbjahr-27', name: 'Zeugnisausgabe 1. Halbjahr', longName: 'Zeugnisausgabe zum 1. Schulhalbjahr', startDate: '2027-01-29', endDate: '2027-01-29', startDateNum: 20270129, endDateNum: 20270129, type: 'appointment' },
  { id: 'hol-karneval-27', name: 'Rosenmontag', longName: 'Rosenmontag (beweglicher Ferientag)', startDate: '2027-02-08', endDate: '2027-02-08', startDateNum: 20270208, endDateNum: 20270208, type: 'holiday' },
  { id: 'hol-ostern-27', name: 'Osterferien', longName: 'Osterferien 2027 (NRW)', startDate: '2027-03-22', endDate: '2027-04-03', startDateNum: 20270322, endDateNum: 20270403, type: 'holiday' },
  { id: 'hol-karfreitag-27', name: 'Karfreitag', longName: 'Karfreitag (Feiertag)', startDate: '2027-03-26', endDate: '2027-03-26', startDateNum: 20270326, endDateNum: 20270326, type: 'holiday' },
  { id: 'hol-ostermontag-27', name: 'Ostermontag', longName: 'Ostermontag (Feiertag)', startDate: '2027-03-29', endDate: '2027-03-29', startDateNum: 20270329, endDateNum: 20270329, type: 'holiday' },
  { id: 'hol-arbeit-27', name: 'Tag der Arbeit', longName: 'Tag der Arbeit (Feiertag)', startDate: '2027-05-01', endDate: '2027-05-01', startDateNum: 20270501, endDateNum: 20270501, type: 'holiday' },
  { id: 'hol-himmelfahrt-27', name: 'Christi Himmelfahrt', longName: 'Christi Himmelfahrt (Feiertag)', startDate: '2027-05-06', endDate: '2027-05-06', startDateNum: 20270506, endDateNum: 20270506, type: 'holiday' },
  { id: 'hol-pfingstmontag-27', name: 'Pfingstmontag', longName: 'Pfingstmontag (Feiertag)', startDate: '2027-05-17', endDate: '2027-05-17', startDateNum: 20270517, endDateNum: 20270517, type: 'holiday' },
  { id: 'hol-pfingsten-27', name: 'Pfingstdienstag', longName: 'Pfingstdienstag (Ferientag NRW)', startDate: '2027-05-18', endDate: '2027-05-18', startDateNum: 20270518, endDateNum: 20270518, type: 'holiday' },
  { id: 'hol-fronleichnam-27', name: 'Fronleichnam', longName: 'Fronleichnam (Feiertag)', startDate: '2027-05-27', endDate: '2027-05-27', startDateNum: 20270527, endDateNum: 20270527, type: 'holiday' },
  { id: 'hol-zeugnis-27', name: 'Zeugnisausgabe Schuljahresende', longName: 'Zeugnisausgabe Schuljahresende (Letzter Schultag)', startDate: '2027-07-16', endDate: '2027-07-16', startDateNum: 20270716, endDateNum: 20270716, type: 'appointment' },
  { id: 'hol-sommer-27', name: 'Sommerferien', longName: 'Sommerferien 2027 (NRW)', startDate: '2027-07-19', endDate: '2027-08-31', startDateNum: 20270719, endDateNum: 20270831, type: 'holiday' }
];

const DEFAULT_CLASSREG_EVENTS = [
  {
    id: 'classreg-event-37925-2026-09-11',
    untisId: 37925,
    date: '2026-09-11',
    time: '11:15',
    timeStr: '11:15 Uhr',
    subject: 'Mathematik (M)',
    subjectCode: 'M',
    teacher: 'Hanauer',
    teacherCode: 'HAN',
    klasse: 'BFW2B',
    text: 'Wahl Klassensprecher (Leon Florschütz) und stellvertretender Klassensprecher (Laurin Schneider)',
    category: 'Klassenbucheintrag'
  },
  {
    id: 'classreg-event-37888-2026-09-07',
    untisId: 37888,
    date: '2026-09-07',
    time: '12:32',
    timeStr: '12:32 Uhr',
    subject: 'Fachpraxis Gesamtwirtschaft (FB GWP)',
    subjectCode: 'FB GWP',
    teacher: 'Hübner',
    teacherCode: 'HÜB',
    klasse: 'BFW2B',
    text: 'Vorstellung der Schulsozialarbeit',
    category: 'Klassenbucheintrag'
  }
];

// Hinweis: Es werden KEINE synthetischen Standardprüfungen verwendet.
// Es werden AUSSCHLIESSLICH echte Prüfungen aus der WebUntis-API dargestellt!

let appData = {
  config: { ...DEFAULT_CONFIG },
  periods: [...DEFAULT_PERIODS],
  timetable: [],
  timetableCache: {},
  exams: [],
  homework: [],
  absences: [],
  classbook: [],
  classregEvents: [...DEFAULT_CLASSREG_EVENTS],
  holidays: [...DEFAULT_NRW_HOLIDAYS_2026_2027],
  schoolYear: null,
  examFilter: 'all',
  homeworkFilter: 'classreg',
  grades: {},
  webuntisGradeList: [],
  webuntisLessons: [],
  webuntisFinalMarks: {},
  selectedGradeSchoolYear: '2025/2026',
  canteen: null,
  selectedCanteenWeek: 'kw38',
  selectedCanteenDay: 'all',
  iservEmails: [],
  iservEvents: [],
  iservTasks: []
};

// Fehlzeiten & Krankmeldungen sofort aus dem lokalen Speicher laden
try {
  const initCachedAbs = JSON.parse(localStorage.getItem('webuntis_cached_absences') || '[]');
  const initCustomAbs = JSON.parse(localStorage.getItem('webuntis_custom_absences') || '[]');
  const initAbsMap = new Map();
  function cleanAbsReason(r) {
    if (!r) return '';
    let str = String(r).trim();
    if (/^Abwesend ohne Grund\s*[–\-:]\s*(.+)$/i.test(str)) {
      const m = str.match(/^Abwesend ohne Grund\s*[–\-:]\s*(.+)$/i);
      if (m && m[1]) return m[1].trim();
    }
    return str;
  }
  if (Array.isArray(initCachedAbs)) initCachedAbs.forEach(a => {
    if (a && a.id) {
      if (a.reason) a.reason = cleanAbsReason(a.reason);
      initAbsMap.set(a.id, a);
    }
  });
  if (Array.isArray(initCustomAbs)) initCustomAbs.forEach(a => {
    if (a && a.id) {
      if (a.reason) a.reason = cleanAbsReason(a.reason);
      initAbsMap.set(a.id, a);
    }
  });
  if (initAbsMap.size > 0) {
    appData.absences = Array.from(initAbsMap.values()).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  }
} catch (e) { }

let currentTab = 'overview';
let selectedDay = 'today'; // 'today', 'tomorrow', 1..5, 'all'
let selectedWeekOffset = 0; // 0 = aktuelle Schulwoche, -1 = vorherige Woche, +1 = nächste Woche
let speechSynth = window.speechSynthesis || null;
let webuntisSessionId = null;
let lastLoginAuthError = null;
let lastSyncTimestamp = null;
let autoSyncIntervalTimer = null;
let isSyncInProgress = false;


// =============================================================================
// SCHUL-KONFIGURATION & CAMPUS-ERKENNUNG
// =============================================================================
function isSoestCampusSchool(config) {
  const cfg = config || (appData && appData.config) || {};
  const s = `${cfg.schoolShort || ''} ${cfg.schoolName || ''} ${cfg.server || ''}`.toLowerCase();
  return s.includes('bk-soest') || s.includes('berufskolleg soest') || s.includes('lwl-bk-soest') ||
         s.includes('vincke') || s.includes('bbw-soest') || s.includes('bbw soest');
}

function updateNavigationForSchool() {
  const isSoest = isSoestCampusSchool();
  const canteenTabBtn = document.getElementById('tab-canteen');
  const settingsKeyHint = document.getElementById('tab-settings-key-hint');
  const skipLinkNav = document.getElementById('skip-link-nav');

  if (canteenTabBtn) {
    canteenTabBtn.style.display = isSoest ? 'inline-flex' : 'none';
  }

  if (settingsKeyHint) {
    settingsKeyHint.textContent = isSoest ? '9' : '8';
  }

  if (skipLinkNav) {
    skipLinkNav.textContent = isSoest
      ? 'Zur Menüauswahl springen (Tasten 1-9)'
      : 'Zur Menüauswahl springen (Tasten 1-8)';
  }

  const headerSchoolEl = document.getElementById('header-school-name');
  if (headerSchoolEl) {
    const sName = (appData && appData.config && appData.config.schoolName) || 'WebUntis';
    headerSchoolEl.textContent = `${sName} • Live aus WebUntis`;
  }

  const loginSub = document.getElementById('login-subtitle-school');
  if (loginSub) {
    const sName = (appData && appData.config && appData.config.schoolName) || 'WebUntis Schule';
    loginSub.textContent = `${sName}`;
  }

  // Falls Mensa-Tab aktiv war, aber Schule kein Soest-Campus ist:
  if (!isSoest && typeof currentTab !== 'undefined' && currentTab === 'canteen') {
    switchTab('overview');
  }
}

function isNativeApp() {
  return typeof window !== 'undefined' && !!(
    (window.Capacitor && (window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : window.Capacitor.getPlatform?.() !== 'web')) ||
    (window.location && (window.location.protocol === 'capacitor:' || (window.location.protocol === 'https:' && window.location.hostname === 'localhost')))
  );
}

function logClient(msg, data) {
  try {
    const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    const extra = data ? ' ' + (typeof data === 'string' ? data : (data.stack || JSON.stringify(data))) : '';
    console.log('[Stundenplan]', text + extra);
    if (!isNativeApp()) {
      fetch('/api/client_log', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: text + extra
      }).catch(() => {});
    }
  } catch (e) {}
}

window.onerror = function(msg, url, lineNo, columnNo, error) {
  logClient(`[WINDOW.ONERROR] ${msg} at ${url}:${lineNo}:${columnNo}`, error ? error.stack : '');
  return false;
};

window.addEventListener('unhandledrejection', function(event) {
  logClient(`[UNHANDLED REJECTION] ${event.reason ? (event.reason.stack || event.reason.message || event.reason) : 'unknown'}`);
});

// =============================================================================
// 2. SPEICHERUNG & KONFIGURATION (LOCALSTORAGE)
// =============================================================================
function loadAppData() {
  try {
    const saved = localStorage.getItem('lwl_stundenplan_data_v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      appData = {
        config: { ...DEFAULT_CONFIG, ...(parsed.config || {}) },
        periods: (parsed.periods && parsed.periods.length >= 9 && parsed.periods.some(p => p.period === 9)) ? parsed.periods : [...DEFAULT_PERIODS],
        timetable: parsed.timetable || [],
        timetableCache: (parsed.timetableCache && typeof parsed.timetableCache === 'object') ? parsed.timetableCache : {},
        exams: (parsed.exams && Array.isArray(parsed.exams)) ? parsed.exams : [],
        homework: (parsed.homework && Array.isArray(parsed.homework)) ? parsed.homework : [],
        absences: parsed.absences || [],
        classbook: parsed.classbook || [],
        classregEvents: (parsed.classregEvents && Array.isArray(parsed.classregEvents) && parsed.classregEvents.length > 0) ? parsed.classregEvents : [...DEFAULT_CLASSREG_EVENTS],
        messages: (parsed.messages && Array.isArray(parsed.messages)) ? parsed.messages : [],
        deletedMessageIds: (parsed.deletedMessageIds && Array.isArray(parsed.deletedMessageIds)) ? parsed.deletedMessageIds : [],
        metadata: (parsed.metadata && typeof parsed.metadata === 'object') ? parsed.metadata : null,
        customHomework: (parsed.customHomework && Array.isArray(parsed.customHomework)) ? parsed.customHomework : [],
        grades: (parsed.grades && typeof parsed.grades === 'object') ? parsed.grades : {},
        webuntisGradeList: (parsed.auth && parsed.auth.isLoggedIn)
          ? (Array.isArray(parsed.webuntisGradeList) ? parsed.webuntisGradeList : [])
          : ((parsed.webuntisGradeList && Array.isArray(parsed.webuntisGradeList) && parsed.webuntisGradeList.length > 0) ? parsed.webuntisGradeList : (typeof DEFAULT_WEBUNTIS_GRADES !== 'undefined' ? [...DEFAULT_WEBUNTIS_GRADES] : [])),
        webuntisLessons: (parsed.webuntisLessons && Array.isArray(parsed.webuntisLessons)) ? parsed.webuntisLessons : [],
        webuntisFinalMarks: (parsed.webuntisFinalMarks && typeof parsed.webuntisFinalMarks === 'object') ? parsed.webuntisFinalMarks : {},
        selectedGradeSchoolYear: parsed.selectedGradeSchoolYear || '2025/2026',
        canteen: (parsed.canteen && typeof parsed.canteen === 'object') ? parsed.canteen : null,
        selectedCanteenWeek: parsed.selectedCanteenWeek || 'kw38',
        selectedCanteenDay: parsed.selectedCanteenDay || 'all',
        holidays: (parsed.holidays && parsed.holidays.length > 0) ? parsed.holidays : [...DEFAULT_NRW_HOLIDAYS_2026_2027],
        schoolYear: parsed.schoolYear || null,
        examFilter: 'all',
        homeworkFilter: parsed.homeworkFilter || 'all',
        messagesFilter: 'all',
        iservEmails: (parsed.iservEmails && Array.isArray(parsed.iservEmails)) ? parsed.iservEmails : [],
        iservEvents: (parsed.iservEvents && Array.isArray(parsed.iservEvents)) ? parsed.iservEvents : [],
        iservTasks: (parsed.iservTasks && Array.isArray(parsed.iservTasks)) ? parsed.iservTasks : []
      };

      // Gelöschte Nachrichten aus dem Speicher filtern (exakte ID-Prüfung)
      if (appData.deletedMessageIds && appData.deletedMessageIds.length > 0) {
        // Bereinige fehlerhafte einstellige/ungültige Alt-IDs
        appData.deletedMessageIds = appData.deletedMessageIds.filter(d => typeof d === 'string' && d.length > 3);
        const delSet = new Set(appData.deletedMessageIds.map(String));
        appData.messages = (appData.messages || []).filter(m => {
          const sId = String(m.id || '');
          const rawId = sId.replace(/^webuntis-(inbox|news)-/, '');
          return !delSet.has(sId) && !delSet.has(rawId);
        });
      }

      // Veraltete Hausaufgaben aus vergangenen Schuljahren (2024, 2025 etc.) bereinigen
      if (appData.homework && Array.isArray(appData.homework)) {
        const sy = getSchoolYearRange();
        const minDateStr = `${sy.startYear}-08-01`; // 2026-08-01
        const maxDateStr = `${sy.endYear}-07-31`;   // 2027-07-31
        appData.homework = appData.homework.filter(h => {
          if (!h) return false;
          // Eigene Hausaufgaben ohne Frist beibehalten
          if (!h.dueDate || h.dueDate === 'Ohne Frist') {
            return h.isCustom === true;
          }
          const d = String(h.dueDate).slice(0, 10);
          // Nur Hausaufgaben des aktuellen Schuljahres (ab August 2026) behalten
          return d >= minDateStr && d <= maxDateStr;
        });
      }

      // Gecachte synthetische Fake-Prüfungen def-exam- aus früheren Versionen entfernen, aber ALLE echten Prüfungen beibehalten
      if (parsed.exams && Array.isArray(parsed.exams)) {
        appData.exams = parsed.exams.filter(ex => {
          if (!ex || !ex.id) return false;
          if (String(ex.id).startsWith('def-exam-')) return false;
          return true;
        });
      }

      // Historische Alt-Ferien (2020-2025) aus Cache bereinigen
      if (appData.holidays && Array.isArray(appData.holidays)) {
        const sy = appData.schoolYear || getSchoolYearRange();
        appData.holidays = appData.holidays.filter(h => {
          const sNum = h.startDateNum || (h.startDate ? parseInt(h.startDate.replace(/-/g, '')) : 0);
          const eNum = h.endDateNum || (h.endDate ? parseInt(h.endDate.replace(/-/g, '')) : sNum);
          return eNum >= sy.startDateNum && sNum <= sy.endDateNum;
        });
        if (appData.holidays.length === 0 || appData.holidays.length > 30) {
          appData.holidays = [...DEFAULT_NRW_HOLIDAYS_2026_2027];
        }
      }

      // Falsch gecachte Räume, Perioden und fehlerhafte Stundenplan-Hausaufgaben bereinigen
      if (appData.timetable && Array.isArray(appData.timetable)) {
        appData.timetable.forEach(l => {
          // Veraltete fehlerhaft verknüpfte Hausaufgabentexte auf Stunden bereinigen
          if (l.homework) {
            const match = (appData.homework || []).find(h => !h.completed && h.dueDate === l.dateStr && ((h.subject && l.subject && (h.subject.toLowerCase().includes(l.subject.toLowerCase()) || l.subject.toLowerCase().includes(h.subject.toLowerCase())))));
            l.homework = match ? match.text : '';
          }
          if (l.room) {
            const rNorm = l.room.toLowerCase().replace(/^raum\s+/i, '').trim();
            const tNorm = (l.teacher || '').toLowerCase().trim();
            if (rNorm === 'hanauer' || (tNorm && (rNorm === tNorm || tNorm.includes(rNorm)))) {
              l.room = 'Raum wird bekanntgegeben';
            }
          }

          // Sport und Nachmittagsstunden: Perioden-Reparatur (z.B. 32. Std., 33. Std.)
          if (l.startTime === '14:10' || (l.period === 32 && l.subject === 'SP')) {
            l.period = 8;
            if (!l.startTime) l.startTime = '14:10';
            if (!l.endTime) l.endTime = '14:55';
          } else if (l.startTime === '14:55' || (l.period === 33 && l.subject === 'SP')) {
            l.period = 9;
            if (!l.startTime) l.startTime = '14:55';
            if (!l.endTime) l.endTime = '15:40';
          } else if (l.startTime === '13:20' || (l.period === 7 && (!l.startTime || l.startTime === '13:40'))) {
            l.period = 7;
            l.startTime = '13:20';
            l.endTime = '14:05';
          } else if (l.period > 10 && l.startTime) {
            const matched = DEFAULT_PERIODS.find(p => p.start === l.startTime);
            if (matched) l.period = matched.period;
          }
        });
      }
      // Bestehende Alt-Passwörter aus dem persistenten LocalStorage bereinigen
      if (parsed && parsed.config && (parsed.config.password || parsed.config.iservPassword)) {
        if (!sessionStorage.getItem('lwl_session_pass') && parsed.config.password) {
          sessionStorage.setItem('lwl_session_pass', parsed.config.password);
        }
        if (!sessionStorage.getItem('lwl_session_iserv_pass') && parsed.config.iservPassword) {
          sessionStorage.setItem('lwl_session_iserv_pass', parsed.config.iservPassword);
        }
        delete parsed.config.password;
        delete parsed.config.iservPassword;
        try {
          localStorage.setItem('lwl_stundenplan_data_v2', JSON.stringify(parsed));
        } catch (e) {}
      }
      appData.config.password = sessionStorage.getItem('lwl_session_pass') || '';
      appData.config.iservPassword = sessionStorage.getItem('lwl_session_iserv_pass') || '';
    }
  } catch (e) {
    console.error('Fehler beim Laden der Daten aus dem LocalStorage:', e);
  }
  applyConfig();
}

function saveAppData() {
  try {
    // SECURITY: Niemals Klartext-Passwörter im persistenten LocalStorage ablegen
    const clone = JSON.parse(JSON.stringify(appData));
    if (clone && clone.config) {
      delete clone.config.password;
      delete clone.config.iservPassword;
    }
    localStorage.setItem('lwl_stundenplan_data_v2', JSON.stringify(clone));
  } catch (e) {
    console.error('Fehler beim Speichern:', e);
  }
}

function applyConfig() {
  const body = document.body;
  body.className = `${appData.config.theme} ${appData.config.fontSize}`;
  if (appData.config.textOnlyMode) {
    body.classList.add('text-only-mode');
  } else {
    body.classList.remove('text-only-mode');
  }

  // Navigation & Header School Name aktualisieren
  updateNavigationForSchool();

  // Settings Felder aktualisieren
  const cfgTheme = document.getElementById('cfg-theme');
  if (cfgTheme) cfgTheme.value = appData.config.theme;
  const cfgFont = document.getElementById('cfg-font-size');
  if (cfgFont) cfgFont.value = appData.config.fontSize;
  const cfgTextOnly = document.getElementById('cfg-text-only');
  if (cfgTextOnly) cfgTextOnly.checked = !!appData.config.textOnlyMode;
  const cfgTts = document.getElementById('cfg-tts');
  if (cfgTts) cfgTts.checked = !!appData.config.ttsEnabled;
  const cfgTtsRate = document.getElementById('cfg-tts-rate');
  if (cfgTtsRate) cfgTtsRate.value = appData.config.ttsRate || 1.0;

  // Account Display
  const uDisp = document.getElementById('settings-username-display');
  if (uDisp) uDisp.textContent = appData.config.username || 'Nicht angemeldet';

  // IServ Settings Population
  const cfgIservEnabled = document.getElementById('cfg-iserv-enabled');
  if (cfgIservEnabled) cfgIservEnabled.checked = !!appData.config.iservEnabled;
  const cfgIservServer = document.getElementById('cfg-iserv-server');
  if (cfgIservServer && appData.config.iservServer) cfgIservServer.value = appData.config.iservServer;
  const cfgIservUser = document.getElementById('cfg-iserv-username');
  if (cfgIservUser && appData.config.iservUsername) cfgIservUser.value = appData.config.iservUsername;
  const cfgIservPass = document.getElementById('cfg-iserv-password');
  if (cfgIservPass && appData.config.iservPassword) cfgIservPass.value = appData.config.iservPassword;

  updateIServUIState();
}

function saveSettings(e) {
  if (e && e.preventDefault) e.preventDefault();

  const cfgTheme = document.getElementById('cfg-theme');
  if (cfgTheme) appData.config.theme = cfgTheme.value;

  const cfgFont = document.getElementById('cfg-font-size');
  if (cfgFont) appData.config.fontSize = cfgFont.value;

  const cfgTts = document.getElementById('cfg-tts');
  if (cfgTts) appData.config.ttsEnabled = cfgTts.checked;

  const cfgTtsRate = document.getElementById('cfg-tts-rate');
  if (cfgTtsRate) appData.config.ttsRate = parseFloat(cfgTtsRate.value) || 1.0;

  const cfgTextOnly = document.getElementById('cfg-text-only');
  if (cfgTextOnly) appData.config.textOnlyMode = cfgTextOnly.checked;

  saveAppData();
  applyConfig();
  announceSR('Einstellungen gespeichert.', 'polite');
}

function setThemeDirect(themeName) {
  appData.config.theme = themeName;
  saveAppData();
  applyConfig();
  announceSR(`Farbschema geändert auf: ${themeName === 'theme-high-contrast' ? 'Gelb auf Schwarz' : themeName === 'theme-dark' ? 'Dunkelmodus' : 'Standard Hell'}`, 'polite');
}

// =============================================================================
// 3. BARRIEREFREIE SPRACHAUSGABE & SCREENREADER (NVDA/JAWS)
// =============================================================================
// Comprehensive emoji regex for clean screenreader & TTS output
const ALL_EMOJI_REGEX = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA9F}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2614}-\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{26A1}\u{26AA}-\u{26AB}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}-\u{26F3}\u{26F5}\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}-\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}-\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}\u{FE0F}]/gu;

function announceSR(message, priority = 'polite') {
  const targetId = priority === 'assertive' ? 'sr-live-assertive' : 'sr-live';
  const liveEl = document.getElementById(targetId);
  if (!liveEl) return;
  const cleanMsg = (message || '').replace(ALL_EMOJI_REGEX, '').trim();
  liveEl.textContent = '';
  setTimeout(() => {
    liveEl.textContent = cleanMsg;
  }, 50);
}

function speak(text, force = false) {
  if (!speechSynth) return;
  if (!appData.config.ttsEnabled && !force) return;

  try {
    speechSynth.cancel();
    const cleanText = (text || '').replace(ALL_EMOJI_REGEX, '').trim();
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = 'de-DE';
    utter.rate = appData.config.ttsRate || 1.0;
    speechSynth.speak(utter);
  } catch (e) {
    console.warn('TTS Fehler:', e);
  }
}

// Hilfsfunktion: HTML-Zeichen sicher maskieren
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtml(str) {
  return escHtml(str);
}


// =============================================================================
// 4. NAVIGATION & REITER-WECHSEL (TASTEN 1 BIS 8)
// =============================================================================
function switchTab(tabId) {
  currentTab = tabId;

  const tabs = [
    { id: 'overview', btn: 'tab-overview', view: 'view-overview' },
    { id: 'timetable', btn: 'tab-timetable', view: 'view-timetable' },
    { id: 'exams', btn: 'tab-exams', view: 'view-exams' },
    { id: 'homework', btn: 'tab-homework', view: 'view-homework' },
    { id: 'absences', btn: 'tab-absences', view: 'view-absences' },
    { id: 'messages', btn: 'tab-messages', view: 'view-messages' },
    { id: 'grades', btn: 'tab-grades', view: 'view-grades' },
    { id: 'canteen', btn: 'tab-canteen', view: 'view-canteen' },
    { id: 'settings', btn: 'tab-settings', view: 'view-settings' }
  ];

  tabs.forEach(t => {
    const isTarget = t.id === tabId;
    const btn = document.getElementById(t.btn);
    const view = document.getElementById(t.view);

    if (btn) {
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
      btn.setAttribute('tabindex', isTarget ? '0' : '-1');
      if (isTarget) btn.focus();
    }

    if (view) {
      view.classList.toggle('active', isTarget);
    }
  });

  if (tabId === 'overview') {
    renderUrgentNotificationBanner();
    updateCurrentAndNextLesson();
    announceSR('Reiter 1: Zentrale Übersicht ausgewählt.', 'polite');
  } else if (tabId === 'timetable') {
    updateWeekAndDayLabels();
    renderTimetable();
    announceSR('Reiter 2: Stundenplan und Vertretungsplan ausgewählt.', 'polite');
  } else if (tabId === 'exams') {
    renderExams();
    announceSR('Reiter 3: Prüfungen und Termine für das gesamte Schuljahr ausgewählt.', 'polite');
  } else if (tabId === 'homework') {
    renderHomework();
    announceSR('Reiter 4: Hausaufgaben und Klassenbuch ausgewählt.', 'polite');
  } else if (tabId === 'absences') {
    renderAbsences();
    announceSR('Reiter 5: Fehlzeiten und Entschuldigungen ausgewählt.', 'polite');
  } else if (tabId === 'messages') {
    renderMessagesView();
    announceSR('Reiter 6: Tagesnachrichten und Mitteilungen ausgewählt.', 'polite');
  } else if (tabId === 'grades') {
    renderGradesView();
    announceSR('Reiter 7: Noten und Leistungsübersicht ausgewählt.', 'polite');
  } else if (tabId === 'canteen') {
    renderCanteenView();
    announceSR('Reiter 8: Mensa und Speisepläne ausgewählt.', 'polite');
  } else if (tabId === 'settings') {
    loadFeedbackArchive();
    const keyNum = isSoestCampusSchool() ? '9' : '8';
    announceSR(`Reiter ${keyNum}: Konto und Einstellungen ausgewählt.`, 'polite');
  }
}

// =============================================================================
// 5. ANMELDUNG & SITZUNGS-MANAGEMENT
// =============================================================================

// =============================================================================
// SCHULAUSWAHL & SCHULSUCHE LOGIK (LOGIN)
// =============================================================================
function handleSchoolPresetChange(val) {
  const searchBox = document.getElementById('login-school-search-box');
  const manualFields = document.getElementById('login-school-manual-fields');
  const displayEl = document.getElementById('login-selected-school-display');
  const badgeEl = document.getElementById('login-canteen-availability-badge');

  if (val === 'lwl-bk-soest') {
    if (searchBox) searchBox.style.display = 'none';
    if (manualFields) manualFields.style.display = 'none';
    appData.config.schoolName = 'LWL-Berufskolleg Soest';
    appData.config.schoolShort = 'lwl-bk-soest';
    appData.config.server = 'lwl-bk-soest.webuntis.com';
    appData.config.tenantId = '5238400';
  } else if (val === 'von-vincke-schule') {
    if (searchBox) searchBox.style.display = 'none';
    if (manualFields) manualFields.style.display = 'none';
    appData.config.schoolName = 'LWL-Von-Vincke-Schule Soest';
    appData.config.schoolShort = 'von-vincke-schule';
    appData.config.server = 'von-vincke-schule.webuntis.com';
    appData.config.tenantId = '7209600';
  } else if (val === 'bbw-soest') {
    if (searchBox) searchBox.style.display = 'none';
    if (manualFields) manualFields.style.display = 'none';
    appData.config.schoolName = 'LWL-Berufsbildungswerk Soest (BBW)';
    appData.config.schoolShort = 'bbw-soest';
    appData.config.server = 'bbw-soest.webuntis.com';
    appData.config.tenantId = '';
  } else if (val === 'custom') {
    if (searchBox) searchBox.style.display = 'block';
    if (manualFields) manualFields.style.display = 'block';
    const sInp = document.getElementById('school-search-query');
    if (sInp) {
      setTimeout(() => { sInp.focus(); }, 50);
    }
  }

  saveAppData();
  updateNavigationForSchool();

  if (displayEl) displayEl.textContent = appData.config.schoolName || 'Benutzerdefiniert';

  if (badgeEl) {
    const isSoest = isSoestCampusSchool();
    badgeEl.style.display = isSoest ? 'inline-block' : 'none';
  }

  announceSR(`Schule ${appData.config.schoolName} ausgewählt.`, 'polite');
}

async function executeSchoolSearch() {
  const qInput = document.getElementById('school-search-query');
  const resultsContainer = document.getElementById('school-search-results');
  if (!qInput || !resultsContainer) return;

  const q = qInput.value.trim();
  if (q.length < 2) {
    announceSR('Bitte mindestens 2 Buchstaben für die Schulsuche eingeben.', 'assertive');
    resultsContainer.innerHTML = '<p style="color: var(--accent-urgent); font-size: 14px; margin-top: 6px;">Bitte mindestens 2 Buchstaben eingeben.</p>';
    return;
  }

  resultsContainer.innerHTML = '<p style="font-size: 14px; color: var(--text-secondary); margin-top: 6px;"><span class="emoji-icon" aria-hidden="true">⏳ </span>Suche Schulen in WebUntis...</p>';
  announceSR('Suche Schulen in WebUntis...', 'polite');

  try {
    const resp = await fetch(`/api/school_search?query=${encodeURIComponent(q)}`);
    const data = await resp.json();
    const schools = (data && data.result && data.result.schools) ? data.result.schools : [];

    if (schools.length === 0) {
      resultsContainer.innerHTML = '<p style="font-size: 14px; color: var(--text-secondary); margin-top: 6px;">Keine passende Schule in WebUntis gefunden. Du kannst das Kürzel unten manuell eingeben.</p>';
      announceSR('Keine passende Schule gefunden.', 'polite');
      return;
    }

    let html = `<p style="font-size: 13.5px; font-weight: bold; margin: 8px 0 6px 0;">Gefundene Schulen (${schools.length} Treffer - anklicken zum Auswählen):</p>`;
    schools.forEach(s => {
      const sName = s.displayName || s.name || s.loginName;
      const sCity = s.address || '';
      const sLogin = s.loginName;
      const sServer = s.serverUrl ? new URL(s.serverUrl).hostname : `${s.loginName}.webuntis.com`;
      const sTenant = String(s.schoolId || '');

      const sDataStr = JSON.stringify({ name: sName, loginName: sLogin, server: sServer, tenantId: sTenant })
        .replace(/"/g, '&quot;');

      html += `
        <div class="school-search-item" 
             tabindex="0" 
             role="button" 
             onclick='selectSearchedSchool(${sDataStr})' 
             onkeydown='if(event.key==="Enter"||event.key===" "){event.preventDefault();selectSearchedSchool(${sDataStr});}' 
             aria-label="${escHtml(sName)}, ${escHtml(sCity)}">
          <div>
            <strong style="font-size: 14.5px; color: var(--text-primary);">${escHtml(sName)}</strong>
            <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
              ${escHtml(sCity)} • Kürzel: <code>${escHtml(sLogin)}</code>
            </div>
          </div>
          <button type="button" class="btn btn-secondary" style="padding: 4px 10px; font-size: 13px;">
            Auswählen
          </button>
        </div>
      `;
    });

    resultsContainer.innerHTML = html;
    announceSR(`${schools.length} Schulen gefunden. Bitte mit Pfeiltasten oder Tab auswählen.`, 'assertive');
  } catch (err) {
    console.warn('School search error:', err);
    resultsContainer.innerHTML = '<p style="color: var(--accent-urgent); font-size: 14px;">Fehler beim Abrufen der Schulen. Bitte Kürzel und Server manuell eintragen.</p>';
  }
}

function selectSearchedSchool(sObj) {
  if (!sObj) return;

  appData.config.schoolName = sObj.name || sObj.loginName;
  appData.config.schoolShort = sObj.loginName;
  appData.config.server = sObj.server;
  if (sObj.tenantId) appData.config.tenantId = sObj.tenantId;

  saveAppData();
  updateNavigationForSchool();

  const displayEl = document.getElementById('login-selected-school-display');
  if (displayEl) displayEl.textContent = appData.config.schoolName;

  const shortInp = document.getElementById('login-school-short');
  if (shortInp) shortInp.value = appData.config.schoolShort;

  const serverInp = document.getElementById('login-school-server');
  if (serverInp) serverInp.value = appData.config.server;

  const badgeEl = document.getElementById('login-canteen-availability-badge');
  if (badgeEl) {
    const isSoest = isSoestCampusSchool();
    badgeEl.style.display = isSoest ? 'inline-block' : 'none';
  }

  const resultsContainer = document.getElementById('school-search-results');
  if (resultsContainer) {
    resultsContainer.innerHTML = `<p style="color: var(--accent-ok); font-weight: bold; font-size: 14px; margin-top: 6px;"><span class="emoji-icon" aria-hidden="true">✅ </span>${escHtml(appData.config.schoolName)} erfolgreich ausgewählt!</p>`;
  }

  const userInp = document.getElementById('login-username');
  if (userInp) {
    userInp.focus();
  }

  const msg = `Schule ${appData.config.schoolName} ausgewählt. Bitte jetzt Benutzername eingeben.`;
  speak(msg, true);
  announceSR(msg, 'assertive');
}

function showLoginView() {
  const loginView = document.getElementById('view-login');
  const navTabs = document.getElementById('main-nav-tabs');
  const contentArea = document.getElementById('view-content-area');
  const logoutBtn = document.getElementById('btn-header-logout');

  if (loginView) loginView.style.display = 'flex';
  if (navTabs) navTabs.style.display = 'none';
  if (contentArea) contentArea.style.display = 'none';
  if (logoutBtn) logoutBtn.style.display = 'none';

  const userInp = document.getElementById('login-username');
  if (userInp) {
    let currentVal = (appData.config.username || '').trim();
    // Automatische Deduplizierung falls der Benutzername im Profil versehentlich doppelt abgelegt wurde
    if (currentVal.length >= 6 && currentVal.length % 2 === 0) {
      const half = currentVal.length / 2;
      if (currentVal.slice(0, half).toLowerCase() === currentVal.slice(half).toLowerCase()) {
        currentVal = currentVal.slice(0, half);
        appData.config.username = currentVal;
      }
    }
    userInp.value = currentVal;
    setTimeout(() => {
      try {
        userInp.focus();
        userInp.select();
      } catch (e) {}
    }, 50);
  }

  const passInp = document.getElementById('login-password');
  if (passInp) {
    passInp.value = appData.config.password || '';
  }

  const statusEl = document.getElementById('sync-status-text');
  if (statusEl) statusEl.textContent = 'Bitte anmelden';

  announceSR('Willkommen bei Barrierefreies WebUntis für blinde und sehbehinderte Schülerinnen und Schüler. Bitte melde dich mit deinen WebUntis-Zugangsdaten an.', 'assertive');
}

function hideLoginView() {
  const loginView = document.getElementById('view-login');
  const navTabs = document.getElementById('main-nav-tabs');
  const contentArea = document.getElementById('view-content-area');
  const logoutBtn = document.getElementById('btn-header-logout');

  if (loginView) loginView.style.display = 'none';
  if (navTabs) navTabs.style.display = 'block';
  if (contentArea) contentArea.style.display = 'block';
  if (logoutBtn) logoutBtn.style.display = 'inline-flex';
}

async function handleLoginSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  let userVal = document.getElementById('login-username').value.trim();
  const passVal = document.getElementById('login-password').value;
  const remVal = document.getElementById('login-remember').checked;
  const statusBox = document.getElementById('login-status-box');
  const submitBtn = document.getElementById('btn-login-submit');

  if (!userVal || !passVal) {
    announceSR('Bitte gib sowohl deinen Benutzernamen als auch dein Passwort ein.', 'assertive');
    return;
  }

  // Schutz vor doppelter Eingabe des Benutzernamens (z. B. versehentliches Doppeleinfügen)
  if (userVal.length >= 6 && userVal.length % 2 === 0) {
    const half = userVal.length / 2;
    if (userVal.slice(0, half).toLowerCase() === userVal.slice(half).toLowerCase()) {
      userVal = userVal.slice(0, half);
      document.getElementById('login-username').value = userVal;
    }
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="emoji-icon">⏳</span> <strong>Verbinde mit WebUntis...</strong>';
  }

  if (statusBox) {
    statusBox.style.display = 'block';
    statusBox.innerHTML = `
      <div style="background: rgba(2, 132, 199, 0.1); border: 2px solid var(--accent-info); padding: 14px; border-radius: 8px;">
        <strong style="color: var(--accent-info);"><span class="emoji-icon" aria-hidden="true">🔄 </span>Melde an WebUntis (${escHtml(appData.config.schoolName || "deiner Schule")}) an...</strong>
      </div>
    `;
  }
  announceSR('Melde an WebUntis an...', 'polite');

  try {
    lastLoginAuthError = null;
    logClient('handleLoginSubmit starting for user: ' + userVal);
    const success = await performWebUntisSync(userVal, passVal);
    logClient('handleLoginSubmit performWebUntisSync finished with result: ' + success + ', sessionId: ' + (webuntisSessionId ? 'present' : 'null'));

    if (success || webuntisSessionId) {
      appData.config.username = userVal;
      if (remVal) {
        sessionStorage.setItem('lwl_session_pass', passVal);
        appData.config.password = passVal;
        appData.config.rememberLogin = true;
      } else {
        sessionStorage.removeItem('lwl_session_pass');
        appData.config.password = '';
        appData.config.rememberLogin = false;
      }
      saveAppData();
      applyConfig();
      hideLoginView();
      switchTab('overview');
      speak('Erfolgreich angemeldet. Dein Stundenplan wurde geladen.', true);
    } else {
      let errDetail = 'Benutzername oder Passwort ist nicht korrekt. Bitte überprüfe deine Eingabe.';
      if (lastLoginAuthError) {
        if (lastLoginAuthError.code === -8504 || (lastLoginAuthError.message && lastLoginAuthError.message.toLowerCase().includes('bad credentials'))) {
          errDetail = 'Benutzername oder Passwort ist nicht korrekt. Bitte achte darauf, dass der Benutzername ohne Tippfehler eingegeben wird.';
        } else if (lastLoginAuthError.code === -8520) {
          errDetail = 'Dein WebUntis-Konto ist vorübergehend gesperrt. Bitte wende dich an das Schulsekretariat.';
        } else if (lastLoginAuthError.message) {
          errDetail = `WebUntis meldet: ${lastLoginAuthError.message}`;
        }
      } else {
        errDetail = 'WebUntis-Anmeldung war erfolgreich, aber beim Laden der Daten ist ein Verarbeitungsfehler aufgetreten. Bitte versuche es erneut.';
      }
      logClient('handleLoginSubmit failed with error: ' + errDetail);
      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.innerHTML = `
          <div style="background: rgba(185, 28, 28, 0.1); border: 2px solid var(--accent-danger); padding: 14px; border-radius: 8px;">
            <strong style="color: var(--accent-danger);"><span class="emoji-icon" aria-hidden="true">❌ </span>Anmeldung fehlgeschlagen</strong>
            <p style="margin-top: 4px; font-size: 14px;">${escapeHtml(errDetail)}</p>
          </div>
        `;
      }
      announceSR(`Anmeldung fehlgeschlagen: ${errDetail}`, 'assertive');
      const passField = document.getElementById('login-password');
      if (passField) {
        passField.focus();
        passField.select();
      }
    }
  } catch (err) {
    logClient('handleLoginSubmit caught exception: ' + (err ? (err.stack || err.message || err) : 'unknown'));
    if (statusBox) {
      statusBox.style.display = 'block';
      const errMsg = isNativeApp()
        ? 'Verbindung zum WebUntis-Server fehlgeschlagen. Bitte prüfe deine Internetverbindung oder versuche es in Kürze erneut.'
        : 'Die lokale WebUntis-Brücke ist nicht erreichbar. Bitte starte Barrierefreies_WebUntis.exe neu.';
      statusBox.innerHTML = `
        <div style="background: rgba(185, 28, 28, 0.1); border: 2px solid var(--accent-danger); padding: 14px; border-radius: 8px;">
          <strong style="color: var(--accent-danger);"><span class="emoji-icon" aria-hidden="true">⚠️ </span>Verbindung nicht möglich</strong>
          <p style="margin-top: 4px; font-size: 14px;">${escapeHtml(errMsg)}</p>
        </div>
      `;
    }
    announceSR('Verbindungsfehler zu WebUntis.', 'assertive');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span class="emoji-icon" aria-hidden="true">🚀 </span><strong>Anmelden &amp; Stundenplan laden</strong>';
    }
  }
}

function logoutUser() {
  if (confirm('Möchtest du dich wirklich von WebUntis abmelden?')) {
    appData.config.password = '';
    saveAppData();
    webuntisSessionId = null;
    showLoginView();
    announceSR('Du wurdest abgemeldet.', 'polite');
  }
}

function exitApp() {
  if (confirm('Möchtest du die Stundenplan-Anwendung und den Server wirklich beenden?')) {
    announceSR('Stundenplan-App wird beendet. Auf Wiedersehen.', 'assertive');
    fetch('/api/shutdown?confirmed=true').catch(() => {}).finally(() => {
      document.body.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <h1 style="font-size: 28px; margin-bottom: 16px;"><span class="emoji-icon" aria-hidden="true">✅ </span>Stundenplan-App beendet</h1>
          <p style="font-size: 18px; color: #4b5563;">Der lokale Dienst wurde ordnungsgemäß gestoppt.</p>
          <p style="font-size: 16px; margin-top: 10px;">Du kannst diesen Browser-Tab nun schließen.</p>
        </div>
      `;
      setTimeout(() => { window.close(); }, 800);
    });
  }
}

// =============================================================================
// 6. WEBUNTIS TOTP GENERATOR & JSON-RPC API CLIENT
// =============================================================================
function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(str || '').toUpperCase().replace(/[\s=]/g, '');
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return new Uint8Array(bytes);
}

function sha1(msgBytes) {
  function rotl(n, s) { return (n << s) | (n >>> (32 - s)); }
  const len = msgBytes.length;
  const bitLen = len * 8;
  const withPad = [];
  for (let i = 0; i < len; i++) withPad.push(msgBytes[i]);
  withPad.push(0x80);
  while ((withPad.length % 64) !== 56) withPad.push(0);
  withPad.push(0, 0, 0, 0);
  withPad.push((bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);

  let H0 = 0x67452301, H1 = 0xEFCDAB89, H2 = 0x98BADCFE, H3 = 0x10325476, H4 = 0xC3D2E1F0;
  const W = new Uint32Array(80);

  for (let chunk = 0; chunk < withPad.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      W[i] = (withPad[chunk + i * 4] << 24) |
             (withPad[chunk + i * 4 + 1] << 16) |
             (withPad[chunk + i * 4 + 2] << 8) |
             (withPad[chunk + i * 4 + 3]);
    }
    for (let i = 16; i < 80; i++) {
      W[i] = rotl(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);
    }
    let A = H0, B = H1, C = H2, D = H3, E = H4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (B & C) | ((~B) & D); k = 0x5A827999; }
      else if (i < 40) { f = B ^ C ^ D; k = 0x6ED9EBA1; }
      else if (i < 60) { f = (B & C) | (B & D) | (C & D); k = 0x8F1BBCDC; }
      else { f = B ^ C ^ D; k = 0xCA62C1D6; }
      const temp = (rotl(A, 5) + f + E + k + W[i]) >>> 0;
      E = D; D = C; C = rotl(B, 30) >>> 0; B = A; A = temp;
    }
    H0 = (H0 + A) >>> 0;
    H1 = (H1 + B) >>> 0;
    H2 = (H2 + C) >>> 0;
    H3 = (H3 + D) >>> 0;
    H4 = (H4 + E) >>> 0;
  }
  const res = new Uint8Array(20);
  const words = [H0, H1, H2, H3, H4];
  for (let i = 0; i < 5; i++) {
    res[i * 4] = (words[i] >>> 24) & 0xff;
    res[i * 4 + 1] = (words[i] >>> 16) & 0xff;
    res[i * 4 + 2] = (words[i] >>> 8) & 0xff;
    res[i * 4 + 3] = words[i] & 0xff;
  }
  return res;
}

function hmacSha1(keyBytes, msgBytes) {
  let key = keyBytes;
  if (key.length > 64) key = sha1(key);
  const kPadInner = new Uint8Array(64);
  const kPadOuter = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const k = i < key.length ? key[i] : 0;
    kPadInner[i] = k ^ 0x36;
    kPadOuter[i] = k ^ 0x5c;
  }
  const inner = new Uint8Array(kPadInner.length + msgBytes.length);
  inner.set(kPadInner);
  inner.set(msgBytes, kPadInner.length);
  const innerHash = sha1(inner);

  const outer = new Uint8Array(kPadOuter.length + innerHash.length);
  outer.set(kPadOuter);
  outer.set(innerHash, kPadOuter.length);
  return sha1(outer);
}

function generateTotpCode(secretBase32, timestampMs) {
  try {
    if (!secretBase32) return 0;
    const key = base32Decode(secretBase32);
    if (!key || key.length === 0) return 0;
    const step = Math.floor((timestampMs / 1000) / 30);
    const msg = new Uint8Array(8);
    let s = step;
    for (let i = 7; i >= 0; i--) {
      msg[i] = s & 0xff;
      s = Math.floor(s / 256);
    }
    const hash = hmacSha1(key, msg);
    const offset = hash[hash.length - 1] & 0x0f;
    const binary = ((hash[offset] & 0x7f) << 24) |
                   ((hash[offset + 1] & 0xff) << 16) |
                   ((hash[offset + 2] & 0xff) << 8) |
                   (hash[offset + 3] & 0xff);
    return binary % 1000000;
  } catch (e) {
    return 0;
  }
}

async function callWebUntisApi(method, params = {}) {
  const payload = {
    id: 'req-' + Date.now(),
    method: method,
    params: params,
    jsonrpc: '2.0'
  };

  const srv = (appData.config && appData.config.server) || 'lwl-bk-soest.webuntis.com';
  const sch = (appData.config && appData.config.schoolShort) || 'lwl-bk-soest';
  const isMobileMethod = /^(getHomeWork2017|getExams2017|getPeriodData2017|getUserData2017|getTimetable2017|getStudentAbsences2017|getOfficeHours2017|getMessagesOfDay2017)$/.test(method);

  let directUrl = '';
  if (isMobileMethod) {
    directUrl = `https://${srv}/WebUntis/jsonrpc_intern.do?m=${method}&school=${sch}&v=a6.7.0&a=false&s=${srv}`;
  } else if (webuntisSessionId) {
    directUrl = `https://${srv}/WebUntis/jsonrpc.do;jsessionid=${webuntisSessionId}?school=${sch}`;
  } else {
    directUrl = `https://${srv}/WebUntis/jsonrpc.do?school=${sch}`;
  }

  const endpoints = [];
  const isNative = isNativeApp();

  if (isNative) {
    endpoints.push(directUrl);
  } else {
    if (window.location.origin && window.location.origin.startsWith('http') && !window.location.origin.includes('localhost:48250') && !window.location.origin.includes('127.0.0.1:48250')) {
      endpoints.push(window.location.origin + '/api/webuntis');
    }
    endpoints.push('http://127.0.0.1:48250/api/webuntis');
    endpoints.push('http://localhost:48250/api/webuntis');
    endpoints.push(directUrl);
  }

  let lastError = null;
  for (const ep of endpoints) {
    try {
      const isDirect = ep.startsWith('https://' + srv);
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'WebUntis/Mobile (Android; de)'
      };

      if (!isDirect) {
        headers['X-School'] = sch;
        headers['X-Server'] = srv;
        if (isMobileMethod) {
          headers['X-Endpoint'] = `/jsonrpc_intern.do?m=${method}`;
        }
      }

      if (webuntisSessionId) {
        headers['X-JSESSIONID'] = webuntisSessionId;
        headers['Cookie'] = `JSESSIONID=${webuntisSessionId}`;
      }
      if (appData.config && appData.config.appSharedSecret) {
        headers['X-Untis-Secret'] = appData.config.appSharedSecret;
        headers['X-Untis-User'] = appData.config.username;
      }

      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp && isDirect) {
        try {
          const capRes = await window.Capacitor.Plugins.CapacitorHttp.request({
            url: ep,
            method: 'POST',
            headers: headers,
            data: payload
          });
          const capData = (typeof capRes.data === 'string') ? JSON.parse(capRes.data) : capRes.data;
          if (capRes.headers) {
            for (const hKey of Object.keys(capRes.headers)) {
              if (hKey.toLowerCase() === 'set-cookie') {
                const sc = capRes.headers[hKey];
                if (sc && sc.includes('JSESSIONID=')) {
                  const m = sc.match(/JSESSIONID=([^;]+)/);
                  if (m) webuntisSessionId = m[1];
                }
              }
            }
          }
          if (capData && capData.result && capData.result.sessionId) {
            webuntisSessionId = capData.result.sessionId;
          }
          return capData;
        } catch (capErr) {
          console.warn('CapacitorHttp call error, falling back to fetch:', capErr);
        }
      }

      const res = await fetch(ep, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      const setCookie = res.headers && typeof res.headers.get === 'function'
        ? (res.headers.get('set-cookie') || res.headers.get('X-Set-Cookie'))
        : null;
      if (setCookie && setCookie.includes('JSESSIONID=')) {
        const m = setCookie.match(/JSESSIONID=([^;]+)/);
        if (m) webuntisSessionId = m[1];
      }

      const data = await res.json();
      if (data && data.result && data.result.sessionId) {
        webuntisSessionId = data.result.sessionId;
      }
      return data;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('Keine Verbindung zum WebUntis-Server möglich.');
}

async function callWebUntisRest(endpoint, token = null, method = 'GET', body = null) {
  const srv = (appData.config && appData.config.server) || 'lwl-bk-soest.webuntis.com';
  const sch = (appData.config && appData.config.schoolShort) || 'lwl-bk-soest';

  let ep = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  if (ep.startsWith('/WebUntis/')) {
    ep = ep.substring(9);
  }
  if (!ep.includes('school=')) {
    ep += (ep.includes('?') ? '&' : '?') + 'school=' + sch;
  }
  if (ep.includes('jsonrpc_intern.do')) {
    if (!ep.includes('v=')) ep += '&v=a6.7.0';
    if (!ep.includes('a=')) ep += '&a=false';
    if (!ep.includes('s=')) ep += '&s=' + srv;
  }
  let directUrl = `https://${srv}/WebUntis${ep}`;
  if (webuntisSessionId && !directUrl.includes('jsessionid=') && !directUrl.includes('/api/')) {
    directUrl = directUrl.replace('/WebUntis/', `/WebUntis/;jsessionid=${webuntisSessionId}/`);
  }

  const endpoints = [];
  const isNative = isNativeApp();

  if (isNative) {
    endpoints.push(directUrl);
  } else {
    if (window.location.origin && window.location.origin.startsWith('http') && !window.location.origin.includes('localhost:48250') && !window.location.origin.includes('127.0.0.1:48250')) {
      endpoints.push(window.location.origin + '/api/webuntis');
    }
    endpoints.push('http://127.0.0.1:48250/api/webuntis');
    endpoints.push('http://localhost:48250/api/webuntis');
    endpoints.push(directUrl);
  }

  for (const epUrl of endpoints) {
    try {
      const isDirect = epUrl.startsWith('https://' + srv);
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'WebUntis/Mobile (Android; de)'
      };

      if (!isDirect) {
        headers['X-School'] = sch;
        headers['X-Server'] = srv;
        headers['X-Endpoint'] = endpoint;
      }

      if (webuntisSessionId) {
        headers['X-JSESSIONID'] = webuntisSessionId;
        headers['Cookie'] = `JSESSIONID=${webuntisSessionId}`;
      }
      if (appData.config && appData.config.appSharedSecret) {
        headers['X-Untis-Secret'] = appData.config.appSharedSecret;
        headers['X-Untis-User'] = appData.config.username;
      }
      if (token && typeof token === 'string' && token.startsWith('eyJ')) {
        headers['Authorization'] = `Bearer ${token.trim()}`;
      }
      headers['tenant-id'] = (appData.config && appData.config.tenantId) || '5238400';
      headers['x-webuntis-api-school-year-id'] = String((appData.schoolYear && appData.schoolYear.id) || 18);

      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp && isDirect) {
        try {
          const reqData = body ? (typeof body === 'string' ? JSON.parse(body) : body) : undefined;
          const capRes = await window.Capacitor.Plugins.CapacitorHttp.request({
            url: epUrl,
            method: method || 'GET',
            headers: headers,
            data: reqData
          });
          if (capRes.status >= 200 && capRes.status < 300) {
            if (typeof capRes.data === 'string') {
              try { return JSON.parse(capRes.data); } catch(e) { return capRes.data; }
            }
            return capRes.data;
          }
        } catch (capErr) {
          console.warn('CapacitorHttp REST call error, falling back to fetch:', capErr);
        }
      }

      const fetchOpts = {
        method: method || 'GET',
        headers: headers
      };
      if (body && (method === 'POST' || method === 'PUT')) {
        fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const res = await fetch(epUrl, fetchOpts);

      if (res.ok) {
        const textData = await res.text();
        try {
          return JSON.parse(textData);
        } catch (e) {
          return textData;
        }
      }
    } catch (e) {}
  }
  return null;
}

function normalizeToIsoDate(d) {
  if (!d) return '';
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const clean = s.replace(/\D/g, '');
  if (clean.length >= 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  return '';
}

function formatDateToUntis(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return parseInt(`${y}${m}${day}`);
}

function formatUntisTimeToStr(val) {
  if (val === undefined || val === null) return '07:45';
  const str = String(val).trim();
  if (str.includes(':')) {
    const parts = str.split(':');
    return `${parts[0].padStart(2, '0')}:${(parts[1] || '00').padStart(2, '0')}`;
  }
  const num = parseInt(str.replace(/\D/g, '')) || 0;
  const s = String(num).padStart(4, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

function getSchoolYearRange() {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1; // 1..12

  let startYear = curYear;
  let endYear = curYear + 1;

  // In Deutschland beginnt das Schuljahr am 1. August
  if (curMonth < 8) {
    startYear = curYear - 1;
    endYear = curYear;
  }

  const startDateNum = parseInt(`${startYear}0801`);
  const endDateNum = parseInt(`${endYear}0731`);
  const name = `${startYear}/${endYear}`;

  return {
    name,
    startYear,
    endYear,
    startDateNum,
    endDateNum,
    startDate: new Date(startYear, 7, 1),
    endDate: new Date(endYear, 6, 31)
  };
}

async function performWebUntisSync(userOverride, passOverride) {
  if (isSyncInProgress) return false;
  isSyncInProgress = true;

  const username = userOverride || appData.config.username;
  const password = passOverride || appData.config.password;

  if (!username || !password) {
    isSyncInProgress = false;
    showLoginView();
    return false;
  }

  const syncStatusText = document.getElementById('sync-status-text');
  const refreshBtn = document.getElementById('btn-refresh');

  if (syncStatusText) syncStatusText.textContent = 'Synchronisiere...';
  if (refreshBtn) refreshBtn.classList.add('loading');

  try {
    // 1. Authenticate
    const authRes = await callWebUntisApi('authenticate', {
      user: username,
      password: password,
      client: 'BarrierefreiesWebUntis'
    });

    if (!authRes || authRes.error) {
      lastLoginAuthError = authRes ? authRes.error : null;
      console.warn('WebUntis Login Error:', authRes ? authRes.error : 'Unbekannt');
      isSyncInProgress = false;
      if (syncStatusText) syncStatusText.textContent = 'Fehler beim Login';
      if (refreshBtn) refreshBtn.classList.remove('loading');
      return false;
    }

    const { sessionId, personId, personType } = authRes.result;
    webuntisSessionId = sessionId;
    lastLoginAuthError = null;
    logClient('WebUntis authenticate successful! sessionId=' + sessionId + ', personId=' + personId + ', personType=' + personType);

    // 1b. Untis Mobile Authentifizierung über lokalen C#-Server (getAppSharedSecret + TOTP + getAuthToken)
    let appSharedSecret = appData.config.appSharedSecret || null;
    let jwtToken = null;
    let mobilePersonId = null;

    if (!isNativeApp()) {
      try {
        const mobRes = await fetch('/api/untis/mobile_auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username,
            password: password,
            school: appData.config.schoolShort || 'lwl-bk-soest',
            server: appData.config.server || 'lwl-bk-soest.webuntis.com'
          })
        });
        if (mobRes.ok) {
          const mobData = await mobRes.json();
          if (mobData.appSharedSecret) {
            appSharedSecret = mobData.appSharedSecret;
            appData.config.appSharedSecret = appSharedSecret;
            saveAppData();
          }
          if (mobData.jwtToken) {
            jwtToken = mobData.jwtToken;
          }
          if (mobData.personId) {
            mobilePersonId = mobData.personId;
          }
        }
      } catch (e) {
        console.warn('Hinweis zu /api/untis/mobile_auth:', e);
      }
    }

    // Client-seitiger Fallback falls nicht über Proxy authentifiziert
    if (!appSharedSecret) {
      try {
        const secRes = await callWebUntisRest('/jsonrpc_intern.do?m=getAppSharedSecret', null, 'POST', {
          id: 'untis-mobile-android-6.7.0',
          jsonrpc: '2.0',
          method: 'getAppSharedSecret',
          params: [{ userName: username, password: password }]
        });
        if (secRes && secRes.result && typeof secRes.result === 'string') {
          appSharedSecret = secRes.result.trim();
          appData.config.appSharedSecret = appSharedSecret;
          saveAppData();
        }
      } catch (e) { }
    }

    let nowClientTime = Date.now();
    let curOtp = appSharedSecret ? generateTotpCode(appSharedSecret, nowClientTime) : 0;

    // JWT Bearer Token über getAuthToken mit TOTP
    if (!jwtToken && appSharedSecret && curOtp) {
      try {
        const tokRes = await callWebUntisRest('/jsonrpc_intern.do?m=getAuthToken', null, 'POST', {
          id: 'untis-mobile-android-6.7.0',
          jsonrpc: '2.0',
          method: 'getAuthToken',
          params: [{
            auth: {
              clientTime: nowClientTime,
              otp: curOtp,
              user: username
            }
          }]
        });
        if (tokRes && tokRes.result && tokRes.result.token) {
          jwtToken = tokRes.result.token.trim();
        }
      } catch (e) { }
    }

    // Fallback 1: Mobile Auth v2 Endpoint
    if (!jwtToken) {
      try {
        const schoolShort = appData.config.schoolShort || 'lwl-bk-soest';
        const authMobileRes = await callWebUntisRest(
          `/api/mobile/v2/${schoolShort}/authentication`,
          null,
          'POST',
          { username: username, password: password }
        );
        if (authMobileRes && authMobileRes.jwt) {
          jwtToken = String(authMobileRes.jwt).trim();
        }
      } catch (e) { }
    }

    // Fallback 2: /api/token/new
    if (!jwtToken) {
      try {
        const tokenRes = await callWebUntisRest('/api/token/new');
        if (tokenRes) {
          if (typeof tokenRes === 'string' && tokenRes.length > 20 && tokenRes.startsWith('eyJ')) {
            jwtToken = tokenRes.trim();
          } else if (tokenRes.token && typeof tokenRes.token === 'string' && tokenRes.token.startsWith('eyJ')) {
            jwtToken = tokenRes.token.trim();
          } else if (tokenRes.jwt && typeof tokenRes.jwt === 'string' && tokenRes.jwt.startsWith('eyJ')) {
            jwtToken = tokenRes.jwt.trim();
          }
        }
      } catch (e) { }
    }

    // 2. Metadaten & getUserData2017 parallel abrufen
    const [subRes, teaRes, rooRes, klaRes, examTypesRes, classregCatsRes, userDataRes] = await Promise.all([
      callWebUntisApi('getSubjects').catch(() => ({})),
      callWebUntisApi('getTeachers').catch(() => ({})),
      callWebUntisApi('getRooms').catch(() => ({})),
      callWebUntisApi('getKlassen').catch(() => ({})),
      callWebUntisApi('getExamTypes').catch(() => ({})),
      callWebUntisApi('getClassregCategories').catch(() => ({})),
      callWebUntisApi('getUserData2017', [{ elementId: 0 }]).catch(() => callWebUntisApi('getUserData2017', { elementId: 0 }).catch(() => ({})))
    ]);

    const examTypesMap = {};
    if (examTypesRes && examTypesRes.result && Array.isArray(examTypesRes.result)) {
      examTypesRes.result.forEach(et => {
        const lbl = et.longName || et.name;
        examTypesMap[et.id] = lbl;
        if (et.name) examTypesMap[et.name] = lbl;
      });
    }

    const classregCatsMap = {};
    if (classregCatsRes && classregCatsRes.result && Array.isArray(classregCatsRes.result)) {
      classregCatsRes.result.forEach(c => {
        const lbl = c.longname || c.name || c.text;
        if (lbl) {
          classregCatsMap[c.id] = lbl;
          if (c.name) classregCatsMap[c.name] = lbl;
        }
      });
    }

    const subjectsMap = {};
    if (subRes && subRes.result && Array.isArray(subRes.result)) {
      subRes.result.forEach(s => {
        subjectsMap[s.id] = s.longName || s.name;
        if (s.name) subjectsMap[s.name] = s.longName || s.name;
      });
    }

    const teachersMap = {};
    if (teaRes && teaRes.result && Array.isArray(teaRes.result)) {
      teaRes.result.forEach(t => {
        // Use longName as full name, fallback to name (abbreviation). Never include foreName separately.
        const tName = t.longName || t.name || '';
        if (tName) {
          teachersMap[t.id] = tName;
          if (t.name) teachersMap[t.name] = tName;
        }
      });
    }

    const roomsMap = {};
    if (rooRes && rooRes.result && Array.isArray(rooRes.result)) {
      rooRes.result.forEach(r => {
        // Only store the room's short name (e.g. "B208"), not the longName (which is often a teacher name like "Hanauer")
        const label = r.name || r.longName || ('Raum ' + r.id);
        roomsMap[r.id] = label;
        if (r.name) roomsMap[r.name] = label;
      });
    }

    const klassenMap = {};
    if (klaRes && klaRes.result && Array.isArray(klaRes.result)) {
      klaRes.result.forEach(k => {
        const kName = k.longName || k.name || ('Klasse ' + k.id);
        klassenMap[k.id] = kName;
        if (k.name) klassenMap[k.name] = kName;
      });
    }

    appData.metadata = { subjectsMap, teachersMap, roomsMap, klassenMap };
    if (personId) appData.config.personId = personId;
    if (personType) appData.config.personType = personType;

    // 3. Datumsbereich: Aktuelle Schulwoche Mo-Fr (am Wochenende Folgewoche)
    const now = new Date();
    const curDay = now.getDay();
    let diffToMonday = 1 - curDay;
    if (curDay === 0) diffToMonday = 1; // Sonntag -> Montag
    else if (curDay === 6) diffToMonday = 2; // Samstag -> Montag

    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    const startNum = formatDateToUntis(monday);
    const endNum = formatDateToUntis(friday);

    // 4. Stundenplan für aktuelle Schulwoche abrufen
    const ttRes = await callWebUntisApi('getTimetable', {
      options: {
        element: { id: personId, type: personType },
        startDate: startNum,
        endDate: endNum,
        showLsText: true,
        showStudentgroup: true,
        showInfo: true,
        showSubstText: true,
        showLsNumber: true,
        showBooking: true,
        klasseFields: ['id', 'name', 'longname'],
        roomFields: ['id', 'name', 'longname'],
        subjectFields: ['id', 'name', 'longname'],
        teacherFields: ['id', 'name', 'longname']
      }
    }).catch(() => ({}));

    // 4b. Schüler- und Klassen-IDs vollständig erfassen (für personenbezogene UND klassenweite Abfragen)
    const detectedKlasseIds = new Set();
    const detectedStudentIds = new Set();

    if (personId) {
      if (personType === 1) detectedKlasseIds.add(personId);
      else detectedStudentIds.add(personId);
    }
    if (mobilePersonId) detectedStudentIds.add(mobilePersonId);
    if (authRes.result) {
      if (authRes.result.klasseId) detectedKlasseIds.add(authRes.result.klasseId);
      if (authRes.result.classId) detectedKlasseIds.add(authRes.result.classId);
    }
    if (userDataRes && userDataRes.result && userDataRes.result.userData) {
      const ud = userDataRes.result.userData;
      if (ud.elemType === 'STUDENT' && ud.elemId) detectedStudentIds.add(ud.elemId);
      if (ud.elemType === 'CLASS' && ud.elemId) detectedKlasseIds.add(ud.elemId);
      if (ud.klassenIds && Array.isArray(ud.klassenIds)) {
        ud.klassenIds.forEach(kId => { if (kId) detectedKlasseIds.add(kId); });
      }
      if (ud.children && Array.isArray(ud.children)) {
        ud.children.forEach(ch => { if (ch && ch.id) detectedStudentIds.add(ch.id); });
      }
    }
    if (ttRes && ttRes.result && Array.isArray(ttRes.result)) {
      ttRes.result.forEach(item => {
        if (item.kl && Array.isArray(item.kl)) {
          item.kl.forEach(k => { if (k && k.id) detectedKlasseIds.add(k.id); });
        }
      });
    }
    let detectedKlasseId = detectedKlasseIds.size > 0 ? Array.from(detectedKlasseIds)[0] : (personType === 1 ? personId : null);

    // 5. Schuljahr ermitteln (WebUntis getSchoolyears oder dynamische Berechnung)
    let syRange = getSchoolYearRange();
    try {
      const syRes = await callWebUntisApi('getSchoolyears', {});
      if (syRes && syRes.result && Array.isArray(syRes.result) && syRes.result.length > 0) {
        const todayNum = formatDateToUntis(now);
        // Sicherstellen, dass das aktive oder neueste zutreffende Schuljahr gewählt wird
        const activeSy = syRes.result.find(s => todayNum >= s.startDate && todayNum <= s.endDate)
          || syRes.result.find(s => s.endDate >= todayNum)
          || syRes.result[syRes.result.length - 1];
        if (activeSy && activeSy.startDate && activeSy.endDate) {
          const sStr = String(activeSy.startDate);
          const eStr = String(activeSy.endDate);
          syRange = {
            name: activeSy.name || `${sStr.slice(0, 4)}/${eStr.slice(0, 4)}`,
            startYear: parseInt(sStr.slice(0, 4)),
            endYear: parseInt(eStr.slice(0, 4)),
            startDateNum: activeSy.startDate,
            endDateNum: activeSy.endDate,
            startDate: new Date(parseInt(sStr.slice(0, 4)), parseInt(sStr.slice(4, 6)) - 1, parseInt(sStr.slice(6, 8))),
            endDate: new Date(parseInt(eStr.slice(0, 4)), parseInt(eStr.slice(4, 6)) - 1, parseInt(eStr.slice(6, 8)))
          };
        }
      }
    } catch (e) { }
    appData.schoolYear = syRange;

    // 5b. Offizielles Zeitraster der Schule abrufen (getTimegridUnits)
    try {
      const tgRes = await callWebUntisApi('getTimegridUnits', {});
      if (tgRes && tgRes.result && Array.isArray(tgRes.result)) {
        const unitsMap = new Map();
        tgRes.result.forEach(dayGrid => {
          if (dayGrid.timeUnits && Array.isArray(dayGrid.timeUnits)) {
            dayGrid.timeUnits.forEach(u => {
              const pNum = parseInt(u.name, 10);
              if (!isNaN(pNum)) {
                const sStr = formatUntisTimeToStr(u.startTime);
                const eStr = formatUntisTimeToStr(u.endTime);
                if (!unitsMap.has(pNum)) {
                  unitsMap.set(pNum, { period: pNum, start: sStr, end: eStr });
                }
              }
            });
          }
        });
        if (unitsMap.size > 0) {
          appData.periods = Array.from(unitsMap.values()).sort((a, b) => a.period - b.period);
        }
      }
    } catch (e) { }

    // ISO-Datumsstrings für WebUntis REST- & Mobile-Abfragen (YYYY-MM-DD)
    const sIsoStr = `${String(syRange.startDateNum).slice(0, 4)}-${String(syRange.startDateNum).slice(4, 6)}-${String(syRange.startDateNum).slice(6, 8)}`;
    const eIsoStr = `${String(syRange.endDateNum).slice(0, 4)}-${String(syRange.endDateNum).slice(4, 6)}-${String(syRange.endDateNum).slice(6, 8)}`;

    // 6. Gezielte, hochperformante Ganzjahresabfragen für Hausaufgaben, Klausuren, Stundenplan & Termine
    const authObjFull = appSharedSecret ? {
      clientTime: Date.now(),
      otp: generateTotpCode(appSharedSecret, Date.now()),
      user: username
    } : null;

    // A. Echte Hausaufgaben (getHomeWork2017) für Schüler & Klasse über das gesamte Schuljahr
    const homeworkCalls = [];
    detectedStudentIds.forEach(sId => {
      homeworkCalls.push(callWebUntisRest('/jsonrpc_intern.do?m=getHomeWork2017', jwtToken, 'POST', {
        id: 'hw-full-stud-' + Date.now(),
        jsonrpc: '2.0',
        method: 'getHomeWork2017',
        params: [{ id: sId, type: 'STUDENT', startDate: sIsoStr, endDate: eIsoStr, ...(authObjFull ? { auth: authObjFull } : {}) }]
      }).catch(() => ({})));
    });

    detectedKlasseIds.forEach(kId => {
      homeworkCalls.push(callWebUntisRest('/jsonrpc_intern.do?m=getHomeWork2017', jwtToken, 'POST', {
        id: 'hw-full-cls-' + Date.now(),
        jsonrpc: '2.0',
        method: 'getHomeWork2017',
        params: [{ id: kId, type: 'CLASS', startDate: sIsoStr, endDate: eIsoStr, ...(authObjFull ? { auth: authObjFull } : {}) }]
      }).catch(() => ({})));
    });

    homeworkCalls.push(callWebUntisApi('getHomeWorks', { startDate: syRange.startDateNum, endDate: syRange.endDateNum }).catch(() => ({})));

    // B. Echte Klausuren & Klassenarbeiten (getExams2017) für Schüler & Klasse über das gesamte Schuljahr
    const examCalls = [];
    detectedStudentIds.forEach(sId => {
      examCalls.push(callWebUntisRest('/jsonrpc_intern.do?m=getExams2017', jwtToken, 'POST', {
        id: 'ex-full-stud-' + Date.now(),
        jsonrpc: '2.0',
        method: 'getExams2017',
        params: [{ id: sId, type: 'STUDENT', startDate: sIsoStr, endDate: eIsoStr, ...(authObjFull ? { auth: authObjFull } : {}) }]
      }).catch(() => ({})));
    });

    detectedKlasseIds.forEach(kId => {
      examCalls.push(callWebUntisRest('/jsonrpc_intern.do?m=getExams2017', jwtToken, 'POST', {
        id: 'ex-full-cls-' + Date.now(),
        jsonrpc: '2.0',
        method: 'getExams2017',
        params: [{ id: kId, type: 'CLASS', startDate: sIsoStr, endDate: eIsoStr, ...(authObjFull ? { auth: authObjFull } : {}) }]
      }).catch(() => ({})));
    });

    examCalls.push(callWebUntisApi('getExams', { startDate: syRange.startDateNum, endDate: syRange.endDateNum }).catch(() => ({})));

    // C. Stundenplan für 4 Wochen (aktuelle Woche +/- 14 Tage)
    const futureTtCalls = [];
    const pStart = new Date(now);
    pStart.setDate(pStart.getDate() - 14);
    const pEnd = new Date(now);
    pEnd.setDate(pEnd.getDate() + 28);
    const ttStartNum = formatDateToUntis(pStart);
    const ttEndNum = formatDateToUntis(pEnd);

    futureTtCalls.push(callWebUntisApi('getTimetable', {
      options: {
        element: { id: personId, type: personType },
        startDate: ttStartNum,
        endDate: ttEndNum,
        showLsText: true,
        showStudentgroup: true,
        showInfo: true,
        showSubstText: true,
        showLsNumber: true,
        showBooking: true,
        klasseFields: ['id', 'name', 'longname'],
        roomFields: ['id', 'name', 'longname'],
        subjectFields: ['id', 'name', 'longname'],
        teacherFields: ['id', 'name', 'longname']
      }
    }).catch(() => ({})));

    detectedKlasseIds.forEach(kId => {
      futureTtCalls.push(callWebUntisApi('getTimetable', {
        options: {
          element: { id: kId, type: 1 },
          startDate: ttStartNum,
          endDate: ttEndNum,
          showLsText: true,
          showStudentgroup: true,
          showInfo: true,
          showSubstText: true,
          showLsNumber: true,
          showBooking: true,
          klasseFields: ['id', 'name', 'longname'],
          roomFields: ['id', 'name', 'longname'],
          subjectFields: ['id', 'name', 'longname'],
          teacherFields: ['id', 'name', 'longname']
        }
      }).catch(() => ({})));
    });

    // D. Klassenbuch / Lehrstoff für das gesamte Schuljahr
    const classregCalls = [
      callWebUntisApi('getClassregEvents', { startDate: syRange.startDateNum, endDate: syRange.endDateNum }).catch(() => ({})),
      callWebUntisApi('getClassregEvents', { startDate: syRange.startDateNum, endDate: syRange.endDateNum, id: personId, type: personType }).catch(() => ({}))
    ];
    detectedKlasseIds.forEach(kId => {
      classregCalls.push(callWebUntisApi('getClassregEvents', { startDate: syRange.startDateNum, endDate: syRange.endDateNum, id: kId, type: 1 }).catch(() => ({})));
    });

    // 7. Schüler-ID & Schuljahr ermitteln
    const effectiveStudentId = (detectedStudentIds && detectedStudentIds.size > 0) ? Array.from(detectedStudentIds)[0] : (personType === 5 ? personId : 4707);
    const effectiveSyId = (appData.schoolYear && appData.schoolYear.id) ? appData.schoolYear.id : 18;

    // E. Fehlzeiten (Multi-Kanal: getStudentAbsences2017 mit TOTP, Standard-RPC & REST)
    const absenceCalls = [];
    const studentIdList = detectedStudentIds && detectedStudentIds.size > 0 ? Array.from(detectedStudentIds) : [effectiveStudentId];
    
    studentIdList.forEach(sId => {
      // 1. Mobile JSON-RPC mit ISO-Datumsstrings (inklusive includeExcused & includeUnExcused)
      absenceCalls.push(callWebUntisRest('/jsonrpc_intern.do?m=getStudentAbsences2017', jwtToken, 'POST', {
        id: 'abs-iso-' + sId + '-' + Date.now(),
        jsonrpc: '2.0',
        method: 'getStudentAbsences2017',
        params: [{
          id: sId,
          type: 'STUDENT',
          startDate: sIsoStr,
          endDate: eIsoStr,
          includeExcused: true,
          includeUnExcused: true,
          includeUnexcused: true,
          ...(authObjFull ? { auth: authObjFull } : {})
        }]
      }).catch(() => ({})));

      // 2. Mobile JSON-RPC mit numerischen Untis-Daten (z. B. 20260902)
      absenceCalls.push(callWebUntisRest('/jsonrpc_intern.do?m=getStudentAbsences2017', jwtToken, 'POST', {
        id: 'abs-num-' + sId + '-' + Date.now(),
        jsonrpc: '2.0',
        method: 'getStudentAbsences2017',
        params: [{
          id: sId,
          type: 'STUDENT',
          startDate: syRange.startDateNum,
          endDate: syRange.endDateNum,
          includeExcused: true,
          includeUnExcused: true,
          includeUnexcused: true,
          ...(authObjFull ? { auth: authObjFull } : {})
        }]
      }).catch(() => ({})));

      // 3. Standard WebUntis JSON-RPC getStudentAbsences
      absenceCalls.push(callWebUntisApi('getStudentAbsences', {
        id: sId,
        startDate: syRange.startDateNum,
        endDate: syRange.endDateNum,
        includeExcused: true,
        includeUnexcused: true
      }).catch(() => ({})));
    });

    // 4. Globaler Aufruf getStudentAbsences2017 (ohne explizite ID für aktuellen Login-Benutzer)
    absenceCalls.push(callWebUntisRest('/jsonrpc_intern.do?m=getStudentAbsences2017', jwtToken, 'POST', {
      id: 'abs-all-' + Date.now(),
      jsonrpc: '2.0',
      method: 'getStudentAbsences2017',
      params: [{
        startDate: sIsoStr,
        endDate: eIsoStr,
        includeExcused: true,
        includeUnExcused: true,
        includeUnexcused: true,
        ...(authObjFull ? { auth: authObjFull } : {})
      }]
    }).catch(() => ({})));

    // 5. Standard WebUntis JSON-RPC getAbsences
    absenceCalls.push(callWebUntisApi('getAbsences', {
      startDate: syRange.startDateNum,
      endDate: syRange.endDateNum,
      includeExcused: true,
      includeUnexcused: true
    }).catch(() => ({})));

    // REST-Endpunkte für Fehlzeiten parallel abfragen
    const restAbsencesCalls = [
      callWebUntisRest(`/api/classreg/absence/students?startDate=${syRange.startDateNum}&endDate=${syRange.endDateNum}&studentId=${effectiveStudentId}`, jwtToken).catch(() => null),
      callWebUntisRest(`/api/classreg/absence/students/absencetimes?startDate=${syRange.startDateNum}&endDate=${syRange.endDateNum}&studentId=${effectiveStudentId}`, jwtToken).catch(() => null),
      callWebUntisRest(`/api/classreg/absences?studentId=${effectiveStudentId}`, jwtToken).catch(() => null),
      callWebUntisRest(`/api/classreg/absences?startDate=${syRange.startDateNum}&endDate=${syRange.endDateNum}`, jwtToken).catch(() => null),
      callWebUntisRest(`/api/classreg/absence/students`, jwtToken).catch(() => null),
      callWebUntisRest(`/api/rest/view/v1/students/${effectiveStudentId}/absences`, jwtToken).catch(() => null),
      callWebUntisRest(`/api/classreg/absencereasons`, jwtToken).catch(() => null)
    ];

    const [
      examResponses,
      classregResponses,
      futureTtResults,
      homeworkResponses,
      absenceResponses,
      holidaysRes,
      newsRes,
      restGradingRes,
      restGradeListRes,
      restClassregEvRes,
      restMessagesRes,
      restRecipientsRes,
      restAbsencesResults
    ] = await Promise.all([
      Promise.all(examCalls),
      Promise.all(classregCalls),
      Promise.all(futureTtCalls),
      Promise.all(homeworkCalls),
      Promise.all(absenceCalls),
      callWebUntisApi('getHolidays', {}).catch(() => ({})),
      callWebUntisApi('getNewsWidgetData', {}).catch(() => callWebUntisApi('getNewsWidget', {}).catch(() => ({}))),
      callWebUntisRest(`/api/classreg/grade/grading/list?studentId=${effectiveStudentId}&schoolyearId=${effectiveSyId}`, jwtToken).catch(() => null),
      callWebUntisRest(`/api/classreg/grade/gradeList?personId=${effectiveStudentId}&startDate=20240801&endDate=20270731`, jwtToken).catch(() => null),
      callWebUntisRest(`/api/classreg/classregevents?studentId=${effectiveStudentId}&startDate=${syRange.startDateNum}&endDate=${syRange.endDateNum}`, jwtToken).catch(() => null),
      callWebUntisRest('/api/rest/view/v1/messages', jwtToken).catch(() => null),
      callWebUntisRest('/api/rest/view/v1/messages/recipients/static/persons', jwtToken).catch(() => null),
      Promise.all(restAbsencesCalls)
    ]);
    const restExamsRes1 = null;
    const restExamsRes2 = null;
    const restAppDataRes = null;
    const restCalEventsRes1 = null;
    const restCalEventsRes2 = null;
    const restHomeworkRes1 = null;
    const restHomeworkRes2 = null;
    const restHomeworkRes3 = null;
    const restAbsencesRes = restAbsencesResults;

    const restCalDetailResults = [];
    const restTtResults = [];


    // 8. Sitzung bleibt für Folgebefehle und Navigation aktiv (kein vorzeitiges Logout)

    // -------------------------------------------------------------
    // Hilfsfunktionen für Raum- und Prüfungsvalidierung sind global definiert
    // -------------------------------------------------------------

    // 9. Stundenplan der aktuellen Schulwoche & des gesamten Schuljahres parsen
    const timetableExams = [];
    const timetableHomeworks = [];

    // Erweiterte Erkennung von Klassenarbeiten, Klausuren, Arbeiten und Tests
    // Fehlzeiten-Sammlung aus Stundenplan
    const timetableAbsences = [];
    function scanItemForAbsence(item, idx) {
      if (!item) return;
      const subjName = (item.su && item.su[0]) ? (subjectsMap[item.su[0].id] || item.su[0].name || item.su[0].longname || '') : '';
      const notes = [
        item.substText,
        item.lstext,
        item.info,
        item.bkText,
        item.text,
        item.activityType,
        item.code,
        item.cellState
      ].filter(t => typeof t === 'string' && t.trim()).join(' ');

      const isAbsCode = String(item.code || '').toLowerCase() === 'absent' ||
                        String(item.cellState || '').toUpperCase() === 'ABSENT' ||
                        item.studentAbsent === true ||
                        item.isAbsent === true;

      const isAbsText = /\b(abwesend|abwesenheit|krank|fehlt|fehlzeit|beurlaubt|arztbesuch|attest)\b/i.test(notes);

      if (isAbsCode || isAbsText) {
        const dStr = String(item.date || '').replace(/[-T:\s].*$/, '').replace(/-/g, '').trim().slice(0, 8);
        if (dStr.length === 8) {
          const isoDate = `${dStr.slice(0, 4)}-${dStr.slice(4, 6)}-${dStr.slice(6, 8)}`;
          const sTime = item.startTime ? formatUntisTimeToStr(item.startTime) : '07:45';
          const eTime = item.endTime ? formatUntisTimeToStr(item.endTime) : '15:10';
          const isExc = /\b(entschuldigt|beurlaubt|genehmigt|attest)\b/i.test(notes);
          const reason = notes.trim() ? notes.slice(0, 80) : (subjName ? `Fehlzeit in Fach ${subjName}` : 'Fehlzeit laut Stundenplan');
          timetableAbsences.push({
            id: `tt-abs-${item.id || idx}-${isoDate}`,
            startDate: isoDate,
            endDate: isoDate,
            startTime: sTime,
            endTime: eTime,
            subject: subjName || '',
            reason: reason,
            isExcused: isExc,
            hours: 1
          });
        }
      }
    }

    function scanItemForExam(item, idx) {
      if (!item) return;
      const subjName = (item.su && item.su[0]) ? (subjectsMap[item.su[0].id] || item.su[0].name || item.su[0].longname || '') : '';
      const codeVal = String(item.code || '').toLowerCase();
      const actVal = String(item.activityType || '').toLowerCase();
      const typeVal = String(item.type || '').toLowerCase();
      const cellVal = String(item.cellType || '').toLowerCase();

      // 1. Eingebettete Prüfungen in item.exams oder item.exam direkt auspacken!
      if (item.exams && Array.isArray(item.exams) && item.exams.length > 0) {
        item.exams.forEach((exObj, eIdx) => {
          const rawD = exObj.date || exObj.examDate || exObj.startDate || item.date;
          const dStrEx = String(rawD || '').replace(/[-T:\s].*$/, '').replace(/-/g, '').trim().slice(0, 8);
          if (dStrEx.length === 8) {
            const isoDateEx = `${dStrEx.slice(0, 4)}-${dStrEx.slice(4, 6)}-${dStrEx.slice(6, 8)}`;
            let sEx = exObj.subject || subjName || 'Klausur';
            if (typeof sEx === 'object') sEx = sEx.name || sEx.longName || 'Klausur';
            let tEx = (exObj.teachers && exObj.teachers[0]) || exObj.teacher || (item.te && item.te[0] && (teachersMap[item.te[0].id] || item.te[0].name)) || 'Fachlehrkraft';
            if (typeof tEx === 'object') tEx = tEx.name || tEx.longName || 'Fachlehrkraft';
            let rEx = (exObj.rooms && exObj.rooms[0]) || exObj.room || (item.ro && item.ro[0] && extractRoomFromObj(item.ro[0])) || 'Raum laut Plan';
            if (typeof rEx === 'object') rEx = rEx.name || rEx.longName || 'Raum laut Plan';
            timetableExams.push({
              id: `tt-emb-exam-${exObj.id || item.id || idx}-${eIdx}-${isoDateEx}`,
              subject: String(sEx),
              date: isoDateEx,
              startTime: formatUntisTimeToStr(exObj.startTime || item.startTime || 745),
              endTime: formatUntisTimeToStr(exObj.endTime || item.endTime || 915),
              room: isValidRoomCandidate(rEx) ? formatRoomDisplay(rEx, tEx) : 'Raum laut Plan',
              teacher: String(tEx),
              topic: exObj.text || exObj.name || exObj.description || 'Klassenarbeit / Klausur laut WebUntis',
              type: 'exam',
              completed: false
            });
          }
        });
      }

      const notes = [
        item.substText,
        item.lstext,
        item.info,
        item.bkText,
        item.text,
        item.sg,
        item.lessonText,
        item.activityType,
        item.code,
        subjName
      ].filter(t => typeof t === 'string' && t.trim()).join(' ');

      const isExamCode = codeVal === 'exam' || codeVal === 'klausur' || codeVal === 'examination' ||
                         actVal === 'exam' || actVal === 'klausur' || actVal === 'examination' ||
                         typeVal === 'exam' || cellVal === 'exam' ||
                         item.examId !== undefined || item.exam !== undefined || item.isExam === true;

      const isExamText = /\b(klausur|klausuren|klausurblock|klausurtag|klausurtage|klassenarbeit|klassenarbeiten|prüfung|pruefung|prüfungen|pruefungen|arbeit|arbeiten|test|tests|leistungsnachweis|nachschreib|nachschreiber|nachhol|abschlussprüfung|abschlusspruefung|zentrale\s+prüfung|zentrale\s+pruefung|zk|zap|zp\s*10|facharbeit|kolloquium|präsentationsprüfung|kursarbeit|schulaufgabe|kurzarbeit)\b|\b(ka\b|ka-|\(ka\)|1\.\s*ka|2\.\s*ka|3\.\s*ka|4\.\s*ka|klaus\.|kl\.)/i.test(notes) ||
                         /\b(klassenarbeit|klausur|arbeit|test|prüfung|ka\b)/i.test(subjName);

      if (isExamCode || isExamText) {
        const dStr = String(item.date || '').replace(/[-T:\s].*$/, '').replace(/-/g, '').trim().slice(0, 8);
        if (dStr.length === 8) {
          const isoDate = `${dStr.slice(0, 4)}-${dStr.slice(4, 6)}-${dStr.slice(6, 8)}`;
          let subj = subjName || 'Klausur';
          if (/klassenarbeit/i.test(notes) && !/klassenarbeit/i.test(subj)) {
            subj = subj ? `${subj} (Klassenarbeit)` : 'Klassenarbeit';
          } else if (/^klausur/i.test(subj) && notes && notes !== subj) {
            subj = notes.slice(0, 35);
          }
          const teach = (item.te && item.te[0]) ? (teachersMap[item.te[0].id] || item.te[0].name || 'Fachlehrkraft') : 'Fachlehrkraft';

          let rm = 'Raum laut Plan';
          if (item.ro && Array.isArray(item.ro) && item.ro[0]) {
            rm = extractRoomFromObj(item.ro[0]);
          }
          if (!isValidRoomCandidate(rm)) rm = 'Raum laut Plan';
          else rm = formatRoomDisplay(rm, teach);

          const topicText = [item.substText, item.info, item.lstext, item.lessonText, item.text, subjName].filter(t => typeof t === 'string' && t.trim()).join(' - ') || 'Klassenarbeit / Klausur laut WebUntis';

          timetableExams.push({
            id: `tt-exam-${item.id || dStr + '-' + (item.startTime || idx)}`,
            subject: subj,
            date: isoDate,
            startTime: formatUntisTimeToStr(item.startTime || 745),
            endTime: formatUntisTimeToStr(item.endTime || 915),
            room: rm,
            teacher: teach,
            topic: topicText,
            type: 'exam',
            completed: false
          });
        }
      }
    }

    // Automatische Erkennung von Hausaufgaben aus dem Stundenplan & Klassenbuch
    function scanItemForHomework(item, idx) {
      if (!item) return;
      const subjName = (item.su && item.su[0]) ? (subjectsMap[item.su[0].id] || item.su[0].name || item.su[0].longname || '') : '';
      const dStr = String(item.date || '').replace(/[-T:\s].*$/, '').replace(/-/g, '').trim().slice(0, 8);
      if (dStr.length !== 8) return;

      // Streng auf das aktuelle Schuljahr beschränken, keine Altlasten aus früheren Jahren übernehmen!
      const sy = appData.schoolYear || getSchoolYearRange();
      const dNum = parseInt(dStr, 10);
      if (dNum < sy.startDateNum || dNum > sy.endDateNum) return;

      const isoDate = `${dStr.slice(0, 4)}-${dStr.slice(4, 6)}-${dStr.slice(6, 8)}`;
      const teach = (item.te && item.te[0]) ? (teachersMap[item.te[0].id] || item.te[0].name || 'Fachlehrkraft') : 'Fachlehrkraft';

      // 1. item.homework direkt auswerten (String, Objekt oder Array)
      if (item.homework) {
        if (typeof item.homework === 'string' && item.homework.trim()) {
          timetableHomeworks.push({
            id: `tt-hw-${item.id || idx}-${isoDate}`,
            subject: subjName || 'Hausaufgabe',
            teacher: teach,
            dueDate: isoDate,
            text: item.homework.trim(),
            completed: false
          });
        } else if (Array.isArray(item.homework)) {
          item.homework.forEach((hwObj, hIdx) => {
            if (typeof hwObj === 'string' && hwObj.trim()) {
              timetableHomeworks.push({
                id: `tt-hw-${item.id || idx}-${hIdx}-${isoDate}`,
                subject: subjName || 'Hausaufgabe',
                teacher: teach,
                dueDate: isoDate,
                text: hwObj.trim(),
                completed: false
              });
            } else if (hwObj && typeof hwObj === 'object') {
              const t = hwObj.text || hwObj.remark || hwObj.description || hwObj.title || '';
              let d = hwObj.dueDate || hwObj.date || isoDate;
              let dClean = String(d).replace(/[-T:\s].*$/, '').replace(/-/g, '').slice(0, 8);
              let dIso = (dClean.length === 8) ? `${dClean.slice(0, 4)}-${dClean.slice(4, 6)}-${dClean.slice(6, 8)}` : isoDate;
              if (t) {
                timetableHomeworks.push({
                  id: String(hwObj.id || `tt-hw-${item.id || idx}-${hIdx}-${dIso}`),
                  subject: subjName || 'Hausaufgabe',
                  teacher: teach,
                  dueDate: dIso,
                  text: String(t).trim(),
                  completed: !!hwObj.completed
                });
              }
            }
          });
        } else if (typeof item.homework === 'object') {
          const t = item.homework.text || item.homework.remark || item.homework.description || item.homework.title || '';
          let d = item.homework.dueDate || item.homework.date || isoDate;
          let dClean = String(d).replace(/[-T:\s].*$/, '').replace(/-/g, '').slice(0, 8);
          let dIso = (dClean.length === 8) ? `${dClean.slice(0, 4)}-${dClean.slice(4, 6)}-${dClean.slice(6, 8)}` : isoDate;
          if (t) {
            timetableHomeworks.push({
              id: String(item.homework.id || `tt-hw-${item.id || idx}-${dIso}`),
              subject: subjName || 'Hausaufgabe',
              teacher: teach,
              dueDate: dIso,
              text: String(t).trim(),
              completed: !!item.homework.completed
            });
          }
        }
      }

      // 2. Texte in lstext, lessonText, substText, info scannen nach EXPLIZITEN Hausaufgaben-Hinweisen
      const candidateTexts = [item.lstext, item.lessonText, item.info, item.substText, item.text].filter(t => typeof t === 'string' && t.trim());
      candidateTexts.forEach((cText, cIdx) => {
        // Nicht als Hausaufgabe einstufen, wenn es eine reine Klausurankündigung ist
        if (/\b(klausur|klassenarbeit|klausuren|klassenarbeiten|nachschreibklausur)\b/i.test(cText)) return;

        // Nur explizite Hausaufgaben-Hinweise matchen (keine reinen Unterrichtsnotizen wie 'Buch S.' oder 'Arbeitsblatt')
        const hwMatch = cText.match(/\b(?:ha:|h\.a\.:|hausaufgabe:|hausaufgaben:|hausaufgabe\b|hausaufgaben\b|zu\s+erledigen\s+bis|erledigen\s+bis|abgabe\s+bis|aufgabe\s+bis)\s*[:\-]?\s*(.+)/i);
        if (hwMatch) {
          const hwContent = hwMatch[1] ? hwMatch[1].trim() : cText.trim();
          if (hwContent.length > 2) {
            timetableHomeworks.push({
              id: `tt-text-hw-${item.id || idx}-${cIdx}-${isoDate}`,
              subject: subjName || 'Hausaufgabe',
              teacher: teach,
              dueDate: isoDate,
              text: hwContent,
              completed: false
            });
          }
        }
      });
    }

    // Alle Stundenplanquellen für das gesamte Schuljahr sammeln
    const allTtSource = [];
    if (ttRes && ttRes.result && Array.isArray(ttRes.result)) allTtSource.push(...ttRes.result);
    if (futureTtResults && Array.isArray(futureTtResults)) {
      futureTtResults.forEach(f => {
        if (!f) return;
        const resObj = f.result || f;
        if (!resObj) return;
        if (Array.isArray(resObj)) {
          allTtSource.push(...resObj);
        } else if (resObj.timetable && Array.isArray(resObj.timetable.periods)) {
          allTtSource.push(...resObj.timetable.periods);
        } else if (Array.isArray(resObj.periods)) {
          allTtSource.push(...resObj.periods);
        } else if (Array.isArray(resObj.data)) {
          allTtSource.push(...resObj.data);
        }
      });
    }

    // Alle Stunden des gesamten Schuljahres nach Klassenarbeiten & Hausaufgaben scannen
    allTtSource.forEach((item, idx) => {
      scanItemForExam(item, idx);
      scanItemForHomework(item, idx);
      scanItemForAbsence(item, idx);
      if (item.kl && Array.isArray(item.kl)) {
        item.kl.forEach(k => { if (k && k.id) detectedKlasseIds.add(k.id); });
      }
    });


    // Stundenplan der aktuellen Schulwoche in appData.timetable überführen
    if (!appData.timetableCache) appData.timetableCache = {};

    // 1. Alle aus dem erweiterten Zeitraum (-14 bis +28 Tage) gesammelten Stunden in den Cache überführen
    if (allTtSource && allTtSource.length > 0) {
      const allParsedLessons = parseUntisTimetableItems(allTtSource);
      allParsedLessons.forEach(l => {
        if (!l.dateNum) return;
        const dStr = String(l.dateNum);
        const itemD = new Date(parseInt(dStr.slice(0, 4)), parseInt(dStr.slice(4, 6)) - 1, parseInt(dStr.slice(6, 8)));
        const dDay = itemD.getDay();
        const diffToMo = (dDay === 0) ? -6 : (1 - dDay);
        const moD = new Date(itemD);
        moD.setDate(itemD.getDate() + diffToMo);
        const moKey = formatDateToUntis(moD);
        if (!appData.timetableCache[moKey]) appData.timetableCache[moKey] = [];
        if (!appData.timetableCache[moKey].some(existing => existing.id === l.id || (existing.dateStr === l.dateStr && existing.period === l.period && existing.subject === l.subject))) {
          appData.timetableCache[moKey].push(l);
        }
      });
    }

    // 2. Primäre Schulwoche in Cache sichern
    if (ttRes && ttRes.result && Array.isArray(ttRes.result)) {
      const currentWeekLessons = parseUntisTimetableItems(ttRes.result);
      if (currentWeekLessons.length > 0) {
        appData.timetableCache[startNum] = currentWeekLessons;
      }
    }

    // 3. Stundenplan für die aktuell ausgewählte Woche setzen
    const targetMonday = getMondayForWeekOffset(selectedWeekOffset);
    const targetMondayKey = formatDateToUntis(targetMonday);
    if (appData.timetableCache[targetMondayKey] && appData.timetableCache[targetMondayKey].length > 0) {
      appData.timetable = appData.timetableCache[targetMondayKey];
    } else if (appData.timetableCache[startNum] && appData.timetableCache[startNum].length > 0) {
      appData.timetable = appData.timetableCache[startNum];
    }



    // 10. Prüfungen zusammenführen & deduplizieren
    const newExams = [];

    function addUniqueExam(exItem) {
      if (!exItem || !exItem.date || !exItem.subject) return;

      // Volle Fachbezeichnung dynamisch aus WebUntis-Metadaten expandieren
      const sTrim = String(exItem.subject).trim();
      if (subjectsMap[sTrim]) {
        const full = subjectsMap[sTrim];
        exItem.subject = (full && full.toUpperCase() !== sTrim.toUpperCase()) ? `${full} (${sTrim})` : full;
      }

      const isGeneric = /^(klassenarbeit|klausur|prüfung|pruefung|klassenarbeit\s*\/\s*klausur)$/i.test(exItem.subject.trim());

      // Prüfen ob bereits eine Prüfung am selben Tag im selben oder überlappenden Zeitfenster existiert
      const existingIdx = newExams.findIndex(e => {
        if (e.date !== exItem.date) return false;
        if (e.startTime === exItem.startTime) return true;
        // Überlappendes Zeitfenster (z.B. 08:30-10:20 überspannt Einzelstunden)
        if (exItem.startTime >= e.startTime && exItem.startTime < e.endTime) return true;
        if (e.startTime >= exItem.startTime && e.startTime < exItem.endTime) return true;
        return false;
      });

      if (existingIdx >= 0) {
        const existing = newExams[existingIdx];
        const existingIsGeneric = /^(klassenarbeit|klausur|prüfung|pruefung|klassenarbeit\s*\/\s*klausur)$/i.test(existing.subject.trim());
        if (existingIsGeneric && !isGeneric) {
          newExams[existingIdx] = exItem;
        } else if (!existingIsGeneric && isGeneric) {
          // Spezifischeres Fach bereits vorhanden
          return;
        } else if (String(exItem.id).startsWith('untis-exam') && !String(existing.id).startsWith('untis-exam')) {
          newExams[existingIdx] = exItem;
        }
        return;
      }

      newExams.push(exItem);
    }

    // A. WebUntis getExams & getExams2017 parsen
    const rawExamsList = [];
    examResponses.forEach(res => {
      if (!res) return;
      const resObj = res.result || res;
      if (!resObj) return;
      if (Array.isArray(resObj)) {
        rawExamsList.push(...resObj);
      } else if (resObj.exams && Array.isArray(resObj.exams)) {
        rawExamsList.push(...resObj.exams);
      } else if (resObj.records && Array.isArray(resObj.records)) {
        rawExamsList.push(...resObj.records);
      } else if (resObj.data && Array.isArray(resObj.data)) {
        rawExamsList.push(...resObj.data);
      }
    });

    [restExamsRes1, restExamsRes2].forEach(rRes => {
      if (!rRes) return;
      const rObj = rRes.data || rRes;
      if (Array.isArray(rObj)) rawExamsList.push(...rObj);
      else if (rObj.exams && Array.isArray(rObj.exams)) rawExamsList.push(...rObj.exams);
      else if (rObj.records && Array.isArray(rObj.records)) rawExamsList.push(...rObj.records);
    });

    rawExamsList.forEach((ex, idx) => {
      if (!ex) return;
      let isoDate = '';
      let sTimeStr = '';
      let eTimeStr = '';

      if (ex.startDateTime) {
        isoDate = normalizeToIsoDate(ex.startDateTime);
        const sMatch = String(ex.startDateTime).match(/T(\d{2}:\d{2})/);
        if (sMatch) sTimeStr = sMatch[1];
      }
      if (ex.endDateTime) {
        const eMatch = String(ex.endDateTime).match(/T(\d{2}:\d{2})/);
        if (eMatch) eTimeStr = eMatch[1];
      }

      const rawDate = ex.date || ex.examDate || ex.startDate;
      if (!isoDate && rawDate) {
        isoDate = normalizeToIsoDate(rawDate);
      }
      if (!isoDate) return;

      if (!sTimeStr) {
        const sTime = ex.startTime !== undefined ? ex.startTime : (ex.start || 745);
        sTimeStr = formatUntisTimeToStr(sTime);
      }
      if (!eTimeStr) {
        const eTime = ex.endTime !== undefined ? ex.endTime : (ex.end || 915);
        eTimeStr = formatUntisTimeToStr(eTime);
      }

      let subj = 'Klausur';
      const sId = ex.subjectId || ex.subject;
      if (sId && subjectsMap[sId]) subj = subjectsMap[sId];
      else if (typeof sId === 'string' && sId.trim()) subj = sId.trim();
      else if (sId && typeof sId === 'object') subj = sId.name || sId.longName || 'Klausur';
      else if (ex.name && !/^klausur/i.test(ex.name)) subj = ex.name;

      let exTeacher = 'Fachlehrkraft';
      const tIds = ex.teacherIds || (ex.teachers && Array.isArray(ex.teachers) ? ex.teachers : null);
      const tId = (tIds && tIds[0]) || ex.teacher || ex.teacherId;
      if (tId && teachersMap[tId]) {
        exTeacher = teachersMap[tId];
      } else if (typeof tId === 'string' && tId.trim()) {
        exTeacher = tId.trim();
      } else if (tId && typeof tId === 'object') {
        exTeacher = tId.name || tId.longName || 'Fachlehrkraft';
      }

      let exRoom = 'Raum laut Plan';
      const rIds = ex.roomIds || (ex.rooms && Array.isArray(ex.rooms) ? ex.rooms : null);
      const rId = (rIds && rIds[0]) || ex.room || ex.roomId;
      if (rId) {
        const rCandidate = extractRoomFromObj(rId);
        if (isValidRoomCandidate(rCandidate)) {
          exRoom = formatRoomDisplay(rCandidate, exTeacher);
        }
      }

      const topicParts = [];
      if (ex.examType && examTypesMap[ex.examType]) topicParts.push(examTypesMap[ex.examType]);
      else if (ex.examTypeId && examTypesMap[ex.examTypeId]) topicParts.push(examTypesMap[ex.examTypeId]);
      if (ex.name) topicParts.push(ex.name);
      if (ex.text && ex.text !== ex.name) topicParts.push(ex.text);
      if (ex.description && ex.description !== ex.name) topicParts.push(ex.description);

      const topicName = topicParts.filter(Boolean).join(' - ') || 'Klausur laut WebUntis';

      addUniqueExam({
        id: `untis-exam-${ex.id || idx}-${isoDate}`,
        subject: subj,
        date: isoDate,
        startTime: sTimeStr,
        endTime: eTimeStr,
        room: exRoom,
        teacher: exTeacher,
        topic: topicName,
        type: 'exam',
        completed: false
      });
    });

    // B. Klassenbuch-Ereignisse (getClassregEvents) parsen (Prüfungen + Termine)
    const newHolidays = [];
    const holidayKeySet = new Set();

    const rawClassregList = [];
    classregResponses.forEach(res => {
      if (res && res.result && Array.isArray(res.result)) {
        rawClassregList.push(...res.result);
      }
    });

    rawClassregList.forEach((evt, idx) => {
      if (!evt) return;
      const rawDate = evt.date || evt.startDate;
      if (!rawDate) return;
      const dStr = String(rawDate).replace(/[-T:\s].*$/, '').replace(/-/g, '').trim().slice(0, 8);
      if (dStr.length !== 8) return;

      const dateNum = parseInt(dStr);
      const isoDate = `${dStr.slice(0, 4)}-${dStr.slice(4, 6)}-${dStr.slice(6, 8)}`;
      const catName = (evt.categoryId && classregCatsMap[evt.categoryId]) || evt.category || '';
      const reason = evt.reason || evt.text || evt.description || evt.name || '';
      const sTime = evt.starttime !== undefined ? evt.starttime : (evt.startTime || 745);
      const eTime = evt.endtime !== undefined ? evt.endtime : (evt.endTime || 915);

      let subj = 'Schultermin';
      if (evt.subjectId && subjectsMap[evt.subjectId]) subj = subjectsMap[evt.subjectId];
      else if (evt.subject && subjectsMap[evt.subject]) subj = subjectsMap[evt.subject];

      let teach = 'Fachlehrkraft';
      const tId = evt.teacherId || (evt.teachers && evt.teachers[0]) || evt.teacher;
      if (tId && teachersMap[tId]) teach = teachersMap[tId];

      const fullText = `${catName} ${reason} ${evt.text || ''}`.toLowerCase();
      const isExam = /\b(klausur|klassenarbeit|prüfung|pruefung|arbeit|test|leistungsnachweis|nachschreib|zk|abschlussprüfung|facharbeit)\b/i.test(fullText);

      const isAbsenceEvt = /\b(abwesend|abwesenheit|krank|krankmeldung|fehlt|fehlzeit|versp\u00e4tung|verspaetung|entschuldigung|attest|arzt)\b/i.test(fullText);
      if (isAbsenceEvt && !isExam) {
        const isExc = /\b(entschuldigt|beurlaubt|genehmigt|attest)\b/i.test(fullText);
        addUniqueAbsence({
          id: `classreg-abs-${evt.id || dStr + '-' + sTime + '-' + idx}`,
          startDate: isoDate,
          endDate: isoDate,
          startTime: formatUntisTimeToStr(sTime),
          endTime: formatUntisTimeToStr(eTime),
          reason: reason || catName || 'Fehlzeit laut Klassenbuch',
          isExcused: isExc,
          hours: 1
        });
      }

      if (isExam) {
        addUniqueExam({
          id: `classreg-exam-${evt.id || dStr + '-' + sTime + '-' + idx}`,
          subject: (subj !== 'Schultermin' ? subj : (reason || 'Klausur')),
          date: isoDate,
          startTime: formatUntisTimeToStr(sTime),
          endTime: formatUntisTimeToStr(eTime),
          room: 'Raum laut Plan',
          teacher: teach,
          topic: [catName, reason, evt.text].filter(Boolean).join(' - ') || 'Prüfung laut WebUntis',
          type: 'exam',
          completed: false
        });
      } else {
        const title = reason || catName || 'Schultermin';
        const key = `classreg_${isoDate}_${title.toLowerCase().trim()}`;
        if (!holidayKeySet.has(key)) {
          holidayKeySet.add(key);
          newHolidays.push({
            id: `classreg-evt-${evt.id || dStr + '-' + sTime + '-' + idx}`,
            name: title,
            shortName: catName || title,
            longName: [catName, reason, evt.text].filter(Boolean).join(' - '),
            startDate: isoDate,
            endDate: isoDate,
            startDateNum: dateNum,
            endDateNum: dateNum,
            timeStr: `${formatUntisTimeToStr(sTime)} - ${formatUntisTimeToStr(eTime)} Uhr`,
            type: 'appointment'
          });
        }
      }
    });

    // C. Stundenplan-Prüfungen hinzufügen
    timetableExams.forEach(addUniqueExam);

    // D. Prüfungen aus Untis Mobile calendar-entry/detail und timetable/entries
    if (restCalDetailResults && Array.isArray(restCalDetailResults)) {
      restCalDetailResults.forEach(r => {
        if (!r || !r.calendarEntries || !Array.isArray(r.calendarEntries)) return;
        r.calendarEntries.forEach((entry, eIdx) => {
          const sRaw = entry.startDateTime || '';
          const eRaw = entry.endDateTime || '';
          const isoDate = normalizeToIsoDate(sRaw) || normalizeToIsoDate(eRaw);
          if (!isoDate) return;

          let sTimeStr = '07:45';
          let eTimeStr = '09:15';
          const sMatch = String(sRaw).match(/T(\d{2}:\d{2})/);
          if (sMatch) sTimeStr = sMatch[1];
          const eMatch = String(eRaw).match(/T(\d{2}:\d{2})/);
          if (eMatch) eTimeStr = eMatch[1];

          let subj = (entry.subject && (entry.subject.displayName || entry.subject.longName || entry.subject.name)) || 'Unterricht';
          let teach = (entry.teachers && entry.teachers[0] && (entry.teachers[0].displayName || entry.teachers[0].longName || entry.teachers[0].name)) || 'Fachlehrkraft';
          let rm = (entry.rooms && entry.rooms[0] && (entry.rooms[0].displayName || entry.rooms[0].name || entry.rooms[0].longName)) || 'Raum laut Plan';
          if (isValidRoomCandidate(rm)) rm = formatRoomDisplay(rm, teach);

          if (entry.exam || entry.type === 'EXAM') {
            const exObj = entry.exam || {};
            const exTitle = exObj.name || exObj.text || exObj.description || (entry.type === 'EXAM' ? `${subj} (Klausur)` : 'Klausur');
            addUniqueExam({
              id: `cal-detail-exam-${entry.id || eIdx}-${isoDate}`,
              subject: String(subj),
              date: isoDate,
              startTime: sTimeStr,
              endTime: eTimeStr,
              room: rm,
              teacher: String(teach),
              topic: String(exTitle),
              type: 'exam',
              completed: false
            });
          }
        });
      });
    }

    if (restTtResults && Array.isArray(restTtResults)) {
      restTtResults.forEach(tt => {
        if (!tt || !tt.days || !Array.isArray(tt.days)) return;
        tt.days.forEach(day => {
          const dIso = normalizeToIsoDate(day.date);
          if (!dIso || !day.gridEntries || !Array.isArray(day.gridEntries)) return;
          day.gridEntries.forEach((ge, gIdx) => {
            const isGeExam = ge.type === 'EXAM' ||
                             (ge.name && /\b(klausur|klassenarbeit|arbeit|test|prüfung)\b/i.test(ge.name));
            if (isGeExam) {
              let sTimeStr = '07:45';
              let eTimeStr = '09:15';
              if (ge.duration) {
                const sm = String(ge.duration.start || '').match(/T(\d{2}:\d{2})/);
                if (sm) sTimeStr = sm[1];
                const em = String(ge.duration.end || '').match(/T(\d{2}:\d{2})/);
                if (em) eTimeStr = em[1];
              }
              addUniqueExam({
                id: `rest-tt-exam-${(ge.ids && ge.ids[0]) || gIdx}-${dIso}`,
                subject: ge.name || 'Klassenarbeit / Klausur',
                date: dIso,
                startTime: sTimeStr,
                endTime: eTimeStr,
                room: 'Raum laut Plan',
                teacher: 'Fachlehrkraft',
                topic: ge.name || 'Prüfung laut Untis Mobile',
                type: 'exam',
                completed: false
              });
            }
          });
        });
      });
    }

    // E. Termine & Prüfungen aus allen weiteren WebUntis REST-Endpunkten
    const allRestSources = [
      restAppDataRes,
      restExamsRes1,
      restExamsRes2,
      restCalEventsRes1,
      restCalEventsRes2
    ];

    allRestSources.forEach(resObj => {
      if (!resObj) return;
      const payload = resObj.data || resObj;
      const candidates = [];
      if (Array.isArray(payload)) candidates.push(...payload);
      if (Array.isArray(payload.exams)) candidates.push(...payload.exams);
      if (Array.isArray(payload.calendarEvents)) candidates.push(...payload.calendarEvents);
      if (Array.isArray(payload.events)) candidates.push(...payload.events);
      if (Array.isArray(payload.classregEvents)) candidates.push(...payload.classregEvents);
      if (Array.isArray(payload.items)) candidates.push(...payload.items);

      candidates.forEach((ev, idx) => {
        if (!ev) return;
        const rawDate = ev.date || ev.examDate || ev.startDate || ev.start;
        if (!rawDate) return;
        const isoDate = normalizeToIsoDate(rawDate);
        if (!isoDate) return;

        const dateNum = parseInt(isoDate.replace(/-/g, ''));
        if (dateNum < syRange.startDateNum || dateNum > syRange.endDateNum) return;

        let title = ev.name || ev.subject || ev.title || ev.reason || ev.text || ev.topic || 'Termin';
        if (typeof title === 'object' && title) title = title.name || title.longName || 'Termin';

        let desc = [ev.description, ev.text, ev.reason, ev.name, ev.topic].filter(t => typeof t === 'string' && t.trim() && t !== title).join(' - ');

        let teach = ev.teacher || 'Fachlehrkraft';
        if (typeof teach === 'object' && teach) teach = teach.name || teach.longName || 'Fachlehrkraft';
        let rm = ev.room || 'Raum laut Plan';
        if (typeof rm === 'object' && rm) rm = rm.name || rm.longName || 'Raum laut Plan';
        if (isValidRoomCandidate(rm)) rm = formatRoomDisplay(rm, teach);

        const fullEvText = `${title} ${desc} ${ev.type || ''} ${ev.category || ''}`.toLowerCase();
        const isExam = ev.type === 'exam' || ev.isExam === true ||
          /\b(klausur|klausuren|klausurblock|klausurtag|klausurtage|klassenarbeit|klassenarbeiten|prüfung|pruefung|prüfungen|pruefungen|arbeit|arbeiten|test|tests|leistungsnachweis|nachschreib|nachschreiber|abschlussprüfung|abschlusspruefung|zentrale\s+prüfung|zentrale\s+pruefung|zk|zap|zp\s*10|facharbeit|ka\b)/i.test(fullEvText);

        if (isExam) {
          let cleanSubj = String(title);
          if (!/\b(klausur|klassenarbeit|arbeit|test|prüfung)\b/i.test(cleanSubj)) {
            cleanSubj = `${cleanSubj} (Klassenarbeit)`;
          }
          addUniqueExam({
            id: `untis-rest-${ev.id || isoDate + '-' + idx}`,
            subject: cleanSubj,
            date: isoDate,
            startTime: formatUntisTimeToStr(ev.startTime || ev.start || 745),
            endTime: formatUntisTimeToStr(ev.endTime || ev.end || 915),
            room: rm,
            teacher: String(teach),
            topic: desc || title || 'Klassenarbeit / Klausur laut WebUntis',
            type: 'exam',
            completed: false
          });
        } else {
          const key = `app_event_${isoDate}_${title.toLowerCase().trim()}`;
          if (!holidayKeySet.has(key)) {
            holidayKeySet.add(key);
            newHolidays.push({
              id: `untis-rest-evt-${ev.id || isoDate + '-' + idx}`,
              name: title,
              shortName: title,
              longName: desc ? `${title}: ${desc}` : title,
              startDate: isoDate,
              endDate: isoDate,
              startDateNum: dateNum,
              endDateNum: dateNum,
              timeStr: `${formatUntisTimeToStr(ev.startTime || 745)} - ${formatUntisTimeToStr(ev.endTime || 915)} Uhr`,
              type: 'appointment'
            });
          }
        }
      });
    });

    // 11. Schulferien und Termine parsen (STRIKT NUR AKTUELLES SCHULJAHR 2026/2027!)
    if (holidaysRes && holidaysRes.result && Array.isArray(holidaysRes.result)) {
      holidaysRes.result.forEach(h => {
        // FILTER: Nur Ferien im aktuellen Schuljahr einbeziehen (Historische Jahre wie 2020-2025 ignorieren!)
        if (h.endDate < syRange.startDateNum || h.startDate > syRange.endDateNum) return;

        const sStr = String(h.startDate);
        const eStr = String(h.endDate);
        if (sStr.length !== 8 || eStr.length !== 8) return;
        const sIso = `${sStr.slice(0, 4)}-${sStr.slice(4, 6)}-${sStr.slice(6, 8)}`;
        const eIso = `${eStr.slice(0, 4)}-${eStr.slice(4, 6)}-${eStr.slice(6, 8)}`;

        const hText = `${h.name || ''} ${h.longName || ''}`.toLowerCase();
        const isExamHoliday = /\b(klausur|klausuren|prüfung|pruefung|prüfungen|pruefungen|arbeit|test|abschlussprüfung|abschlusspruefung|zentrale\s+prüfung|zk|zp|zap)\b/i.test(hText);
        const isAppointHoliday = /\b(tag|konferenz|zeugnis|sprechtag|beratung|anmeldung|information|feier|sportfest|wandertag|lehrkräfte|schilf|fortbildung)\b/i.test(hText);

        if (isExamHoliday) {
          addUniqueExam({
            id: `untis-exam-hol-${h.id || Math.random()}`,
            subject: h.name || 'Prüfung',
            date: sIso,
            startTime: '08:00',
            endTime: '13:00',
            room: 'Laut Schulaushang',
            teacher: 'Prüfungskommission',
            topic: h.longName || h.name || 'Prüfung / Klausurtag',
            type: 'exam',
            completed: false
          });
        }

        const holidayType = isExamHoliday ? 'exam' : (isAppointHoliday ? 'appointment' : 'holiday');
        const key = `${sIso}_${eIso}_${(h.name || '').toLowerCase()}`;
        if (!holidayKeySet.has(key)) {
          holidayKeySet.add(key);
          newHolidays.push({
            id: `untis-holiday-${h.id || Math.random()}`,
            name: h.longName || h.name || 'Schulferien',
            shortName: h.name || '',
            startDate: sIso,
            endDate: eIso,
            startDateNum: h.startDate,
            endDateNum: h.endDate,
            type: holidayType
          });
        }
      });
    }

    // Termine aus WebUntis NewsWidget / Schwarzes Brett hinzufügen
    if (newsRes && newsRes.result) {
      const articles = newsRes.result.articles || newsRes.result.newsOfTheDay || (Array.isArray(newsRes.result) ? newsRes.result : []);
      articles.forEach((art, idx) => {
        const title = art.topic || art.subject || art.name || '';
        const text = art.text || '';
        if (!title && !text) return;
        let dStr = String(art.date || art.publishDate || art.startDate || '');
        if (dStr.length === 8) {
          const dateNum = parseInt(dStr);
          if (dateNum < syRange.startDateNum || dateNum > syRange.endDateNum) return;

          const sIso = `${dStr.slice(0, 4)}-${dStr.slice(4, 6)}-${dStr.slice(6, 8)}`;
          let eStr = String(art.expireDate || art.endDate || dStr);
          let eIso = (eStr.length === 8) ? `${eStr.slice(0, 4)}-${eStr.slice(4, 6)}-${eStr.slice(6, 8)}` : sIso;
          const key = `news_${sIso}_${title.toLowerCase()}`;
          if (!holidayKeySet.has(key)) {
            holidayKeySet.add(key);
            newHolidays.push({
              id: `untis-news-${art.id || idx}`,
              name: title || 'Schultermin',
              shortName: title || '',
              longName: text ? `${title}: ${text}` : title,
              startDate: sIso,
              endDate: eIso,
              startDateNum: dateNum,
              endDateNum: parseInt(eStr.length === 8 ? eStr : dStr),
              type: 'appointment'
            });
          }
        }
      });
    }

    // Standard NRW Termine & Zeugnistage als Fallback/Ergänzung einbinden, damit kein Termin fehlt
    DEFAULT_NRW_HOLIDAYS_2026_2027.forEach(defH => {
      const key = `${defH.startDate}_${defH.endDate}_${(defH.name || '').toLowerCase()}`;
      const nameKey = (defH.name || '').toLowerCase();
      const alreadyExists = newHolidays.some(h => (h.name || '').toLowerCase().includes(nameKey) || nameKey.includes((h.name || '').toLowerCase()));
      if (!alreadyExists && !holidayKeySet.has(key)) {
        holidayKeySet.add(key);
        newHolidays.push(defH);
      }
    });

    appData.holidays = newHolidays;

    // Prüfungen aus Terminen & Feiertagen ergänzen
    newHolidays.forEach(h => {
      if (h.type === 'exam') {
        addUniqueExam({
          id: `untis-exam-hol-${h.id}`,
          subject: h.name || 'Prüfung',
          date: h.startDate,
          startTime: '08:00',
          endTime: '13:00',
          room: 'Laut Schulaushang',
          teacher: 'Prüfungskommission',
          topic: h.longName || h.name || 'Prüfung / Klausurtag',
          type: 'exam',
          completed: false
        });
      }
    });

    // Es werden AUSSCHLIESSLICH echte WebUntis-Prüfungen gespeichert (keine synthetischen Standarddaten!)
    if (newExams.length > 0 || !appData.exams || appData.exams.length === 0) {
      appData.exams = newExams;
    } else {
      newExams.forEach(ne => {
        if (!appData.exams.some(ex => ex.id === ne.id || (ex.date === ne.date && ex.startTime === ne.startTime && ex.subject === ne.subject))) {
          appData.exams.push(ne);
        }
      });
    }

    // 12. Hausaufgaben parsen & zusammenführen
    const preservedCompletedMap = {};
    if (appData.homework && Array.isArray(appData.homework)) {
      appData.homework.forEach(hw => {
        if (hw.completed) preservedCompletedMap[hw.id] = true;
      });
    }

    const newHomework = [];

    function addUniqueHomework(hwItem) {
      if (!hwItem || !hwItem.text) return;

      const sTrim = String(hwItem.subject || '').trim();
      if (subjectsMap[sTrim]) {
        const full = subjectsMap[sTrim];
        hwItem.subject = (full && full.toUpperCase() !== sTrim.toUpperCase()) ? `${full} (${sTrim})` : full;
      }

      // Duplikaterkennung nach ID und nach Inhalt (Text + Fälligkeitsdatum)
      const idMatch = hwItem.id ? newHomework.findIndex(h => String(h.id) === String(hwItem.id)) : -1;
      const contentMatch = newHomework.findIndex(h =>
        h.dueDate === hwItem.dueDate &&
        h.text.toLowerCase().trim() === hwItem.text.toLowerCase().trim()
      );

      const matchIdx = idMatch >= 0 ? idMatch : contentMatch;
      if (matchIdx >= 0) {
        const existing = newHomework[matchIdx];
        const existingIsGeneric = /^(unterricht|hausaufgabe)$/i.test(String(existing.subject || '').trim());
        const newIsGeneric = /^(unterricht|hausaufgabe)$/i.test(String(hwItem.subject || '').trim());
        if (existingIsGeneric && !newIsGeneric) {
          newHomework[matchIdx] = hwItem;
        }
        return;
      }

      newHomework.push(hwItem);
    }

    // A. JSON-RPC Hausaufgaben (getHomeWork2017 / getHomeWorks)
    if (homeworkResponses && Array.isArray(homeworkResponses)) {
      homeworkResponses.forEach(res => {
        if (!res) return;
        const resObj = res.result || res;
        if (!resObj) return;

        // Lessons-Lookup Map aufbauen
        const lessonsMap = {};
        if (resObj.lessonsById && typeof resObj.lessonsById === 'object') {
          Object.keys(resObj.lessonsById).forEach(lId => {
            lessonsMap[lId] = resObj.lessonsById[lId];
          });
        }
        if (resObj.lessons && Array.isArray(resObj.lessons)) {
          resObj.lessons.forEach(l => {
            if (l && l.id !== undefined) lessonsMap[l.id] = l;
          });
        }

        // homeWorks (Großes W!), homeworks, records, data, oder direkt Array
        const rawList = Array.isArray(resObj)
          ? resObj
          : (resObj.homeWorks || resObj.homeworks || resObj.records || resObj.data || []);

        if (!Array.isArray(rawList)) return;

        rawList.forEach((hw, idx) => {
          if (!hw) return;
          // In WebUntis Mobile ist endDate das Fälligkeitsdatum!
          const rawDate = hw.endDate || hw.dueDate || hw.date || hw.lessonDate || hw.startDate;
          let dueStr = '';
          if (rawDate) {
            dueStr = normalizeToIsoDate(rawDate);
          }

          const lInfo = hw.lessonId ? lessonsMap[hw.lessonId] : null;
          let subj = '';
          if (lInfo) {
            const sId = lInfo.subjectId || lInfo.subject;
            if (sId && subjectsMap[sId]) subj = subjectsMap[sId];
            else if (typeof sId === 'string') subj = sId;
            else if (sId && typeof sId === 'object') subj = sId.name || sId.longName || '';
          }
          if (!subj && hw.subject) {
            if (subjectsMap[hw.subject]) subj = subjectsMap[hw.subject];
            else if (typeof hw.subject === 'string') subj = hw.subject;
            else if (typeof hw.subject === 'object') subj = hw.subject.name || hw.subject.longName || '';
          }
          if (!subj && hw.subjectId && subjectsMap[hw.subjectId]) {
            subj = subjectsMap[hw.subjectId];
          }
          if (!subj && hw.lesson && hw.lesson.subject) {
            subj = typeof hw.lesson.subject === 'object' ? (hw.lesson.subject.name || hw.lesson.subject.longName || '') : hw.lesson.subject;
          }
          if (!subj || subj === 'Hausaufgabe') {
            if (lInfo && lInfo.subjectId === 0) subj = 'Klassenorganisation / Allgemein';
            else subj = 'Hausaufgabe';
          }

          let teach = '';
          if (lInfo) {
            const tIds = lInfo.teacherIds || (lInfo.teacherId ? [lInfo.teacherId] : null) || (lInfo.teacher ? [lInfo.teacher] : null);
            if (Array.isArray(tIds) && tIds.length > 0) {
              const firstT = tIds[0];
              if (teachersMap[firstT]) teach = teachersMap[firstT];
              else if (typeof firstT === 'string') teach = firstT;
            }
          }
          if (!teach && hw.teacher) {
            if (teachersMap[hw.teacher]) teach = teachersMap[hw.teacher];
            else if (typeof hw.teacher === 'string') teach = hw.teacher;
            else if (typeof hw.teacher === 'object') teach = hw.teacher.name || hw.teacher.longName || '';
          }
          if (!teach && hw.teacherId && teachersMap[hw.teacherId]) {
            teach = teachersMap[hw.teacherId];
          }
          if (!teach && hw.lesson && hw.lesson.teacher) {
            teach = typeof hw.lesson.teacher === 'object' ? (hw.lesson.teacher.name || hw.lesson.teacher.longName || '') : hw.lesson.teacher;
          }
          if (!teach) teach = 'Fachlehrkraft';

          const textContent = hw.text || hw.remark || hw.description || hw.content || hw.title || hw.note || '';
          if (!textContent) return;

          const hwId = String(hw.id || `hw-${idx}-${dueStr}`);
          const isComp = !!(preservedCompletedMap[hwId] || hw.completed === true);

          addUniqueHomework({
            id: hwId,
            subject: String(subj),
            teacher: String(teach),
            dueDate: dueStr || 'Ohne Frist',
            text: String(textContent).trim(),
            completed: isComp
          });
        });
      });
    }

    // B. REST Hausaufgaben aus allen Endpunkten auswerten
    const allRestHwLists = [
      restHomeworkRes1,
      restHomeworkRes2,
      restHomeworkRes3,
      restAppDataRes && restAppDataRes.data ? restAppDataRes.data.homeworks : null,
      restAppDataRes && restAppDataRes.data ? restAppDataRes.data.homeWorks : null,
      restAppDataRes && restAppDataRes.data ? restAppDataRes.data.tasks : null
    ];

    allRestHwLists.forEach(restRes => {
      if (!restRes) return;
      const rawList = Array.isArray(restRes) ? restRes : (restRes.data || restRes.homeWorks || restRes.homeworks || restRes.records || []);
      if (Array.isArray(rawList)) {
        rawList.forEach((hw, idx) => {
          if (!hw) return;
          const rawDate = hw.endDate || hw.dueDate || hw.date || hw.lessonDate || hw.startDate;
          let dueStr = '';
          if (rawDate) {
            dueStr = normalizeToIsoDate(rawDate);
          }
          let subj = hw.subject || (hw.lesson && hw.lesson.subject) || 'Hausaufgabe';
          let teach = hw.teacher || (hw.lesson && hw.lesson.teacher) || 'Fachlehrkraft';
          const hwId = String(hw.id || `rest-hw-${idx}-${dueStr}`);
          const isComp = !!(preservedCompletedMap[hwId] || hw.completed === true);
          const hwText = hw.text || hw.remark || hw.description || hw.content || hw.title || hw.note || 'Hausaufgabe laut WebUntis';

          addUniqueHomework({
            id: hwId,
            subject: typeof subj === 'object' ? (subj.name || subj.longName || 'Hausaufgabe') : String(subj),
            teacher: typeof teach === 'object' ? (teach.name || teach.longName || 'Fachlehrkraft') : String(teach),
            dueDate: dueStr || 'Ohne Frist',
            text: String(hwText).trim(),
            description: String(hwText).trim(),
            completed: isComp
          });
        });
      }
    });

    // C. Untis Mobile REST calendar-entry/detail Hausaufgaben
    if (restCalDetailResults && Array.isArray(restCalDetailResults)) {
      restCalDetailResults.forEach((r, rIdx) => {
        if (!r || !r.calendarEntries || !Array.isArray(r.calendarEntries)) return;
        r.calendarEntries.forEach((entry, eIdx) => {
          if (!entry) return;
          const sRaw = entry.startDateTime || '';
          const eRaw = entry.endDateTime || '';
          const isoDate = normalizeToIsoDate(sRaw) || normalizeToIsoDate(eRaw);
          let subj = (entry.subject && (entry.subject.displayName || entry.subject.longName || entry.subject.name)) || 'Hausaufgabe';
          let teach = (entry.teachers && entry.teachers[0] && (entry.teachers[0].displayName || entry.teachers[0].longName || entry.teachers[0].name)) || 'Fachlehrkraft';

          if (entry.homeworks && Array.isArray(entry.homeworks)) {
            entry.homeworks.forEach((hw, hIdx) => {
              if (!hw) return;
              const hwText = hw.text || hw.remark || hw.description || hw.title || '';
              if (hwText) {
                const dueRaw = hw.dueDate || hw.endDate || hw.date || isoDate;
                const dueIso = normalizeToIsoDate(dueRaw) || isoDate || 'Ohne Frist';
                const hwId = String(hw.id || `cal-hw-${entry.id || eIdx}-${hIdx}-${dueIso}`);
                const isComp = !!(preservedCompletedMap[hwId] || hw.completed === true);
                addUniqueHomework({
                  id: hwId,
                  subject: String(subj),
                  teacher: String(teach),
                  dueDate: dueIso,
                  text: String(hwText).trim(),
                  completed: isComp
                });
              }
            });
          }
        });
      });
    }

    // D. Hausaufgaben aus dem Stundenplan & Klassenbuch hinzufügen
    timetableHomeworks.forEach(addUniqueHomework);

    // E. Eigene Hausaufgaben hinzufügen
    if (Array.isArray(appData.customHomework)) {
      appData.customHomework.forEach(ch => {
        addUniqueHomework({
          id: ch.id,
          subject: ch.subject,
          teacher: ch.teacher || '',
          dueDate: ch.dueDate || 'Ohne Frist',
          text: ch.text,
          completed: ch.completed !== undefined ? ch.completed : !!preservedCompletedMap[ch.id],
          isCustom: true,
          scope: ch.scope || 'private'
        });
      });
    }

    // Hausaufgaben direkt aus den aktuellen Quellen des Schuljahres übernehmen
    appData.homework = newHomework;

    // 13. Fehlzeiten parsen & aggregieren
    const newAbsences = [];
    const absenceKeySet = new Set();

    function addUniqueAbsence(absItem) {
      if (!absItem) return;
      let sRaw = absItem.startDate || absItem.date || absItem.startDateTime || (absItem.excuse && absItem.excuse.date);
      if (!sRaw) return;
      let sIso = '';
      if (typeof sRaw === 'string' && sRaw.includes('T')) {
        sIso = sRaw.split('T')[0];
      } else {
        const sClean = String(sRaw).replace(/[-T:\s].*$/, '').replace(/-/g, '').trim().slice(0, 8);
        if (sClean.length === 8) {
          sIso = `${sClean.slice(0, 4)}-${sClean.slice(4, 6)}-${sClean.slice(6, 8)}`;
        } else {
          sIso = String(sRaw).slice(0, 10);
        }
      }
      absItem.startDate = sIso;
      if (!absItem.endDate) absItem.endDate = sIso;

      let sTimeStr = '07:45';
      if (absItem.startTime !== undefined) sTimeStr = formatUntisTimeToStr(absItem.startTime);
      else if (absItem.startDateTime && typeof absItem.startDateTime === 'string' && absItem.startDateTime.includes('T')) {
        sTimeStr = absItem.startDateTime.split('T')[1].replace('Z', '').slice(0, 5);
      }

      let eTimeStr = '15:10';
      if (absItem.endTime !== undefined) eTimeStr = formatUntisTimeToStr(absItem.endTime);
      else if (absItem.endDateTime && typeof absItem.endDateTime === 'string' && absItem.endDateTime.includes('T')) {
        eTimeStr = absItem.endDateTime.split('T')[1].replace('Z', '').slice(0, 5);
      }

      absItem.startTime = sTimeStr;
      absItem.endTime = eTimeStr;

      const key = `${sIso}_${sTimeStr}_${(absItem.reason || '').toLowerCase().trim()}`;
      if (!absenceKeySet.has(key)) {
        absenceKeySet.add(key);
        newAbsences.push(absItem);
      }
    }

    // A. Stundenplan-Fehlzeiten einbinden
    if (typeof timetableAbsences !== 'undefined' && Array.isArray(timetableAbsences)) {
      timetableAbsences.forEach(addUniqueAbsence);
    }

    // B. JSON-RPC Fehlzeiten (Mobile getStudentAbsences2017 & Standard)
    if (absenceResponses && Array.isArray(absenceResponses)) {
      absenceResponses.forEach(res => {
        if (!res) return;
        const targetObj = res.result || res.data || res;
        const rawList = Array.isArray(targetObj) ? targetObj : (targetObj.absences || targetObj.studentAbsences || (targetObj.data && targetObj.data.absences) || []);
        if (Array.isArray(rawList)) {
          rawList.forEach((ab, idx) => {
            if (!ab) return;
            // 1. Datum extrahieren (startDateTime, startDate, date, excuse.date)
            let sRaw = ab.startDateTime || ab.startDate || ab.date || (ab.excuse && ab.excuse.date);
            let eRaw = ab.endDateTime || ab.endDate || sRaw;
            if (!sRaw) return;

            let sIso = '';
            if (typeof sRaw === 'string' && sRaw.includes('T')) {
              sIso = sRaw.split('T')[0];
            } else {
              const sClean = String(sRaw).replace(/[-T:\s].*$/, '').replace(/-/g, '').trim().slice(0, 8);
              if (sClean.length === 8) {
                sIso = `${sClean.slice(0, 4)}-${sClean.slice(4, 6)}-${sClean.slice(6, 8)}`;
              } else {
                sIso = String(sRaw).slice(0, 10);
              }
            }

            let eIso = sIso;
            if (eRaw) {
              if (typeof eRaw === 'string' && eRaw.includes('T')) {
                eIso = eRaw.split('T')[0];
              } else {
                const eClean = String(eRaw).replace(/[-T:\s].*$/, '').replace(/-/g, '').trim().slice(0, 8);
                if (eClean.length === 8) {
                  eIso = `${eClean.slice(0, 4)}-${eClean.slice(4, 6)}-${eClean.slice(6, 8)}`;
                }
              }
            }

            // 2. Zeiten extrahieren
            let sTime = '07:45';
            let eTime = '15:10';
            if (ab.startDateTime && typeof ab.startDateTime === 'string' && ab.startDateTime.includes('T')) {
              sTime = ab.startDateTime.split('T')[1].replace('Z', '').slice(0, 5);
            } else if (ab.startTime !== undefined) {
              sTime = formatUntisTimeToStr(ab.startTime);
            }

            if (ab.endDateTime && typeof ab.endDateTime === 'string' && ab.endDateTime.includes('T')) {
              eTime = ab.endDateTime.split('T')[1].replace('Z', '').slice(0, 5);
            } else if (ab.endTime !== undefined) {
              eTime = formatUntisTimeToStr(ab.endTime);
            }

            // 3. Status & Grund (WebUntis liefert oft absenceReason und text getrennt)
            const isExc = !!(
              ab.isExcused ||
              ab.excused ||
              (ab.excuse && (ab.excuse.isExcused || ab.excuse.excuseStatusId === 1 || ab.excuse.status === 'excused')) ||
              (ab.excuseStatus && String(ab.excuseStatus).toLowerCase() === 'excused')
            );

            let reasonParts = [];
            const specificText = (ab.text || (ab.excuse && ab.excuse.text) || '').trim();
            const genericCategory = (ab.absenceReason || ab.reason || '').trim();

            if (genericCategory && !/^abwesend ohne grund$/i.test(genericCategory)) {
              reasonParts.push(genericCategory);
            }
            if (specificText && !reasonParts.includes(specificText)) {
              reasonParts.push(specificText);
            }
            if (!reasonParts.length && genericCategory) {
              reasonParts.push(genericCategory);
            }
            if (!reasonParts.length && ab.reasonId && window.absenceReasonsMap && window.absenceReasonsMap[ab.reasonId]) {
              reasonParts.push(window.absenceReasonsMap[ab.reasonId]);
            }
            if (!reasonParts.length && ab.absenceReasonId && window.absenceReasonsMap && window.absenceReasonsMap[ab.absenceReasonId]) {
              reasonParts.push(window.absenceReasonsMap[ab.absenceReasonId]);
            }

            let reason = reasonParts.filter(Boolean).join(' – ') || (isExc ? 'Entschuldigte Fehlzeit' : 'Unentschuldigte Fehlzeit');

            // Fehlstunden (Dauer / 45 min)
            let hours = ab.hours || ab.absentHours || 1;
            if (sTime && eTime) {
              const sMin = parseMinutesFromTimeStr(sTime);
              const eMin = parseMinutesFromTimeStr(eTime);
              if (eMin > sMin) {
                hours = Math.max(1, Math.round((eMin - sMin) / 45));
              }
            }

            addUniqueAbsence({
              id: String(ab.id || `rpc-abs-${idx}-${sIso}`),
              startDate: sIso,
              endDate: eIso,
              startTime: sTime,
              endTime: eTime,
              reason: reason,
              isExcused: isExc,
              hours: hours
            });
          });
        }
      });
    }

    // C. REST Fehlzeiten-Ergebnisse verarbeiten
    if (restAbsencesRes && Array.isArray(restAbsencesRes)) {
      restAbsencesRes.forEach(rObj => {
        if (!rObj) return;
        if (rObj.data && Array.isArray(rObj.data.absenceReasons)) {
          if (!window.absenceReasonsMap) window.absenceReasonsMap = {};
          rObj.data.absenceReasons.forEach(ar => { if (ar && ar.id) window.absenceReasonsMap[ar.id] = ar.name || ar.longName; });
        }
        const restAbsList = Array.isArray(rObj) ? rObj : (rObj.data?.rows || rObj.data?.absences || rObj.data || rObj.absences || []);
        if (Array.isArray(restAbsList)) {
          restAbsList.forEach((ab, idx) => {
            if (!ab) return;
            let sRaw = ab.startDateTime || ab.startDate || ab.date || ab.createDate || (ab.excuse && ab.excuse.date);
            if (!sRaw) return;
            let sIso = '';
            if (typeof sRaw === 'string' && sRaw.includes('T')) {
              sIso = sRaw.split('T')[0];
            } else {
              const sClean = String(sRaw).replace(/[-T:\s].*$/, '').replace(/-/g, '').trim().slice(0, 8);
              if (sClean.length === 8) {
                sIso = `${sClean.slice(0, 4)}-${sClean.slice(4, 6)}-${sClean.slice(6, 8)}`;
              } else {
                sIso = String(sRaw).slice(0, 10);
              }
            }

            let sTime = '07:45';
            let eTime = '15:10';
            if (ab.startDateTime && typeof ab.startDateTime === 'string' && ab.startDateTime.includes('T')) {
              sTime = ab.startDateTime.split('T')[1].replace('Z', '').slice(0, 5);
            } else if (ab.startTime !== undefined) {
              sTime = formatUntisTimeToStr(ab.startTime);
            } else if (ab.createTime !== undefined) {
              sTime = formatUntisTimeToStr(ab.createTime);
            }

            if (ab.endDateTime && typeof ab.endDateTime === 'string' && ab.endDateTime.includes('T')) {
              eTime = ab.endDateTime.split('T')[1].replace('Z', '').slice(0, 5);
            } else if (ab.endTime !== undefined) {
              eTime = formatUntisTimeToStr(ab.endTime);
            }

            const isExc = !!(
              ab.isExcused ||
              ab.excused ||
              (ab.excuse && (ab.excuse.isExcused || ab.excuse.excuseStatusId === 1)) ||
              (ab.excuseStatus && String(ab.excuseStatus).toLowerCase() === 'excused')
            );

            let reasonParts = [];
            const specificText = (ab.text || '').trim();
            const genericCategory = (ab.absenceReason || ab.reason || ab.eventReasonName || ab.categoryName || '').trim();

            if (genericCategory && !/^abwesend ohne grund$/i.test(genericCategory)) {
              reasonParts.push(genericCategory);
            }
            if (specificText && !reasonParts.includes(specificText)) {
              reasonParts.push(specificText);
            }
            if (!reasonParts.length && genericCategory) {
              reasonParts.push(genericCategory);
            }

            let reason = reasonParts.filter(Boolean).join(' – ') || (isExc ? 'Entschuldigt' : 'Unentschuldigt');

            addUniqueAbsence({
              id: String(ab.id || `rest-abs-${idx}-${sIso}`),
              startDate: sIso,
              endDate: ab.endDate || sIso,
              startTime: sTime,
              endTime: eTime,
              reason: reason,
              isExcused: isExc,
              hours: ab.hours || 1
            });
          });
        }
      });
    }

    // D. Dauerhaft lokal erfasste Schüler-Krankmeldungen hinzufügen
    try {
      const customAbsList = JSON.parse(localStorage.getItem('webuntis_custom_absences') || '[]');
      if (Array.isArray(customAbsList)) {
        customAbsList.forEach(ca => {
          addUniqueAbsence(ca);
        });
      }
    } catch (e) { }

    // Chronologisch absteigend sortieren (neueste zuerst)
    newAbsences.sort((a, b) => {
      const dComp = new Date(b.startDate) - new Date(a.startDate);
      if (dComp !== 0) return dComp;
      return (b.startTime || '').localeCompare(a.startTime || '');
    });
    appData.absences = newAbsences;

    // Im Cache sichern
    try {
      localStorage.setItem('webuntis_cached_absences', JSON.stringify(newAbsences));
    } catch (e) { }

    // 14. Klassenbuch & Lehrstoff sammeln
    const newClassbook = [];
    const classbookKeySet = new Set();

    function addUniqueClassbook(cbItem) {
      if (!cbItem || !cbItem.topic) return;
      const key = `${cbItem.date}_${cbItem.period}_${(cbItem.subject || '').toLowerCase()}`;
      if (!classbookKeySet.has(key)) {
        classbookKeySet.add(key);
        newClassbook.push(cbItem);
      }
    }

    // Bisherige Klassenbucheinträge (z.B. aus dem gesamten Schuljahr) erhalten und einbeziehen
    if (Array.isArray(appData.classbook)) {
      appData.classbook.forEach(cb => addUniqueClassbook(cb));
    }

    allTtSource.forEach((item, idx) => {
      const topicText = (item.lstext || item.lessonText || '').trim();
      if (!topicText) return;
      const dStr = String(item.date);
      if (dStr.length !== 8) return;
      const isoDate = `${dStr.slice(0, 4)}-${dStr.slice(4, 6)}-${dStr.slice(6, 8)}`;
      const subj = (item.su && item.su[0]) ? (subjectsMap[item.su[0].id] || item.su[0].name || 'Unterricht') : 'Unterricht';
      const teach = (item.te && item.te[0]) ? (teachersMap[item.te[0].id] || item.te[0].name || 'Fachlehrkraft') : 'Fachlehrkraft';

      addUniqueClassbook({
        id: `cb-${item.id || idx}-${isoDate}`,
        date: isoDate,
        period: item.startTime ? formatUntisTimeToStr(item.startTime) + ' Uhr' : '1. Std.',
        subject: subj,
        teacher: teach,
        topic: topicText,
        text: topicText
      });
    });

    // Untis Mobile REST calendar-entry/detail Lehrstoff hinzufügen
    if (restCalDetailResults && Array.isArray(restCalDetailResults)) {
      restCalDetailResults.forEach((r, rIdx) => {
        if (!r || !r.calendarEntries || !Array.isArray(r.calendarEntries)) return;
        r.calendarEntries.forEach((entry, eIdx) => {
          if (!entry || !entry.teachingContent) return;
          const sRaw = entry.startDateTime || '';
          const isoDate = normalizeToIsoDate(sRaw);
          if (!isoDate) return;
          const sMatch = String(sRaw).match(/T(\d{2}:\d{2})/);
          const sTimeStr = sMatch ? (sMatch[1] + ' Uhr') : '1. Std.';
          let subj = (entry.subject && (entry.subject.displayName || entry.subject.longName || entry.subject.name)) || 'Unterricht';
          let teach = (entry.teachers && entry.teachers[0] && (entry.teachers[0].displayName || entry.teachers[0].longName || entry.teachers[0].name)) || 'Fachlehrkraft';

          addUniqueClassbook({
            id: `cal-detail-cb-${entry.id || eIdx}-${isoDate}`,
            date: isoDate,
            period: sTimeStr,
            subject: String(subj),
            teacher: String(teach),
            topic: String(entry.teachingContent).trim(),
            text: String(entry.teachingContent).trim()
          });
        });
      });
    }

    // Echte WebUntis-Klassenbucheinträge (classregevents) erfassen (z. B. Klassensprecherwahl, Schulsozialarbeit)
    if (restClassregEvRes && restClassregEvRes.data && Array.isArray(restClassregEvRes.data.rows)) {
      const evList = [];
      restClassregEvRes.data.rows.forEach((row, rIdx) => {
        const rawDate = String(row.createDate || '');
        const isoDate = normalizeToIsoDate(rawDate) || (rawDate.length === 8 ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}` : rawDate);
        const timeStr = row.createTime ? formatUntisTimeToStr(row.createTime) + ' Uhr' : '';
        const teacherName = row.creatorName ? (teachersMap[row.creatorName] || row.creatorName) : 'Lehrkraft';
        const subjCode = row.subjectName || '';
        const subjName = (subjCode && subjectsMap[subjCode]) ? `${subjectsMap[subjCode]} (${subjCode})` : (subjCode || 'Allgemein');
        const klasseName = row.elementName || 'BFW2B';

        evList.push({
          id: `classreg-event-${row.id || rIdx}-${isoDate}`,
          untisId: row.id,
          date: isoDate,
          time: row.createTime ? formatUntisTimeToStr(row.createTime) : '',
          timeStr: timeStr,
          subject: subjName,
          subjectCode: subjCode,
          teacher: teacherName,
          teacherCode: row.creatorName || '',
          klasse: klasseName,
          text: row.text || '',
          category: row.categoryName || row.eventReasonName || 'Klassenbucheintrag'
        });
      });
      if (evList.length > 0) {
        evList.sort((a, b) => new Date(b.date) - new Date(a.date));
        appData.classregEvents = evList;
      }
    }

    newClassbook.sort((a, b) => new Date(b.date) - new Date(a.date));
    appData.classbook = newClassbook;

    // Echte WebUntis-Mitteilungen verarbeiten
    if (restMessagesRes && restMessagesRes.incomingMessages && Array.isArray(restMessagesRes.incomingMessages)) {
      if (!appData.messages) appData.messages = [];
      const delSet = new Set((appData.deletedMessageIds || []).map(String));
      const teachersList = appData.teachers || [];
      
      restMessagesRes.incomingMessages.forEach(m => {
        const sId = String(m.id);
        const id = `webuntis-inbox-${m.id}`;
        // Gelöschte Nachrichten nicht wieder einfügen (exakter ID-Abgleich)
        if (delSet.has(sId) || delSet.has(id)) {
          return;
        }

        let msgDateIso = '';
        const rawDate = m.sentDateTime || m.sentDate || m.date || m.createDate || m.dateTime || m.createDateTime;
        if (rawDate) {
          if (typeof rawDate === 'string' && rawDate.includes('T')) {
            msgDateIso = rawDate;
          } else if (typeof rawDate === 'string' && rawDate.length >= 10) {
            msgDateIso = new Date(rawDate).toISOString();
          } else if (typeof rawDate === 'number') {
            if (rawDate > 1000000000000) msgDateIso = new Date(rawDate).toISOString();
            else if (rawDate > 10000000) {
              const sNum = String(rawDate);
              msgDateIso = `${sNum.slice(0,4)}-${sNum.slice(4,6)}-${sNum.slice(6,8)}T08:00:00Z`;
            }
          }
        }
        const existingIdx = appData.messages.findIndex(x => x.id === id);
        if (!msgDateIso) {
          msgDateIso = (existingIdx >= 0 && appData.messages[existingIdx].date) ? appData.messages[existingIdx].date : new Date().toISOString();
        }

        let senderName = '';
        if (m.sender && typeof m.sender === 'object') {
          senderName = m.sender.displayName || m.sender.name || m.sender.longName || '';
        } else if (typeof m.sender === 'string') {
          senderName = m.sender;
        }
        if (!senderName) senderName = 'Schulleitung / Lehrkraft';
        const matchedT = teachersList.find(t => t.name && senderName && t.name.toUpperCase() === senderName.toUpperCase());
        if (matchedT && matchedT.longName) {
          senderName = `${matchedT.longName} (${matchedT.name})`;
        }

        const msgObj = {
          id: id,
          type: 'inbox',
          sender: senderName,
          subject: m.subject || 'Mitteilung',
          text: m.contentPreview || m.content || m.body || '',
          date: msgDateIso
        };
        if (existingIdx >= 0) {
          appData.messages[existingIdx] = msgObj;
        } else {
          appData.messages.unshift(msgObj);
        }
      });
    }

    // WebUntis Empfänger-Verzeichnis (Lehrkräfte)
    if (restRecipientsRes) {
      const recList = [];
      const addPersons = (arr) => {
        if (Array.isArray(arr)) {
          arr.forEach(p => {
            if (p && (p.id || p.userId)) {
              recList.push({
                id: p.id || p.userId,
                name: p.shortName || p.name || p.displayName || '',
                longName: p.displayName || p.longName || p.name || '',
                foreName: p.foreName || ''
              });
            }
          });
        }
      };
      if (restRecipientsRes.CLASS_TEACHERS) addPersons(restRecipientsRes.CLASS_TEACHERS);
      if (restRecipientsRes.TEACHERS) addPersons(restRecipientsRes.TEACHERS);
      if (restRecipientsRes.OTHERS) addPersons(restRecipientsRes.OTHERS);
      if (recList.length > 0) {
        appData.teachers = recList;
      }
    }

    // Offizielle WebUntis-Noten & Fächer erfassen
    if (restGradingRes && restGradingRes.data && Array.isArray(restGradingRes.data.lessons)) {
      appData.webuntisLessons = restGradingRes.data.lessons;
      appData.webuntisFinalMarks = restGradingRes.data.finalMarkByLessonId || {};
    }
    if (restGradeListRes && restGradeListRes.data && Array.isArray(restGradeListRes.data) && restGradeListRes.data.length > 0) {
      appData.webuntisGradeList = restGradeListRes.data;
      logClient(`performWebUntisSync: ${restGradeListRes.data.length} offizielle Noten aus WebUntis erfasst.`);
    }


    // 15. Hausaufgaben STRENG nach Fälligkeitstag mit Stunden im aktuellen Stundenplan verknüpfen
    if (appData.timetable && appData.timetable.length > 0) {
      appData.timetable.forEach(l => {
        l.homework = '';
        if (appData.homework && appData.homework.length > 0 && l.dateStr) {
          const matchingHw = appData.homework.find(h => {
            if (!h || h.completed) return false;
            if (!h.dueDate || h.dueDate === 'Ohne Frist') return false;
            const hDue = String(h.dueDate).slice(0, 10);
            if (hDue !== l.dateStr) return false;
            if (!h.subject || !l.subject) return false;
            const s1 = h.subject.toLowerCase().trim();
            const s2 = l.subject.toLowerCase().trim();
            return s1.includes(s2) || s2.includes(s1);
          });
          if (matchingHw) {
            l.homework = matchingHw.text;
          }
        }
      });
    }

    lastSyncTimestamp = new Date();
    saveAppData();
    try { renderTimetable(); } catch (e) { logClient('renderTimetable error: ' + (e.stack || e)); }
    try { renderExams(); } catch (e) { logClient('renderExams error: ' + (e.stack || e)); }
    try { renderHomework(); } catch (e) { logClient('renderHomework error: ' + (e.stack || e)); }
    try { renderAbsences(); } catch (e) { logClient('renderAbsences error: ' + (e.stack || e)); }
    try { renderMessagesView(); } catch (e) { logClient('renderMessagesView error: ' + (e.stack || e)); }
    try { renderGradesView(); } catch (e) { logClient('renderGradesView error: ' + (e.stack || e)); }
    try { renderUrgentNotificationBanner(); } catch (e) { logClient('renderUrgentNotificationBanner error: ' + (e.stack || e)); }
    try { triggerDesktopNotification(); } catch (e) { logClient('triggerDesktopNotification error: ' + (e.stack || e)); }
    try { updateSyncDisplay(); } catch (e) { logClient('updateSyncDisplay error: ' + (e.stack || e)); }

    if (appData.config.iservEnabled) {
      syncIServData(false).catch(e => console.warn('IServ Sync Hintergrundfehler:', e));
    }
    announceSR(`Stundenplan aktualisiert. ${appData.timetable.length} Stunden geladen.`, 'polite');
    logClient('performWebUntisSync completed successfully! timetable count: ' + appData.timetable.length);
    return true;
  } catch (err) {
    logClient('Fehler bei WebUntis Synchronisation: ' + (err ? (err.stack || err.message || err) : 'unbekannt'));
    console.error('Fehler bei WebUntis Synchronisation:', err);
    if (syncStatusText) syncStatusText.textContent = 'Sync fehlgeschlagen';
    return false;
  } finally {
    isSyncInProgress = false;
    if (refreshBtn) refreshBtn.classList.remove('loading');
  }
}

function updateSyncDisplay() {
  const syncStatusText = document.getElementById('sync-status-text');
  const timerBadge = document.getElementById('auto-refresh-timer-badge');
  const settingsTime = document.getElementById('settings-sync-time-display');

  if (!lastSyncTimestamp) return;

  const timeStr = lastSyncTimestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (syncStatusText) syncStatusText.textContent = `Live: ${timeStr} Uhr`;
  if (timerBadge) timerBadge.textContent = `Zuletzt aktualisiert: ${timeStr} Uhr (automatische Aktualisierung alle 5 Min)`;
  if (settingsTime) settingsTime.textContent = `Status: Zuletzt erfolgreich aktualisiert um ${timeStr} Uhr`;
}

function triggerManualSync() {
  announceSR('Synchronisiere Stundenplan mit WebUntis...', 'polite');
  performWebUntisSync().then(ok => {
    if (ok) {
      speak('Stundenplan erfolgreich aktualisiert.');
    }
  });
}

function openOfficialWebUntis() {
  const url = `https://${appData.config.server}/WebUntis/?school=${appData.config.schoolShort}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  announceSR('Offizielles WebUntis wird geöffnet.', 'polite');
}

// =============================================================================
// 7. HILFSFUNKTIONEN & FORMATIERUNG
// =============================================================================
function getEffectiveDayIndex(dayChoice) {
  if (dayChoice === 'today') {
    const jsDay = new Date().getDay();
    return (jsDay >= 1 && jsDay <= 5) ? jsDay : 1;
  }
  if (dayChoice === 'tomorrow') {
    const jsDay = new Date().getDay();
    const nextDay = jsDay + 1;
    return (nextDay >= 1 && nextDay <= 5) ? nextDay : 1;
  }
  const num = parseInt(dayChoice);
  if (!isNaN(num) && num >= 1 && num <= 5) {
    return num;
  }
  return 1;
}

function getDayName(dayIndex) {
  const names = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
  return names[dayIndex] || 'Unbekannt';
}

function updateTodayBadge() {
  const now = new Date();
  const options = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' };
  const str = now.toLocaleDateString('de-DE', options);
  const badge = document.getElementById('today-date-text');
  if (badge) badge.textContent = str;
}

function isValidRoomCandidate(candidate) {
  if (!candidate || typeof candidate !== 'string') return false;
  const clean = candidate.trim().toLowerCase();
  if (!clean || clean === 'raum' || clean === 'null' || clean === 'undefined') return false;
  if (clean === 'unterricht' || clean === 'lehrkraft') return false;
  if (clean === 'hanauer' || clean === 'raum hanauer') return false;
  return true;
}

function extractRoomFromObj(r, customRoomsMap) {
  if (!r) return '';
  const rMap = (customRoomsMap && typeof customRoomsMap === 'object')
    ? customRoomsMap
    : ((appData && appData.metadata && appData.metadata.roomsMap) || {});
  if (typeof r === 'string' && isValidRoomCandidate(r)) return r.trim();
  if (typeof r === 'number') {
    if (rMap[r] && isValidRoomCandidate(rMap[r])) return rMap[r];
    return '';
  }
  let candidate = r.name || r.longname || r.longName;
  if (candidate && isValidRoomCandidate(candidate)) return candidate.trim();
  if (r.id && rMap[r.id] && isValidRoomCandidate(rMap[r.id])) return rMap[r.id];
  return '';
}

function formatRoomDisplay(roomStr, teacherStr) {
  if (!roomStr || typeof roomStr !== 'string') return 'Raum wird bekanntgegeben';
  let clean = roomStr.trim();
  const lower = clean.toLowerCase();
  if (!clean || lower === 'raum' || lower === 'null' || lower === 'undefined' || lower === 'unterricht' || lower === 'lehrkraft') {
    return 'Raum wird bekanntgegeben';
  }
  if (lower === 'hanauer' || lower === 'raum hanauer') {
    return 'Raum wird bekanntgegeben';
  }
  if (teacherStr && typeof teacherStr === 'string') {
    const tLower = teacherStr.trim().toLowerCase();
    const cleanNoRaum = lower.replace(/^(?:raum\s*)+/i, '').trim();
    if (tLower && (cleanNoRaum === tLower || tLower.includes(cleanNoRaum) || cleanNoRaum.includes(tLower))) {
      return 'Raum wird bekanntgegeben';
    }
  }
  clean = clean.replace(/^(?:raum\s*)+/i, '').trim();
  if (!clean || clean.toLowerCase() === 'wird bekanntgegeben') {
    return 'Raum wird bekanntgegeben';
  }
  return 'Raum ' + clean;
}

function formatRoomNameOnly(roomStr, teacherStr) {
  if (!roomStr || typeof roomStr !== 'string') return 'wird bekanntgegeben';
  // Strip ALL "Raum"/"Raum " prefixes (however many times repeated)
  let clean = roomStr.trim().replace(/^(?:raum\s*)+/i, '').trim();
  if (!clean || clean.toLowerCase() === 'wird bekanntgegeben'
      || clean.toLowerCase() === 'hanauer'
      || clean.toLowerCase() === 'null'
      || clean.toLowerCase() === 'undefined') {
    return 'wird bekanntgegeben';
  }
  // Also check against teacher to avoid using teacher name as room
  if (teacherStr && typeof teacherStr === 'string') {
    const tClean = teacherStr.trim().replace(/^(?:lehrer(?:in)?|lehrkraft)\s*/i, '').trim().toLowerCase();
    if (tClean && clean.toLowerCase() === tClean) return 'wird bekanntgegeben';
  }
  return clean;
}

function cleanTeacherName(teacherStr) {
  if (!teacherStr || typeof teacherStr !== 'string') return 'Lehrkraft';
  // Strip ALL "Lehrer"/"Lehrkraft"/"Lehrerin" prefixes (however many times repeated)
  let clean = teacherStr.trim().replace(/^(?:lehrkraft|lehrer(?:in)?)\s*/i, '').trim();
  const lower = clean.toLowerCase();
  if (!clean || lower === 'lehrkraft' || lower === 'lehrer' || lower === 'null' || lower === 'undefined') {
    return 'Lehrkraft';
  }
  return clean;
}

// =============================================================================
// 7b. UNTIS STUNDENPLAN PARSING & METADATEN-MAPPING
// =============================================================================

// =============================================================================
// SCHULFACH-EXPANSION & DYNAMISCHE VOLLNAMEN
// =============================================================================
const COMMON_FALLBACK_SUBJECTS = {
  'D': 'Deutsch / Kommunikation',
  'DE': 'Deutsch / Kommunikation',
  'M': 'Mathematik',
  'MA': 'Mathematik',
  'MAT': 'Mathematik',
  'E': 'Englisch',
  'ENG': 'Englisch',
  'PK': 'Politik / Gesellschaftslehre',
  'POL': 'Politik / Gesellschaftslehre',
  'WBL': 'Wirtschafts- und Betriebslehre',
  'BWL': 'Betriebswirtschaftslehre',
  'VWL': 'Volkswirtschaftslehre',
  'SP': 'Sport / Gesundheitsförderung',
  'SPO': 'Sport / Gesundheitsförderung',
  'REL': 'Religionslehre',
  'KR': 'Katholische Religionslehre',
  'ER': 'Evangelische Religionslehre',
  'PL': 'Praktische Philosophie',
  'PH': 'Physik',
  'CH': 'Chemie',
  'BIO': 'Biologie',
  'IF': 'Informatik',
  'INF': 'Informatik',
  'FB GWP': 'Fachpraxis Gesamtwirtschaft',
  'FBM-IT': 'Fachpraxis Informationstechnik',
  'GW': 'Gesamtwirtschaft'
};

function getSubjectFullDisplay(codeOrName, subjectId = null) {
  if (!codeOrName) return 'Unterricht';
  const meta = appData.metadata || {};
  const subjectsMap = meta.subjectsMap || {};

  // 1. Wenn subjectId in subjectsMap vorhanden
  if (subjectId && subjectsMap[subjectId]) {
    const fn = subjectsMap[subjectId];
    if (codeOrName && fn && fn.toLowerCase() !== String(codeOrName).toLowerCase() && !fn.includes('(')) {
      return `${fn} (${codeOrName})`;
    }
    return fn;
  }

  const raw = String(codeOrName).trim();
  if (!raw) return 'Unterricht';

  // Wenn bereits in Klammern formatiert (z.B. "Mathematik (M)"), direkt nutzen
  if (/\([A-Za-z0-9\s\-_/]+\)$/.test(raw)) {
    return raw;
  }

  // 2. Direkt in WebUntis-subjectsMap suchen
  if (subjectsMap[raw]) {
    const fn = subjectsMap[raw];
    if (fn.toLowerCase() !== raw.toLowerCase() && !fn.includes('(')) {
      return `${fn} (${raw})`;
    }
    return fn;
  }

  // 3. Case-Insensitive in subjectsMap suchen
  for (const k in subjectsMap) {
    if (k.toUpperCase() === raw.toUpperCase()) {
      const fn = subjectsMap[k];
      if (fn.toLowerCase() !== raw.toLowerCase() && !fn.includes('(')) {
        return `${fn} (${raw})`;
      }
      return fn;
    }
  }

  // 4. In webuntisLessons suchen
  if (Array.isArray(appData.webuntisLessons)) {
    for (const wl of appData.webuntisLessons) {
      const sObj = wl.subject || {};
      const sName = (sObj.name || sObj.longName || wl.subjectName || '').trim();
      if (sName && (sName.toUpperCase() === raw.toUpperCase() || (sObj.name && sObj.name.toUpperCase() === raw.toUpperCase()))) {
        const longN = sObj.longName || wl.subjectName;
        const shortN = sObj.name || raw;
        if (longN && longN.toLowerCase() !== shortN.toLowerCase() && !longN.includes('(')) {
          return `${longN} (${shortN})`;
        }
        if (longN) return longN;
      }
    }
  }

  // 5. In webuntisGradeList suchen
  if (Array.isArray(appData.webuntisGradeList)) {
    for (const g of appData.webuntisGradeList) {
      if (g.subjectCode && g.subjectCode.toUpperCase() === raw.toUpperCase() && g.subjectName) {
        if (!g.subjectName.includes('(')) {
          return `${g.subjectName} (${g.subjectCode})`;
        }
        return g.subjectName;
      }
    }
  }

  // 6. In Timetable nach vollständigen Namen suchen
  if (Array.isArray(appData.timetable)) {
    for (const l of appData.timetable) {
      if (l.subjectCode && l.subjectCode.toUpperCase() === raw.toUpperCase() && l.subject && l.subject !== l.subjectCode) {
        if (!l.subject.includes('(')) {
          return `${l.subject} (${l.subjectCode})`;
        }
        return l.subject;
      }
    }
  }

  // 7. Fallback über Standard-Fächerkürzel
  const upper = raw.toUpperCase();
  if (COMMON_FALLBACK_SUBJECTS[upper]) {
    return `${COMMON_FALLBACK_SUBJECTS[upper]} (${raw})`;
  }

  return raw;
}

function parseUntisTimetableItems(items) {
  if (!items || !Array.isArray(items)) return [];
  const meta = appData.metadata || {};
  const subjectsMap = meta.subjectsMap || {};
  const teachersMap = meta.teachersMap || {};
  const klassenMap = meta.klassenMap || {};
  const roomsMap = meta.roomsMap || {};

  const result = [];
  items.forEach((item, idx) => {
    const dStr = String(item.date);
    const itemDate = new Date(parseInt(dStr.slice(0, 4)), parseInt(dStr.slice(4, 6)) - 1, parseInt(dStr.slice(6, 8)));
    const dayOfWeek = itemDate.getDay();
    if (dayOfWeek < 1 || dayOfWeek > 5) return;

    const startStr = formatUntisTimeToStr(item.startTime);
    const endStr = formatUntisTimeToStr(item.endTime);

    let periodNum = 1;
    const matchedPeriod = (appData.periods || DEFAULT_PERIODS).find(p => p.start === startStr);
    if (matchedPeriod) {
      periodNum = matchedPeriod.period;
    } else if (startStr === '11:15') {
      periodNum = 5; // Freitag 5. Stunde
    } else if (startStr === '13:20') {
      periodNum = 7;
    } else if (startStr === '14:10') {
      periodNum = 8; // Sport 8. Stunde
    } else if (startStr === '14:55') {
      periodNum = 9; // Sport 9. Stunde
    } else {
      const parts = startStr.split(':').map(Number);
      const totalMin = (parts[0] || 0) * 60 + (parts[1] || 0);
      if (totalMin < 510) periodNum = 1;
      else if (totalMin < 560) periodNum = 2;
      else if (totalMin < 615) periodNum = 3;
      else if (totalMin < 670) periodNum = 4;
      else if (totalMin < 730) periodNum = 5;
      else if (totalMin < 790) periodNum = 6;
      else if (totalMin < 845) periodNum = 7;
      else if (totalMin < 890) periodNum = 8;
      else if (totalMin < 940) periodNum = 9;
      else periodNum = 10;
    }

    const suObj = (item.su && item.su[0]) ? item.su[0] : null;
    const suCode = suObj ? (suObj.name || suObj.longname || '') : '';
    const suLong = suObj ? (suObj.longname || '') : '';
    const suId = suObj ? suObj.id : null;
    const subj = getSubjectFullDisplay(suCode || suLong || 'Unterricht', suId);
    let teach = 'Lehrkraft';
    if (item.te && Array.isArray(item.te) && item.te.length > 0) {
      const tNames = item.te.map(t => teachersMap[t.id] || t.name || t.longname || '').filter(Boolean);
      if (tNames.length > 0) teach = tNames.join(', ');
    }
    let klasse = '';
    if (item.kl && Array.isArray(item.kl) && item.kl.length > 0) {
      const cfgKl = (appData.config.klasse || '').trim().toUpperCase();
      let myKlasse = null;
      if (cfgKl) {
        myKlasse = item.kl.find(k => (k.name && k.name.toUpperCase() === cfgKl) || (k.name && k.name.toUpperCase().includes(cfgKl)));
      }
      if (!myKlasse && item.kl.length === 1) {
        myKlasse = item.kl[0];
      }
      if (myKlasse) {
        klasse = myKlasse.name || klassenMap[myKlasse.id] || (myKlasse.id ? `Klasse ${myKlasse.id}` : '');
        if (item.kl.length > 1) klasse += ' (Kurs)';
      } else {
        klasse = item.kl.map(k => k.name || klassenMap[k.id] || k.longname || '').filter(Boolean).join(', ');
      }
    }

    let rm = '';
    if (item.ro && Array.isArray(item.ro) && item.ro.length > 0) {
      const roomParts = item.ro.map(extractRoomFromObj).filter(Boolean);
      if (roomParts.length > 0) rm = roomParts.join(', ');
    }
    if (!rm && item.orgro && Array.isArray(item.orgro) && item.orgro.length > 0) {
      const orgParts = item.orgro.map(extractRoomFromObj).filter(Boolean);
      if (orgParts.length > 0) rm = orgParts.join(', ');
    }
    if (!rm && item.room) {
      rm = extractRoomFromObj(item.room);
    }
    if (!rm) {
      const combinedText = [item.substText, item.lstext, item.info, item.bkText].filter(Boolean).join(' ');
      const matchRoom = combinedText.match(/\b(?:in\s+Raum|nach\s+Raum|Raum|Rm\.)\s+([A-Z0-9][A-Z0-9\.\-_/]*)/i);
      if (matchRoom && isValidRoomCandidate(matchRoom[1])) {
        rm = matchRoom[1];
      }
    }

    if (!isValidRoomCandidate(rm)) {
      rm = 'Raum wird bekanntgegeben';
    } else {
      let cleanRm = rm.trim();
      if (!/^raum\b/i.test(cleanRm)) {
        cleanRm = 'Raum ' + cleanRm;
      }
      rm = cleanRm;
    }

    let st = 'normal';
    if (item.code === 'cancelled') st = 'cancelled';
    else if (item.code === 'irregular') st = 'substitute';

    const dateIso = `${dStr.slice(0, 4)}-${dStr.slice(4, 6)}-${dStr.slice(6, 8)}`;
    const lessonTopic = (item.lstext || item.lessonText || '').trim();

    result.push({
      id: `untis-${item.id || idx}-${dStr}`,
      untisId: item.id,
      day: dayOfWeek,
      dateStr: dateIso,
      dateNum: parseInt(dStr),
      period: periodNum,
      startTime: startStr,
      endTime: endStr,
      subject: subj,
      teacher: teach,
      klasse: klasse,
      room: rm,
      status: st,
      notes: item.substText || item.info || '',
      lstext: lessonTopic,
      homework: item.homework || ''
    });
  });

  return result;
}

// =============================================================================
// 7c. WOCHEN-NAVIGATION & KALENDERWOCHEN
// =============================================================================
function getBaseMonday() {
  const now = new Date();
  const curDay = now.getDay();
  let diffToMonday = 1 - curDay;
  if (curDay === 0) diffToMonday = 1; // Sonntag -> Folgewoche
  else if (curDay === 6) diffToMonday = 2; // Samstag -> Folgewoche
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() + diffToMonday);
  return monday;
}

function getMondayForWeekOffset(offset = selectedWeekOffset) {
  const m = getBaseMonday();
  m.setDate(m.getDate() + (offset * 7));
  return m;
}

function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function updateWeekAndDayLabels() {
  const monday = getMondayForWeekOffset(selectedWeekOffset);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const kw = getISOWeekNumber(monday);
  const mDay = String(monday.getDate()).padStart(2, '0');
  const mMon = String(monday.getMonth() + 1).padStart(2, '0');
  const fDay = String(friday.getDate()).padStart(2, '0');
  const fMon = String(friday.getMonth() + 1).padStart(2, '0');
  const fYear = friday.getFullYear();

  let badgeText = `KW ${kw} • ${mDay}.${mMon}. – ${fDay}.${fMon}.${fYear}`;
  if (selectedWeekOffset === 0) {
    badgeText += ' (Aktuelle Woche)';
  } else if (selectedWeekOffset === -1) {
    badgeText += ' (Letzte Woche)';
  } else if (selectedWeekOffset === 1) {
    badgeText += ' (Nächste Woche)';
  } else if (selectedWeekOffset < -1) {
    badgeText += ` (${Math.abs(selectedWeekOffset)} Wochen zurück)`;
  } else {
    badgeText += ` (${selectedWeekOffset} Wochen voraus)`;
  }

  const badgeEl = document.getElementById('week-display-badge');
  if (badgeEl) badgeEl.textContent = badgeText;

  // Wochentags-Buttons beschriften
  const dayNames = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
  for (let i = 1; i <= 5; i++) {
    const curD = new Date(monday);
    curD.setDate(monday.getDate() + (i - 1));
    const cDay = String(curD.getDate()).padStart(2, '0');
    const cMon = String(curD.getMonth() + 1).padStart(2, '0');
    const lbl = document.getElementById(`day-label-${i}`);
    if (lbl) lbl.textContent = `${dayNames[i]} (${cDay}.${cMon}.)`;
  }
}

async function changeWeekOffset(delta) {
  selectedWeekOffset += delta;
  updateWeekAndDayLabels();
  const monday = getMondayForWeekOffset(selectedWeekOffset);
  const kw = getISOWeekNumber(monday);
  announceSR(`Woche gewechselt auf Kalenderwoche ${kw}. Lade Stundenplan...`, 'polite');
  await loadTimetableForSelectedWeek();
}

async function resetWeekOffset() {
  if (selectedWeekOffset === 0) {
    announceSR('Bereits in der aktuellen Schulwoche.', 'polite');
    return;
  }
  selectedWeekOffset = 0;
  updateWeekAndDayLabels();
  announceSR('Zur aktuellen Schulwoche zurückgekehrt. Lade Stundenplan...', 'polite');
  await loadTimetableForSelectedWeek();
}

async function loadTimetableForSelectedWeek() {
  const monday = getMondayForWeekOffset(selectedWeekOffset);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const startNum = formatDateToUntis(monday);
  const endNum = formatDateToUntis(friday);

  // 1. Wenn bereits im Cache vorhanden, sofort anzeigen
  if (appData.timetableCache && appData.timetableCache[startNum] && appData.timetableCache[startNum].length > 0) {
    appData.timetable = appData.timetableCache[startNum];
    renderTimetable();
    return;
  }

  // 2. Ansonsten über WebUntis nachladen
  await fetchWeekTimetable(startNum, endNum);
}

async function fetchWeekTimetable(startNum, endNum) {
  const container = document.getElementById('timetable-container');
  if (container) {
    container.innerHTML = `
      <div class="status-box" style="padding: 28px; text-align: center;">
        <span class="emoji-icon" style="font-size: 36px;" aria-hidden="true">⏳</span>
        <p style="font-size: var(--font-size-lg); font-weight: bold; margin-top: 10px;">Lade Stundenplan für die gewählte Schulwoche...</p>
        <p class="field-hint">WebUntis wird abgefragt.</p>
      </div>
    `;
  }

  try {
    const pId = (appData.config && appData.config.personId) || 4707;
    const pType = (appData.config && appData.config.personType) || 5;

    const ttRes = await callWebUntisApi('getTimetable', {
      options: {
        element: { id: pId, type: pType },
        startDate: startNum,
        endDate: endNum,
        showLsText: true,
        showStudentgroup: true,
        showInfo: true,
        showSubstText: true,
        showLsNumber: true,
        showBooking: true,
        klasseFields: ['id', 'name', 'longname'],
        roomFields: ['id', 'name', 'longname'],
        subjectFields: ['id', 'name', 'longname'],
        teacherFields: ['id', 'name', 'longname']
      }
    });

    if (ttRes && ttRes.result && Array.isArray(ttRes.result)) {
      const parsedLessons = parseUntisTimetableItems(ttRes.result);
      if (!appData.timetableCache) appData.timetableCache = {};
      appData.timetableCache[startNum] = parsedLessons;
      appData.timetable = parsedLessons;
      saveAppData();
      renderTimetable();
      const kw = getISOWeekNumber(getMondayForWeekOffset(selectedWeekOffset));
      announceSR(`Stundenplan für Kalenderwoche ${kw} mit ${parsedLessons.length} Unterrichtsstunden geladen.`, 'polite');
      return;
    }
  } catch (e) {
    console.warn('Fehler beim Abruf des Wochenstundenplans:', e);
  }

  if (!appData.timetableCache) appData.timetableCache = {};
  appData.timetable = appData.timetableCache[startNum] || [];
  renderTimetable();
}

// =============================================================================
// 8. REITER 2: STUNDENPLAN & VERTRETUNGSPLAN
// =============================================================================
function setDayFilter(dayChoice) {
  if ((dayChoice === 'today' || dayChoice === 'tomorrow') && selectedWeekOffset !== 0) {
    selectedWeekOffset = 0;
    updateWeekAndDayLabels();
    loadTimetableForSelectedWeek();
  }
  selectedDay = dayChoice;
  document.querySelectorAll('.day-btn').forEach(btn => {
    const isTarget = btn.getAttribute('data-day') === String(dayChoice);
    btn.classList.toggle('active', isTarget);
    btn.setAttribute('aria-pressed', isTarget ? 'true' : 'false');
  });
  renderTimetable();
  announceSR(`Ansicht gewechselt auf: ${dayChoice === 'all' ? 'Ganze Schulwoche' : getDayName(getEffectiveDayIndex(dayChoice))}`, 'polite');
}

function renderTimetable() {
  updateCurrentAndNextLesson();

  const container = document.getElementById('timetable-container');
  if (!container) return;

  const dayIndex = getEffectiveDayIndex(selectedDay);
  const isWeekView = selectedDay === 'all';

  let lessons = [];
  if (isWeekView) {
    lessons = [...appData.timetable].sort((a, b) => a.day - b.day || a.period - b.period);
  } else {
    lessons = appData.timetable.filter(l => l.day === dayIndex).sort((a, b) => a.period - b.period);
  }

  // Deduplizieren von Stunden (gleicher Tag, Periode, Zeit und Fach)
  const uniqueLessons = [];
  const seenKeys = new Set();
  lessons.forEach(l => {
    const key = `${l.day}_${l.period}_${l.startTime || ''}_${(l.subject || '').trim()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueLessons.push(l);
    }
  });
  lessons = uniqueLessons;

  const titleEl = document.getElementById('timetable-view-title');
  if (titleEl) {
    const monday = getMondayForWeekOffset(selectedWeekOffset);
    const kw = getISOWeekNumber(monday);
    if (isWeekView) {
      titleEl.textContent = `Stundenplan für KW ${kw} (Ganze Schulwoche Montag bis Freitag)`;
    } else {
      titleEl.textContent = `Stundenplan für ${getDayName(dayIndex)} (KW ${kw})`;
    }
  }

  if (lessons.length === 0) {
    container.innerHTML = `
      <div class="status-box" style="padding: 28px; text-align: center;">
        <span class="emoji-icon" style="font-size: 36px;" aria-hidden="true">🎉</span>
        <h3 style="font-size: var(--font-size-lg); font-weight: bold; margin-top: 10px;">Kein Unterricht eingetragen!</h3>
        <p class="field-hint">Für diesen Tag liegen in WebUntis aktuell keine Stunden vor.</p>
      </div>
    `;
    return;
  }

  let html = '<div class="timetable-list" role="list">';
  let lastRenderedDay = null;
  lessons.forEach(l => {
    if (isWeekView && l.day !== lastRenderedDay) {
      lastRenderedDay = l.day;
      html += `<h3 class="timetable-day-header"><span class="emoji-icon" aria-hidden="true">📅 </span>${getDayName(l.day)}</h3>`;
    }
    const headingTag = isWeekView ? 'h4' : 'h3';

    const matchedPeriod = (appData.periods || []).find(p => p.period === l.period);
    const periodData = {
      start: (matchedPeriod && matchedPeriod.start) || l.startTime || '--:--',
      end: (matchedPeriod && matchedPeriod.end) || l.endTime || '--:--'
    };
    let statusClass = 'status-normal';
    let badgeText = 'Regulär';
    let badgeClass = 'badge-normal';
    let srStatus = 'Regulärer Unterricht';

    if (l.status === 'cancelled') {
      statusClass = 'status-cancelled';
      badgeText = 'Entfall';
      badgeClass = 'badge-cancelled';
      srStatus = 'Achtung: Stunde entfällt!';
    } else if (l.status === 'substitute') {
      statusClass = 'status-substitute';
      badgeText = 'Vertretung';
      badgeClass = 'badge-substitute';
      srStatus = 'Hinweis: Vertretungsunterricht.';
    } else if (l.status === 'roomchange') {
      statusClass = 'status-roomchange';
      badgeText = 'Raumwechsel';
      badgeClass = 'badge-roomchange';
      srStatus = 'Hinweis: Geänderter Raum.';
    }

    const dayPrefix = isWeekView ? `<strong>${getDayName(l.day)}:</strong> ` : '';
    const cleanRoom = formatRoomNameOnly(l.room, l.teacher);
    const cleanTeacher = cleanTeacherName(l.teacher);
    const displaySubject = getSubjectFullDisplay(l.subject || l.subjectCode, l.subjectId);
    html += `
      <article class="lesson-card interactive-lesson ${statusClass}" role="listitem" tabindex="0" onclick="openLessonDetails('${l.id}')" onkeydown="handleLessonKeydown(event, '${l.id}')" title="Klicken oder Enter drücken für Lehrstoff, Hausaufgaben &amp; Details" aria-label="${dayPrefix}${l.period}. Stunde: ${displaySubject}, Zeit: ${periodData.start} bis ${periodData.end} Uhr, Raum ${cleanRoom}, Lehrer ${cleanTeacher}${l.klasse ? ', Klasse ' + l.klasse : ''}. Status: ${srStatus}. Klicken für Details, Lehrstoff und Hausaufgaben.">
        <div class="lesson-time-box" aria-hidden="true">
          <div class="lesson-period">${l.period}. Std.</div>
          <div class="lesson-clock">${periodData.start} - ${periodData.end}</div>
          ${isWeekView ? `<div style="font-size: 13px; font-weight: bold; color: var(--accent-info); margin-top: 2px;">${getDayName(l.day)}</div>` : ''}
        </div>
        <div class="lesson-main">
          <${headingTag} class="lesson-subject-title"><span class="sr-only">${isWeekView ? getDayName(l.day) + ', ' : ''}${l.period}. Stunde: </span>${escHtml(displaySubject)}</${headingTag}>
          <div style="margin-top: 6px; font-size: var(--font-size-base); color: var(--text-secondary);">
            <div style="display: block; line-height: 1.8;"><span class="emoji-icon" aria-hidden="true">🚪 </span><strong>Raum:</strong> ${cleanRoom}</div>
            <div style="display: block; line-height: 1.8;"><span class="emoji-icon" aria-hidden="true">👨‍🏫 </span><strong>Lehrer:</strong> ${cleanTeacher}</div>
            ${l.klasse ? `<div style="display: block; line-height: 1.8;"><span class="emoji-icon" aria-hidden="true">🏫 </span><strong>Klasse:</strong> ${escHtml(l.klasse)}</div>` : ''}
          </div>
          ${(() => {
            let activeLessonHw = '';
            if (appData.homework && Array.isArray(appData.homework) && l.dateStr) {
              const mHw = appData.homework.find(h => {
                if (!h || h.completed) return false;
                if (!h.dueDate || h.dueDate === 'Ohne Frist') return false;
                const hDue = String(h.dueDate).slice(0, 10);
                if (hDue !== l.dateStr) return false;
                const s1 = (h.subject || '').toLowerCase().trim();
                const s2 = (l.subject || '').toLowerCase().trim();
                return s1 && s2 && (s1.includes(s2) || s2.includes(s1));
              });
              if (mHw) activeLessonHw = mHw.text;
            }
            return activeLessonHw ? `<div style="display: block; font-size: 13px; color: var(--accent-warn); font-weight: bold; margin-top: 4px;"><span class="emoji-icon" aria-hidden="true">📝 </span><strong>Hausaufgabe:</strong> ${escapeHTML(activeLessonHw)}</div>` : '';
          })()}
          ${l.notes && l.notes !== l.lstext ? `<div style="display: block; font-size: 13px; font-weight: bold; color: var(--accent-warn); margin-top: 4px;"><span class="emoji-icon" aria-hidden="true">ℹ️ </span>${escapeHTML(l.notes)}</div>` : ''}
        </div>
        <div class="lesson-badge-wrap">
          <div style="display: block;"><span class="status-badge ${badgeClass}">${badgeText}</span></div>
          <div style="display: block; font-size: 12px; color: var(--text-muted); font-weight: bold; margin-top: 6px; text-align: right;">Details ↗</div>
        </div>
      </article>
    `;
  });
  html += '</div>';

  container.innerHTML = html;

  // Im Hintergrund Lehrstoff für nicht angereicherte Stunden dieser Ansicht nachladen
  if (typeof enrichLessonsWithTopics === 'function') {
    enrichLessonsWithTopics(lessons);
  }
}

function updateCurrentAndNextLesson() {
  const boxNow = document.getElementById('box-now-lesson');
  const boxNext = document.getElementById('box-next-lesson');
  if (!boxNow || !boxNext) return;

  const now = new Date();
  const currentJsDay = now.getDay();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const currentWeekMo = getBaseMonday();
  const currentWeekMoKey = formatDateToUntis(currentWeekMo);
  const currentWeekLessons = (appData.timetableCache && appData.timetableCache[currentWeekMoKey] && appData.timetableCache[currentWeekMoKey].length > 0)
    ? appData.timetableCache[currentWeekMoKey]
    : appData.timetable;

  if (currentJsDay < 1 || currentJsDay > 5) {
    boxNow.innerHTML = `
      <div class="status-label">Aktuell (Wochenende)</div>
      <h4 class="status-content-title">Schönes Wochenende!</h4>
      <div class="status-meta">Am Montag geht die Schule wieder um 07:45 Uhr los.</div>
    `;
    const mondayFirst = currentWeekLessons.find(t => t.day === 1 && t.period === 1);
    const monRoom = mondayFirst ? formatRoomNameOnly(mondayFirst.room, mondayFirst.teacher) : '';
    const monTeach = mondayFirst ? cleanTeacherName(mondayFirst.teacher) : '';
    boxNext.innerHTML = `
      <div class="status-label">Nächste Stunde (Montag 1. Std.)</div>
      <h4 class="status-content-title">${mondayFirst ? mondayFirst.subject : 'Unterrichtsbeginn'}</h4>
      <div class="status-meta" style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
        ${mondayFirst ? `<div><span class="emoji-icon" aria-hidden="true">🚪 </span><strong>Raum:</strong> ${monRoom}</div><div><span class="emoji-icon" aria-hidden="true">👨‍🏫 </span><strong>Lehrer:</strong> ${monTeach}</div>` : '<div>07:45 Uhr</div>'}
      </div>
    `;
    return;
  }

  const todayLessons = currentWeekLessons.filter(l => l.day === currentJsDay).sort((a, b) => a.period - b.period);
  let currentLesson = null;
  let nextLesson = null;

  for (let i = 0; i < todayLessons.length; i++) {
    const l = todayLessons[i];
    const p = (appData.periods || []).find(per => per.period === l.period) || { period: l.period, start: l.startTime || '', end: l.endTime || '' };
    if (!p.start || !p.end) continue;

    if (currentTime >= p.start && currentTime <= p.end) {
      currentLesson = { ...l, periodData: p };
      const nextL = todayLessons[i + 1];
      nextLesson = nextL ? { ...nextL, periodData: (appData.periods || []).find(per => per.period === nextL.period) || { period: nextL.period, start: nextL.startTime || '', end: nextL.endTime || '' } } : null;
      break;
    } else if (currentTime < p.start && !nextLesson) {
      nextLesson = { ...l, periodData: p };
      break;
    }
  }

  if (currentLesson) {
    const curRoom = formatRoomNameOnly(currentLesson.room, currentLesson.teacher);
    const curTeach = cleanTeacherName(currentLesson.teacher);
    boxNow.classList.add('active-now');
    boxNow.innerHTML = `
      <div class="status-label"><span class="emoji-icon" aria-hidden="true">🔴 </span>Aktuell läuft (${currentLesson.periodData.start} - ${currentLesson.periodData.end})</div>
      <h4 class="status-content-title">${currentLesson.subject}</h4>
      <div class="status-meta" style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
        <div><span class="emoji-icon" aria-hidden="true">🚪 </span><strong>Raum:</strong> ${curRoom}</div>
        <div><span class="emoji-icon" aria-hidden="true">👨‍🏫 </span><strong>Lehrer:</strong> ${curTeach}</div>
        ${currentLesson.klasse ? `<div><span class="emoji-icon" aria-hidden="true">🏫 </span><strong>Klasse:</strong> ${escHtml(currentLesson.klasse)}</div>` : ''}
        ${currentLesson.status === 'cancelled' ? '<div style="color: var(--accent-danger); font-weight: bold;"><span class="emoji-icon" aria-hidden="true">⚠️ </span>[ENTFALL] Diese Stunde entfällt!</div>' : ''}
      </div>
    `;
  } else {
    boxNow.classList.remove('active-now');
    boxNow.innerHTML = `
      <div class="status-label">Aktuell</div>
      <h4 class="status-content-title">Kein laufender Unterricht</h4>
      <div class="status-meta">Aktuell ist Pause oder unterrichtsfreie Zeit.</div>
    `;
  }

  if (nextLesson) {
    const nxtRoom = formatRoomNameOnly(nextLesson.room, nextLesson.teacher);
    const nxtTeach = cleanTeacherName(nextLesson.teacher);
    boxNext.innerHTML = `
      <div class="status-label"><span class="emoji-icon" aria-hidden="true">🔜 </span>Nächste Stunde (${nextLesson.period}. Std. ab ${nextLesson.periodData.start} Uhr)</div>
      <h4 class="status-content-title">${nextLesson.subject}</h4>
      <div class="status-meta" style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
        <div><span class="emoji-icon" aria-hidden="true">🚪 </span><strong>Raum:</strong> ${nxtRoom}</div>
        <div><span class="emoji-icon" aria-hidden="true">👨‍🏫 </span><strong>Lehrer:</strong> ${nxtTeach}</div>
        ${nextLesson.klasse ? `<div><span class="emoji-icon" aria-hidden="true">🏫 </span><strong>Klasse:</strong> ${escHtml(nextLesson.klasse)}</div>` : ''}
      </div>
    `;
  } else {
    boxNext.innerHTML = `
      <div class="status-label">Schultag beendet</div>
      <h4 class="status-content-title">Schulschluss!</h4>
      <div class="status-meta">Für heute sind alle Stunden absolviert.</div>
    `;
  }
}

function readTodayTimetable() {
  const dayIndex = getEffectiveDayIndex(selectedDay);
  const dayName = getDayName(dayIndex);
  const lessons = appData.timetable.filter(l => l.day === dayIndex).sort((a, b) => a.period - b.period);

  if (lessons.length === 0) {
    speak(`Für ${dayName} ist kein Unterricht eingetragen.`);
    return;
  }

  let text = `Stundenplan für ${dayName}. Du hast ${lessons.length} Stunden. `;
  lessons.forEach(l => {
    const p = (appData.periods || []).find(per => per.period === l.period) || { start: l.startTime || '', end: l.endTime || '' };
    const timeStr = (p.start && p.end) ? `von ${p.start} bis ${p.end} Uhr` : '';
    let statusText = '';
    if (l.status === 'cancelled') statusText = 'Diese Stunde entfällt!';
    else if (l.status === 'substitute') statusText = `Vertretungsunterricht: ${l.notes || ''}`;
    else if (l.status === 'roomchange') statusText = `Raumwechsel: ${l.notes || ''}`;

    const rDisp = formatRoomDisplay(l.room, l.teacher);
    text += `${l.period}. Stunde ${timeStr}: ${l.subject} in ${rDisp}, Lehrkraft ${l.teacher}${l.klasse ? ', Klasse ' + l.klasse : ''}. ${statusText}. `;
  });

  speak(text, true);
}

// =============================================================================
// 9. REITER 2: PRÜFUNGEN, KLAUSUREN & TERMINE (GANZES SCHULJAHR)
// =============================================================================
function setExamFilter(filterType) {
  appData.examFilter = filterType || 'all';

  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.id === `filter-${appData.examFilter}`);
  });

  renderExams();

  const labels = {
    all: 'Alle Termine und Prüfungen des Schuljahres',
    exams: 'Nur Prüfungen und Klausuren',
    holidays: 'Nur Ferien und Feiertage',
    upcoming: 'Nur anstehende Termine',
    iserv: 'Nur IServ-Kalendertermine'
  };
  announceSR(`Filter aktiviert: ${labels[appData.examFilter] || appData.examFilter}`, 'polite');
}

function renderExams() {
  const container = document.getElementById('exams-list-container');
  if (!container) return;

  const schoolYearName = appData.schoolYear ? appData.schoolYear.name : '2026/2027';
  const syBadge = document.getElementById('exams-schoolyear-badge');
  if (syBadge) syBadge.textContent = `Schuljahr ${schoolYearName}`;

  const subtitle = document.getElementById('exams-schoolyear-subtitle');
  if (subtitle) subtitle.textContent = `Vollständige Jahresübersicht aller Klausuren, Arbeiten und Ferientermine für das Schuljahr ${schoolYearName} .`;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 1. Alle Termine & Klausuren zusammenführen
  const allEvents = [];

  // A. Prüfungen
  if (appData.exams && Array.isArray(appData.exams)) {
    appData.exams.forEach(ex => {
      const iso = normalizeToIsoDate(ex.date);
      if (!iso) return;
      const dParts = iso.split('-');
      const dObj = new Date(parseInt(dParts[0]), parseInt(dParts[1]) - 1, parseInt(dParts[2]));
      let endObj = dObj;
      let timeDisplay = `${formatUntisTimeToStr(ex.startTime)} - ${formatUntisTimeToStr(ex.endTime)} Uhr`;
      if (ex.endDate && ex.endDate !== ex.date) {
        const eIso = normalizeToIsoDate(ex.endDate);
        if (eIso) {
          const eParts = eIso.split('-');
          endObj = new Date(parseInt(eParts[0]), parseInt(eParts[1]) - 1, parseInt(eParts[2]));
          timeDisplay = `Klausurzeitraum: Vom ${formatGermanDate(dObj)} bis ${formatGermanDate(endObj)}`;
        }
      }
      allEvents.push({
        id: ex.id,
        type: 'exam',
        title: ex.subject,
        subTitle: ex.topic || 'Klausur laut WebUntis',
        dateStr: iso,
        endDateStr: ex.endDate || iso,
        dateObj: dObj,
        endDateObj: endObj,
        timeStr: timeDisplay,
        room: ex.room || 'Raum laut Plan',
        teacher: ex.teacher || 'Fachlehrkraft',
        isHoliday: false
      });
    });
  }

  // B. Schulferien & Termine
  if (appData.holidays && Array.isArray(appData.holidays)) {
    appData.holidays.forEach(h => {
      const sIso = normalizeToIsoDate(h.startDate);
      const eIso = normalizeToIsoDate(h.endDate) || sIso;
      if (!sIso) return;
      const sParts = sIso.split('-');
      const eParts = eIso.split('-');
      const sObj = new Date(parseInt(sParts[0]), parseInt(sParts[1]) - 1, parseInt(sParts[2]));
      const eObj = new Date(parseInt(eParts[0]), parseInt(eParts[1]) - 1, parseInt(eParts[2]));
      allEvents.push({
        id: h.id,
        type: h.type || 'holiday',
        title: h.name,
        subTitle: h.longName || h.name,
        dateStr: sIso,
        endDateStr: eIso,
        dateObj: sObj,
        endDateObj: eObj,
        timeStr: (sIso === eIso) ? (h.timeStr || 'Ganztägig (Schulfrei)') : `Vom ${formatGermanDate(sObj)} bis ${formatGermanDate(eObj)}`,
        room: h.type === 'appointment' ? (h.room || 'LWL-Berufskolleg Soest') : 'Schulfrei',
        teacher: 'LWL-Berufskolleg Soest',
        isHoliday: (h.type !== 'exam')
      });
    });
  }

  // C. IServ Kalendertermine
  if (appData.config.iservEnabled && appData.iservEvents && Array.isArray(appData.iservEvents)) {
    appData.iservEvents.forEach(ev => {
      const sIso = normalizeToIsoDate(ev.startDate);
      const eIso = normalizeToIsoDate(ev.endDate) || sIso;
      if (!sIso) return;
      const sParts = sIso.split('-');
      const eParts = eIso.split('-');
      const sObj = new Date(parseInt(sParts[0]), parseInt(sParts[1]) - 1, parseInt(sParts[2]));
      const eObj = new Date(parseInt(eParts[0]), parseInt(eParts[1]) - 1, parseInt(eParts[2]));
      allEvents.push({
        id: ev.id,
        type: 'iserv',
        title: ev.title,
        subTitle: ev.description || 'IServ Termin',
        dateStr: sIso,
        endDateStr: eIso,
        dateObj: sObj,
        endDateObj: eObj,
        timeStr: (sIso === eIso) ? 'Ganztägig (IServ)' : `Vom ${formatGermanDate(sObj)} bis ${formatGermanDate(eObj)}`,
        room: ev.location || 'IServ Kalender',
        teacher: 'IServ Schulserver',
        isHoliday: false
      });
    });
  }

  // Zähler für Filter-Buttons aktualisieren
  const totalAll = allEvents.length;
  const totalExams = allEvents.filter(e => e.type === 'exam').length;
  const totalHolidays = allEvents.filter(e => e.type === 'holiday' || e.type === 'appointment').length;
  const totalUpcoming = allEvents.filter(e => e.endDateObj >= todayStart).length;
  const totalIserv = allEvents.filter(e => e.type === 'iserv').length;

  const countAllEl = document.getElementById('count-all');
  if (countAllEl) countAllEl.textContent = totalAll;
  const countExamsEl = document.getElementById('count-exams');
  if (countExamsEl) countExamsEl.textContent = totalExams;
  const countHolidaysEl = document.getElementById('count-holidays');
  if (countHolidaysEl) countHolidaysEl.textContent = totalHolidays;
  const countUpcomingEl = document.getElementById('count-upcoming');
  if (countUpcomingEl) countUpcomingEl.textContent = totalUpcoming;
  const countIservEl = document.getElementById('count-iserv');
  if (countIservEl) countIservEl.textContent = totalIserv;

  // 2. Filter anwenden
  const filter = appData.examFilter || 'all';
  let filtered = allEvents;
  if (filter === 'exams') {
    filtered = allEvents.filter(e => e.type === 'exam');
  } else if (filter === 'holidays') {
    filtered = allEvents.filter(e => e.type === 'holiday' || e.type === 'appointment');
  } else if (filter === 'iserv') {
    filtered = allEvents.filter(e => e.type === 'iserv');
  } else if (filter === 'upcoming') {
    filtered = allEvents.filter(e => e.endDateObj >= todayStart);
  }

  if (filtered.length === 0) {
    if (filter === 'exams') {
      container.innerHTML = `
        <div class="status-box" style="padding: 32px; text-align: center;">
          <span class="emoji-icon" style="font-size: 40px;" aria-hidden="true">📝</span>
          <h3 style="font-size: var(--font-size-lg); font-weight: bold; margin-top: 12px;">Keine Prüfungen in WebUntis eingetragen</h3>
          <p class="field-hint" style="max-width: 520px; margin: 8px auto 0;">In deinem WebUntis-Konto sind aktuell keine Klausuren oder Prüfungen hinterlegt. Sobald deine Lehrkräfte oder das Schulbüro Arbeiten ansetzen, werden diese hier automatisch synchronisiert.</p>
          <button type="button" class="btn btn-secondary" style="margin-top: 16px;" onclick="setExamFilter('all')">
            Alle Termine & Ferien anzeigen
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="status-box" style="padding: 32px; text-align: center;">
        <span class="emoji-icon" style="font-size: 40px;" aria-hidden="true">📅</span>
        <h3 style="font-size: var(--font-size-lg); font-weight: bold; margin-top: 12px;">Keine Einträge für diesen Filter</h3>
        <p class="field-hint">Für den gewählten Filter liegen im Schuljahr ${schoolYearName} derzeit keine Termine vor.</p>
        <button type="button" class="btn btn-secondary" style="margin-top: 16px;" onclick="setExamFilter('all')">
          Alle Termine des Schuljahres anzeigen
        </button>
      </div>
    `;
    return;
  }

  // 3. Chronologisch sortieren
  filtered.sort((a, b) => a.dateObj - b.dateObj);

  // 4. Nach Monat gruppieren
  const monthGroups = {};
  filtered.forEach(item => {
    const mKey = `${item.dateObj.getFullYear()}-${String(item.dateObj.getMonth() + 1).padStart(2, '0')}`;
    if (!monthGroups[mKey]) {
      const monthName = item.dateObj.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      monthGroups[mKey] = {
        name: monthName,
        items: []
      };
    }
    monthGroups[mKey].items.push(item);
  });

  let html = '';
  for (const mKey in monthGroups) {
    const group = monthGroups[mKey];
    const groupId = `month-${mKey}`;
    html += `
      <section class="month-section" aria-labelledby="${groupId}">
        <h3 id="${groupId}" class="month-heading">
          <span><span class="emoji-icon" aria-hidden="true">📅 </span>${group.name}</span>
          <span style="font-size: 14px; opacity: 0.85;">${group.items.length} ${group.items.length === 1 ? 'Eintrag' : 'Einträge'}</span>
        </h3>
        <div role="list">
    `;

    group.items.forEach(ev => {
      const isPast = ev.endDateObj < todayStart;
      const isToday = todayStart >= ev.dateObj && todayStart <= ev.endDateObj;
      const daysDiff = Math.ceil((ev.dateObj.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

      let countdownText = '';
      let countdownClass = '';

      if (isPast) {
        countdownText = 'Bereits vergangen';
        countdownClass = 'countdown-past';
      } else if (isToday) {
        countdownText = '<span class="emoji-icon" aria-hidden="true">🔴 </span>HEUTE!';
        countdownClass = 'countdown-urgent';
      } else if (daysDiff === 1) {
        countdownText = 'Morgen!';
        countdownClass = 'countdown-urgent';
      } else if (daysDiff <= 7) {
        countdownText = `Noch ${daysDiff} Tage`;
        countdownClass = 'countdown-soon';
      } else if (daysDiff <= 30) {
        const weeks = Math.floor(daysDiff / 7);
        countdownText = `In ca. ${weeks} ${weeks === 1 ? 'Woche' : 'Wochen'}`;
        countdownClass = 'countdown-normal';
      } else {
        countdownText = `In ${daysDiff} Tagen`;
        countdownClass = 'countdown-normal';
      }

      let typeBadge = '';
      let itemClass = '';
      if (ev.type === 'exam') {
        typeBadge = '<span class="event-type-badge type-exam"><span class="emoji-icon" aria-hidden="true">📝 </span>Prüfung / Klausur</span>';
        itemClass = 'exam-item';
      } else if (ev.type === 'holiday') {
        typeBadge = '<span class="event-type-badge type-holiday"><span class="emoji-icon" aria-hidden="true">🏖️ </span>Schulferien / Frei</span>';
        itemClass = 'holiday-item';
      } else {
        typeBadge = '<span class="event-type-badge type-appointment"><span class="emoji-icon" aria-hidden="true">📌 </span>Schultermin</span>';
        itemClass = 'appointment-item';
      }

      if (isPast) itemClass += ' past-event';

      const dateLabel = (ev.endDateStr && ev.dateStr !== ev.endDateStr)
        ? `${formatGermanDate(ev.dateObj)} bis ${formatGermanDate(ev.endDateObj)}`
        : ev.dateObj.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

      const ariaLabelText = `${ev.type === 'exam' ? 'Prüfung' : 'Termin'}: ${ev.title}. Datum: ${dateLabel}. Zeit: ${ev.timeStr}. ${ev.type === 'exam' ? 'Raum: ' + ev.room + ', Lehrkraft: ' + ev.teacher : ''}. Status: ${countdownText}.`;

      html += `
        <article class="event-card ${itemClass}" role="listitem" tabindex="0" aria-label="${ariaLabelText}">
          <div class="event-info">
            <div class="event-header-row">
              ${typeBadge}
              <span class="exam-badge">WebUntis</span>
            </div>
            <h4 class="event-title">${ev.title}</h4>
            <div class="event-meta-row">
              <span class="event-meta-item"><span class="emoji-icon" aria-hidden="true">📅 </span><strong>${dateLabel}</strong></span>
              <span class="event-meta-item"><span class="emoji-icon" aria-hidden="true">⏰ </span><strong>${ev.timeStr}</strong></span>
              ${ev.type === 'exam' ? `<span class="event-meta-item"><span class="emoji-icon" aria-hidden="true">🚪 </span><strong>${ev.room}</strong></span>` : ''}
              ${ev.type === 'exam' ? `<span class="event-meta-item"><span class="emoji-icon" aria-hidden="true">👨</span>‍<span class="emoji-icon" aria-hidden="true">🏫 </span><strong>${ev.teacher}</strong></span>` : ''}
            </div>
            ${ev.subTitle && ev.subTitle !== ev.title ? `<div style="margin-top: 6px; font-size: 14px; color: var(--text-muted);"><span class="emoji-icon" aria-hidden="true">📋 </span>${ev.subTitle}</div>` : ''}
          </div>
          <div class="event-side-box">
            <span class="countdown-pill ${countdownClass}" aria-hidden="true">${countdownText}</span>
          </div>
        </article>
      `;
    });

    html += `
        </div>
      </section>
    `;
  }

  container.innerHTML = html;
}

function formatGermanDate(d) {
  if (!d) return '';
  const dateObj = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return '';
  return dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function readAllExamsAndEvents() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const upcomingExams = (appData.exams || []).filter(e => {
    const parts = e.date.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d >= todayStart;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  const upcomingHolidays = (appData.holidays || []).filter(h => {
    const parts = h.endDate.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d >= todayStart;
  }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

  const syName = appData.schoolYear ? appData.schoolYear.name : '2026/2027';

  let text = `Jahresübersicht für das Schuljahr ${syName} . `;
  text += `Du hast insgesamt ${upcomingExams.length} anstehende Prüfungen und ${upcomingHolidays.length} anstehende Ferien- und Feiertage. `;

  if (upcomingExams.length > 0) {
    text += `Die nächste Prüfung ist ${upcomingExams[0].subject} am ${formatGermanDate(new Date(upcomingExams[0].date))} in ${upcomingExams[0].room}. `;
  } else {
    text += 'Es sind derzeit keine anstehenden Prüfungen eingetragen. ';
  }

  if (upcomingHolidays.length > 0) {
    text += `Der nächste schulfreie Zeitraum ist ${upcomingHolidays[0].name} ab dem ${formatGermanDate(new Date(upcomingHolidays[0].startDate))}. `;
  }

  speak(text, true);
}

// =============================================================================
// 9b. STUNDEN-DETAILS MODAL & LEHRSTOFF-ABRUF
// =============================================================================
const _enrichedLessonIds = new Set();
let _isEnriching = false;

async function enrichLessonsWithTopics(lessons) {
  if (!lessons || !Array.isArray(lessons) || _isEnriching) return;
  const toFetch = lessons.filter(l => l && l.untisId && l.dateStr && !l.lstext && !_enrichedLessonIds.has(l.id));
  if (toFetch.length === 0) return;

  _isEnriching = true;
  try {
    for (let i = 0; i < toFetch.length; i += 4) {
      const batch = toFetch.slice(i, i + 4);
      let anyFound = false;
      await Promise.all(batch.map(async l => {
        _enrichedLessonIds.add(l.id);
        try {
          const infoRes = await callWebUntisRest(`/api/public/period/info?date=${l.dateStr}&periodId=${l.untisId}`, null, 'GET');
          if (infoRes && infoRes.data && infoRes.data.blocks) {
            for (const row of infoRes.data.blocks) {
              for (const b of row) {
                if (b.lessonTopic && b.lessonTopic.text) {
                  l.lstext = b.lessonTopic.text.trim();
                  anyFound = true;
                }
                if (b.periodInfo && b.periodInfo.text && !l.notes) {
                  l.notes = b.periodInfo.text.trim();
                }
              }
            }
          }
        } catch (e) {}
      }));
      if (anyFound) {
        saveAppData();
        // Leises Re-Rendering der Stundenkarten zur Anzeige des Lehrstoffs
        const activeTab = document.querySelector('.tab-button.active');
        if (activeTab && (activeTab.getAttribute('data-tab') === 'timetable' || activeTab.getAttribute('data-tab') === 'overview')) {
          renderTimetable();
        }
      }
    }
  } finally {
    _isEnriching = false;
  }
}

function openLessonDetails(lessonId) {
  let lesson = (appData.timetable || []).find(l => String(l.id) === String(lessonId));
  if (!lesson && appData.timetableCache) {
    for (const k in appData.timetableCache) {
      const found = (appData.timetableCache[k] || []).find(l => String(l.id) === String(lessonId));
      if (found) { lesson = found; break; }
    }
  }
  if (!lesson) return;

  const modal = document.getElementById('modal-lesson-details');
  if (!modal) return;

  const cleanRoom = formatRoomNameOnly(lesson.room, lesson.teacher);
  const cleanTeacher = cleanTeacherName(lesson.teacher);

  const fmtTime = t => {
    if (!t) return '–';
    let s = String(t).trim();
    if (s.includes(':')) return s;
    s = s.padStart(4, '0');
    return s.slice(0, 2) + ':' + s.slice(2);
  };

  const hwText = lesson.homework
    ? (Array.isArray(lesson.homework)
        ? lesson.homework.map(h => `${escHtml(h.subject || '')}: ${escHtml(h.description || '')}`).join('<br>')
        : escHtml(String(lesson.homework)))
    : 'Keine Hausaufgaben eingetragen.';

  const initialLsText = lesson.lstext
    ? escHtml(lesson.lstext)
    : '<span style="color: var(--text-muted); font-style: italic;">Wird aus WebUntis abgerufen...</span>';

  // Titel setzen
  const titleEl = modal.querySelector('.modal-title');
  if (titleEl) titleEl.textContent = lesson.subject || 'Stunde';

  // Modal-Body dynamisch befüllen
  const body = document.getElementById('modal-lesson-body');
  if (body) {
    body.innerHTML = `
      <dl class="modal-detail-list">
        <div class="modal-detail-row">
          <dt class="modal-detail-label"><span class="emoji-icon" aria-hidden="true">📘 </span>Fach</dt>
          <dd class="modal-detail-content" data-key="subject">${escHtml(lesson.subject || '–')}</dd>
        </div>
        <div class="modal-detail-row">
          <dt class="modal-detail-label"><span class="emoji-icon" aria-hidden="true">📅 </span>Datum</dt>
          <dd class="modal-detail-content" data-key="date">${escHtml(lesson.dateStr || '–')}</dd>
        </div>
        <div class="modal-detail-row">
          <dt class="modal-detail-label"><span class="emoji-icon" aria-hidden="true">⏰ </span>Zeit</dt>
          <dd class="modal-detail-content" data-key="time">${fmtTime(lesson.startTime)} – ${fmtTime(lesson.endTime)}</dd>
        </div>
        <div class="modal-detail-row">
          <dt class="modal-detail-label"><span class="emoji-icon" aria-hidden="true">🏫 </span>Raum</dt>
          <dd class="modal-detail-content" data-key="room">${escHtml(cleanRoom)}</dd>
        </div>
        <div class="modal-detail-row">
          <dt class="modal-detail-label"><span class="emoji-icon" aria-hidden="true">👤 </span>Lehrer</dt>
          <dd class="modal-detail-content" data-key="teacher">${escHtml(cleanTeacher)}</dd>
        </div>
        <div class="modal-detail-row">
          <dt class="modal-detail-label"><span class="emoji-icon" aria-hidden="true">📝 </span>Lehrstoff</dt>
          <dd class="modal-detail-content" data-key="lstext" id="modal-lesson-lstext">${initialLsText}</dd>
        </div>
        <div class="modal-detail-row">
          <dt class="modal-detail-label"><span class="emoji-icon" aria-hidden="true">📚 </span>Hausaufgaben</dt>
          <dd class="modal-detail-content" data-key="homework">${hwText}</dd>
        </div>
      </dl>`;
  }

  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');

  // Fokus auf Schließen-Button setzen
  const closeBtn = modal.querySelector('.modal-close-btn');
  if (closeBtn) closeBtn.focus();
  else modal.setAttribute('tabindex', '-1'), modal.focus();

  // WebUntis Live-Abruf für Lehrstoff & Unterrichtsinfos über /api/public/period/info
  if (lesson.untisId && lesson.dateStr) {
    const periodId = lesson.untisId;
    const dateStr = lesson.dateStr;
    callWebUntisRest(`/api/public/period/info?date=${dateStr}&periodId=${periodId}`, null, 'GET')
      .then(infoRes => {
        try {
          let foundTopic = '';
          let foundPeriodInfo = '';
          if (infoRes && infoRes.data && infoRes.data.blocks) {
            for (const row of infoRes.data.blocks) {
              for (const b of row) {
                if (b.lessonTopic && b.lessonTopic.text) {
                  foundTopic = b.lessonTopic.text.trim();
                }
                if (b.periodInfo && b.periodInfo.text) {
                  foundPeriodInfo = b.periodInfo.text.trim();
                }
                if (b.lessonInfo && !foundPeriodInfo) {
                  foundPeriodInfo = b.lessonInfo.trim();
                }
              }
            }
          }

          if (foundTopic) {
            lesson.lstext = foundTopic;
            if (appData.timetableCache) {
              for (const k in appData.timetableCache) {
                const match = (appData.timetableCache[k] || []).find(l => String(l.id) === String(lesson.id) || (l.untisId === lesson.untisId && l.dateStr === lesson.dateStr));
                if (match) match.lstext = foundTopic;
              }
            }
            saveAppData();
            const lsEl = document.getElementById('modal-lesson-lstext');
            if (lsEl) lsEl.textContent = foundTopic;
            renderTimetable();
          } else {
            const lsEl = document.getElementById('modal-lesson-lstext');
            if (lsEl && (!lesson.lstext || lsEl.textContent.includes('abgerufen'))) {
              lsEl.textContent = 'Kein Lehrstoff eingetragen.';
            }
          }
        } catch (err) {
          const lsEl = document.getElementById('modal-lesson-lstext');
          if (lsEl && (!lesson.lstext || lsEl.textContent.includes('abgerufen'))) {
            lsEl.textContent = 'Kein Lehrstoff eingetragen.';
          }
        }
      })
      .catch(() => {
        const lsEl = document.getElementById('modal-lesson-lstext');
        if (lsEl && (!lesson.lstext || lsEl.textContent.includes('abgerufen'))) {
          lsEl.textContent = 'Kein Lehrstoff eingetragen.';
        }
      });
  }
}

function closeLessonDetails() {
  const modal = document.getElementById('modal-lesson-details');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

function handleLessonKeydown(event, lessonId) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openLessonDetails(lessonId);
  }
}

function handleModalBackdropClick(event) {
  const modal = document.getElementById('modal-lesson-details');
  if (!modal) return;
  if (event.target === modal) {
    closeLessonDetails();
  }
}

function speakCurrentLessonDetails() {
  const modal = document.getElementById('modal-lesson-details');
  if (!modal || modal.style.display === 'none') return;

  const getVal = key => {
    const el = modal.querySelector(`[data-key="${key}"]`);
    return el ? el.textContent.trim() : '';
  };

  const subject  = getVal('subject');
  const date     = getVal('date');
  const time     = getVal('time');
  const room     = formatRoomNameOnly(getVal('room'));
  const teacher  = cleanTeacherName(getVal('teacher'));
  const lstext   = getVal('lstext');
  const homework = getVal('homework');

  let text = `Stunden-Details: ${subject}. `;
  if (date)     text += `Datum: ${date}. `;
  if (time)     text += `Zeit: ${time}. `;
  if (room)     text += `Raum: ${room}. `;
  if (teacher)  text += `Lehrer: ${teacher}. `;
  if (lstext && !lstext.includes('abgerufen'))   text += `Lehrstoff: ${lstext}. `;
  if (homework && !homework.includes('Keine Hausaufgaben')) text += `Hausaufgaben: ${homework}. `;

  speak(text, true);
}

// =============================================================================
// 9c. HAUSAUFGABEN RENDERN
// =============================================================================
function renderHomework() {
  const container = document.getElementById('homework-list-container');
  if (!container) return;

  const filter = appData.homeworkFilter || 'classreg';
  let items = appData.homework || [];
  const today = new Date(); today.setHours(0,0,0,0);

  if (filter === 'pending') {
    items = items.filter(h => !h.completed);
  } else if (filter === 'completed') {
    items = items.filter(h => h.completed);
  } else if (filter === 'overdue') {
    items = items.filter(h => {
      if (h.completed) return false;
      if (!h.dueDate) return false;
      return new Date(h.dueDate) < today;
    });
  }

  // Klassenbuch (Lehrstoff) & Offizielle Klassenbucheinträge
  const classbook = appData.classbook || [];
  const classregEvents = appData.classregEvents || [];

  // Zählbadges aktualisieren
  const allHw = appData.homework || [];
  const pendingCount   = allHw.filter(h => !h.completed).length;
  const completedCount = allHw.filter(h => h.completed).length;
  const classbookCount = classbook.length;
  const classregCount  = classregEvents.length;

  const iservTasks = (appData.config.iservEnabled && Array.isArray(appData.iservTasks)) ? appData.iservTasks : [];
  const countAllEl  = document.getElementById('hw-count-all');
  const countPendEl = document.getElementById('hw-count-pending');
  const countCompEl = document.getElementById('hw-count-completed');
  const countCbEl   = document.getElementById('hw-count-classbook');
  const countCrEl   = document.getElementById('hw-count-classreg');
  const countIservEl = document.getElementById('hw-count-iserv');
  if (countAllEl)  countAllEl.textContent  = String(allHw.length + iservTasks.length);
  if (countPendEl) countPendEl.textContent = String(pendingCount + iservTasks.filter(t => !t.completed).length);
  if (countCompEl) countCompEl.textContent = String(completedCount + iservTasks.filter(t => t.completed).length);
  if (countCbEl)   countCbEl.textContent   = String(classbookCount);
  if (countCrEl)   countCrEl.textContent   = String(classregCount);
  if (countIservEl) countIservEl.textContent = String(iservTasks.length);

  // Filter-Button aktiv-Zustand über Button-IDs setzen
  const filterMap = {
    'classreg':  'hw-filter-classreg',
    'pending':   'hw-filter-pending',
    'all':       'hw-filter-all',
    'completed': 'hw-filter-completed',
    'classbook': 'hw-filter-classbook',
    'iserv':     'hw-filter-iserv'
  };
  Object.entries(filterMap).forEach(([f, id]) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.classList.toggle('active', f === filter);
      btn.setAttribute('aria-pressed', String(f === filter));
    }
  });

  let html = '';

  
  // ---------------------------------------------------------------------------
  // FALL 1B: SEPARATER FILTER "ISERV-AUFGABEN"
  // ---------------------------------------------------------------------------
  if (filter === 'iserv') {
    html += `
      <div class="banner-header" style="padding: 12px 0; margin-bottom: 16px;">
        <h3 class="section-subheading" style="margin: 0; font-size: 1.25rem;"><span class="emoji-icon" aria-hidden="true">📋 </span>IServ-Aufgabenliste (${iservTasks.length} Aufgaben)</h3>
        <p class="field-hint">Aufgaben und Übungen aus dem offiziellen IServ-Aufgabenmodul deines Schulkontos.</p>
      </div>`;

    if (iservTasks.length === 0) {
      html += `
        <div class="empty-state" role="status" aria-live="polite">
          <span aria-hidden="true"><span class="emoji-icon" aria-hidden="true">📋</span></span>
          <h4 style="margin: 0; font-size: inherit; font-weight: bold;">Aktuell liegen keine IServ-Aufgaben vor.</h4>
          <p class="empty-hint">Neue Aufgaben werden bei der nächsten Synchronisation automatisch von IServ geladen.</p>
        </div>`;
    } else {
      iservTasks.forEach(t => {
        const dObj = t.dueDate ? new Date(t.dueDate) : null;
        const dateFormatted = dObj && !isNaN(dObj) ? formatGermanDate(dObj) : (t.dueDate || 'Kein Termin angegeben');
        const statusBadge = t.completed 
          ? '<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:bold;">Erledigt</span>' 
          : '<span class="badge" style="background:#fef3c7; color:#92400e; font-weight:bold;">Ausstehend / Offen</span>';

        html += `
          <article class="homework-card" style="border-left: 6px solid #0891b2; margin-bottom: 16px; padding: 18px 20px; background: var(--bg-card); border-radius: 8px;" tabindex="0" role="article" aria-label="IServ Aufgabe ${escHtml(t.title)}: Fällig am ${dateFormatted}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <span class="badge-iserv"><span class="emoji-icon" aria-hidden="true">🌐 </span>IServ Aufgabe</span>
                <span class="homework-date-badge" style="background: var(--bg-highlight); color: var(--text-color); font-weight: bold; font-size: 14px;">
                  <span class="emoji-icon" aria-hidden="true">📅 </span>Fällig: ${escHtml(dateFormatted)}
                </span>
                ${t.subject ? `<span class="urgent-badge" style="background: #fef3c7; color: #92400e; font-weight: bold; font-size: 13px;"><span class="emoji-icon" aria-hidden="true">📚 </span>${escHtml(t.subject)}</span>` : ''}
                ${t.teacher ? `<span class="urgent-badge" style="background: #e0e7ff; color: #3730a3; font-weight: bold; font-size: 13px;"><span class="emoji-icon" aria-hidden="true">👤 </span>${escHtml(t.teacher)}</span>` : ''}
                ${statusBadge}
              </div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <button type="button" class="btn btn-secondary" style="min-height: 32px; padding: 4px 12px; font-size: 13px;" onclick="speakIServTask('${t.id}')" aria-label="Diese IServ-Aufgabe vorlesen">
                  <span class="emoji-icon" aria-hidden="true">🔊 </span>Vorlesen
                </button>
                <a href="https://${escHtml(appData.config.iservServer || 'lwl-bk-soest.de')}/iserv/exercise" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="min-height: 32px; padding: 4px 12px; font-size: 13px; text-decoration: none;" aria-label="Aufgabe in IServ öffnen">
                  <span class="emoji-icon" aria-hidden="true">🌐 </span>IServ
                </a>
              </div>
            </div>
            <h4 class="homework-title" style="margin: 6px 0 10px 0; font-size: 1.15rem; font-weight: bold;">${escHtml(t.title)}</h4>
            ${t.description ? `<p class="homework-desc" style="margin: 0; color: var(--text-secondary); line-height: 1.5;">${escHtml(t.description)}</p>` : ''}
          </article>`;
      });
    }
    container.innerHTML = html;
    return;
  }

  // ---------------------------------------------------------------------------
  // FALL 1: SEPARATER PUNKT "OFFIZIELLE KLASSENBUCHEINTRÄGE"
  // ---------------------------------------------------------------------------
  if (filter === 'classreg') {
    html += `
      <div class="banner-header" style="padding: 12px 0; margin-bottom: 16px;">
        <h3 class="section-subheading" style="margin: 0; font-size: 1.25rem;"><span class="emoji-icon" aria-hidden="true">📋 </span>Offizielle Klassenbucheinträge (${classregEvents.length} aus WebUntis)</h3>
        <p class="field-hint">Offizielle Beschlüsse, Sprecherwahlen und Ankündigungen deiner Klasse ${escHtml(appData.config.klasse || 'BFW2B')} live aus dem WebUntis-Klassenbuch.</p>
      </div>`;

    if (classregEvents.length === 0) {
      html += `
        <div class="empty-state" role="status" aria-live="polite">
          <span aria-hidden="true"><span class="emoji-icon" aria-hidden="true">📋</span></span>
          <h4 style="margin: 0; font-size: inherit; font-weight: bold;">Aktuell liegen keine offiziellen Klassenbucheinträge vor.</h4>
          <p class="empty-hint">Neue Einträge von Lehrkräften werden automatisch aus WebUntis geladen.</p>
        </div>`;
    } else {
      classregEvents.forEach(ev => {
        const dObj = ev.date ? new Date(ev.date) : null;
        const dateFormatted = dObj && !isNaN(dObj) ? formatGermanDate(dObj) : (ev.date || 'Datum unbekannt');
        const timeFormatted = ev.timeStr || (ev.time ? ev.time + ' Uhr' : '');

        html += `
          <article class="homework-card classreg-event-card" style="border-left: 6px solid var(--accent-info); margin-bottom: 16px; padding: 18px 20px; background: var(--bg-card); border-radius: 8px;" tabindex="0" role="article" aria-label="Klassenbucheintrag vom ${dateFormatted}: ${escHtml(ev.text)}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <span class="homework-date-badge" style="background: var(--bg-highlight); color: var(--text-color); font-weight: bold; font-size: 14px;">
                  <span class="emoji-icon" aria-hidden="true">📅 </span>${escHtml(dateFormatted)}${timeFormatted ? ' um ' + escHtml(timeFormatted) : ''}
                </span>
                <span class="urgent-badge" style="background: #e0e7ff; color: #3730a3; font-weight: bold; font-size: 13px;">
                  <span class="emoji-icon" aria-hidden="true">🏫 </span>Klasse: ${escHtml(ev.klasse || 'BFW2B')}
                </span>
                <span class="urgent-badge" style="background: #fef3c7; color: #92400e; font-weight: bold; font-size: 13px;">
                  <span class="emoji-icon" aria-hidden="true">📚 </span>Fach: ${escHtml(ev.subject || 'Allgemein')}
                </span>
              </div>
              <button type="button" class="btn btn-secondary" style="min-height: 32px; padding: 4px 12px; font-size: 13px;" onclick="speakClassregEvent('${ev.id}')" aria-label="Diesen Klassenbucheintrag vorlesen">
                <span class="emoji-icon" aria-hidden="true">🔊 </span>Vorlesen
              </button>
            </div>
            <h4 class="classreg-event-title">
              ${escHtml(ev.text)}
            </h4>
            <div style="font-size: 13px; color: var(--text-muted); font-weight: 500;">
              <span class="emoji-icon" aria-hidden="true">👤 </span><strong>Eingetragen von:</strong> ${escHtml(ev.teacher)} ${ev.teacherCode ? '(' + escHtml(ev.teacherCode) + ')' : ''}
            </div>
          </article>
        `;
      });
    }

    container.innerHTML = html;
    return;
  }

  // ---------------------------------------------------------------------------
  // FALL 2: DURCHGENOMMENER LEHRSTOFF / THEMEN DER UNTERRICHTSSTUNDEN
  // ---------------------------------------------------------------------------
  if (filter === 'classbook') {
    html += `
      <div class="banner-header" style="padding: 12px 0; margin-bottom: 16px;">
        <h3 class="section-subheading" style="margin: 0; font-size: 1.25rem;"><span class="emoji-icon" aria-hidden="true">📖 </span>Durchgenommener Lehrstoff (${classbook.length} Unterrichtsstunden)</h3>
        <p class="field-hint">Themen und behandelter Stoff der einzelnen Schulstunden aus WebUntis.</p>
      </div>`;

    if (classbook.length === 0) {
      html += `
        <div class="empty-state" role="status" aria-live="polite">
          <span aria-hidden="true"><span class="emoji-icon" aria-hidden="true">📖</span></span>
          <h4 style="margin: 0; font-size: inherit; font-weight: bold;">Noch kein Unterrichtsstoff im Klassenbuch erfasst.</h4>
        </div>`;
    } else {
      classbook.forEach(entry => {
        let dObj = null;
        if (entry.date) {
          const dRaw = String(entry.date).replace(/-/g, '');
          if (dRaw.length === 8) {
            dObj = new Date(parseInt(dRaw.slice(0,4)), parseInt(dRaw.slice(4,6)) - 1, parseInt(dRaw.slice(6,8)));
          } else {
            dObj = new Date(entry.date);
          }
        }
        const dateStr = (dObj && !isNaN(dObj)) ? formatGermanDate(dObj) : (entry.date || '');
        const displayText = entry.topic || entry.text || 'Kein Lehrstoff eingetragen';
        html += `
          <article class="homework-card classbook-entry" role="article" tabindex="0" aria-label="Lehrstoff in ${escHtml(entry.subject || 'Fach')}: ${escHtml(displayText)}">
            <div class="homework-header">
              ${dateStr ? `<span class="homework-date-badge"><span class="emoji-icon" aria-hidden="true">📅 </span>${dateStr}</span>` : ''}
              <h4 class="homework-subject">${escHtml(entry.subject || 'Allgemein')}</h4>
              ${entry.period ? `<span class="homework-assigned">${escHtml(entry.period)}</span>` : ''}
              ${entry.teacher ? `<span class="homework-assigned"><span class="emoji-icon" aria-hidden="true">👤 </span>${escHtml(entry.teacher)}</span>` : ''}
            </div>
            <p class="homework-desc">${escHtml(displayText)}</p>
          </article>`;
      });
    }

    container.innerHTML = html;
    return;
  }

  // ---------------------------------------------------------------------------
  // FALL 3: HAUSAUFGABEN (pending, all, completed)
  // ---------------------------------------------------------------------------
  if (items.length === 0 && allHw.length === 0) {
    container.innerHTML = `
      <div class="empty-state" role="status" aria-live="polite">
        <span aria-hidden="true"><span class="emoji-icon" aria-hidden="true">📚</span></span>
        <h4 style="margin: 0; font-size: inherit; font-weight: bold;">Keine Hausaufgaben vorhanden.</h4>
        <p class="empty-hint">Hausaufgaben werden automatisch aus WebUntis geladen. Du kannst oben auf <strong>„<span class="emoji-icon" aria-hidden="true">📋 </span>Klassenbucheinträge“</strong> klicken, um offizielle Beschlüsse und Einträge deiner Klasse zu sehen.</p>
      </div>`;
    return;
  }

  if (items.length === 0 && filter === 'pending' && allHw.length > 0) {
    html += `
      <div class="status-box" style="padding: 24px; text-align: center; margin-bottom: 20px;">
        <span class="emoji-icon" style="font-size: 36px;" aria-hidden="true">🎉</span>
        <h4 style="font-size: var(--font-size-lg); font-weight: bold; margin-top: 8px;">Keine offenen Hausaufgaben</h4>
        <p class="field-hint">Alle anstehenden Hausaufgaben sind erledigt! Du hast insgesamt ${allHw.length} Aufgabe(n) in WebUntis.</p>
        <button type="button" class="btn btn-secondary" style="margin-top: 12px;" onclick="setHomeworkFilter('all')">
          Alle Hausaufgaben anzeigen (${allHw.length})
        </button>
      </div>`;
  }

  if (items.length > 0) {
    items.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.dueDate && b.dueDate && a.dueDate !== 'Ohne Frist' && b.dueDate !== 'Ohne Frist') {
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      return 0;
    });

    html += `<h3 class="section-subheading">Hausaufgaben (${items.length})</h3>`;
    items.forEach(hw => {
      const rawDue = hw.dueDate;
      const hasDate = rawDue && rawDue !== 'Ohne Frist' && !isNaN(new Date(rawDue));
      const dueStr = hasDate ? formatGermanDate(new Date(rawDue)) : (rawDue || 'Kein Datum');
      const rawDate = hw.date;
      const hasAssigned = rawDate && !isNaN(new Date(rawDate));
      const assignedStr = hasAssigned ? formatGermanDate(new Date(rawDate)) : '';
      const isOverdue = !hw.completed && hasDate && new Date(rawDue) < today;
      const checkId = `hw-check-${hw.id}`;
      const displayText = hw.text || hw.description || hw.remark || 'Hausaufgabe laut WebUntis';
      html += `
        <article class="homework-card${hw.completed ? ' completed' : ''}${isOverdue ? ' overdue' : ''}"
                 role="article" aria-label="Hausaufgabe: ${escHtml(hw.subject || 'Unbekannt')}">
          <div class="homework-header">
            <span class="homework-date-badge${isOverdue ? ' overdue' : ''}" aria-label="Fällig am ${dueStr}">
              <span class="emoji-icon" aria-hidden="true">📅 </span>${dueStr}${isOverdue ? ' – Überfällig!' : ''}
            </span>
            <h4 class="homework-subject">${escHtml(hw.subject || 'Allgemein')}</h4>
            ${hw.teacher ? `<span class="homework-assigned"><span class="emoji-icon" aria-hidden="true">👤 </span>${escHtml(hw.teacher)}</span>` : ''}
            ${assignedStr ? `<span class="homework-assigned">Aufgegeben: ${assignedStr}</span>` : ''}
          </div>
          <p class="homework-desc">${escHtml(displayText)}</p>
          ${hw.details ? `<p class="homework-details">${escHtml(hw.details)}</p>` : ''}
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 8px;">
            <label class="homework-toggle-label" for="${checkId}">
              <input type="checkbox" id="${checkId}" class="homework-checkbox"
                     ${hw.completed ? 'checked' : ''}
                     aria-label="Als erledigt markieren: ${escHtml(hw.subject || '')}"
                     onchange="toggleHomeworkCompleted('${hw.id}')">
              ${hw.completed ? 'Erledigt <span class="emoji-icon" aria-hidden="true">✓</span>' : 'Als erledigt markieren'}
            </label>
            <div style="display: flex; gap: 8px; align-items: center;">
              ${hw.isCustom ? (hw.scope === 'class' ? '<span class="urgent-badge" style="background: #ecfdf5; color: #065f46; font-weight: bold; font-size: 12px;"><span class="emoji-icon" aria-hidden="true">👥 </span>Klasse</span>' : '<span class="urgent-badge" style="background: #eff6ff; color: #1e40af; font-weight: bold; font-size: 12px;"><span class="emoji-icon" aria-hidden="true">🔒 </span>Nur für mich</span>') : ''}
              ${hw.isCustom ? `<button type="button" class="btn btn-secondary" style="font-size: 12px; padding: 3px 8px; color: var(--accent-error);" onclick="deleteCustomHomework('${hw.id}')" aria-label="Hausaufgabe ${escHtml(hw.subject)} löschen"><span class="emoji-icon" aria-hidden="true">🗑️ </span>Löschen</button>` : ''}
            </div>
          </div>
        </article>`;
    });
  }

  container.innerHTML = html;
}

function setHomeworkFilter(filterType) {
  appData.homeworkFilter = filterType;
  saveAppData();
  renderHomework();
  const names = {
    classreg: 'Offizielle Klassenbucheinträge',
    pending: 'Offene Hausaufgaben',
    all: 'Alle Hausaufgaben',
    completed: 'Erledigte Hausaufgaben',
    classbook: 'Durchgenommener Lehrstoff',
    iserv: 'IServ-Aufgabenliste'
  };
  announceSR(`Filter aktiviert: ${names[filterType] || filterType}`, 'polite');
}

function speakClassregEvent(eventId) {
  const ev = (appData.classregEvents || []).find(e => String(e.id) === String(eventId));
  if (!ev) return;
  const dObj = ev.date ? new Date(ev.date) : null;
  const dateFormatted = dObj && !isNaN(dObj) ? formatGermanDate(dObj) : (ev.date || '');
  const text = `Klassenbucheintrag vom ${dateFormatted}${ev.timeStr ? ' um ' + ev.timeStr : ''}. Fach ${ev.subject}, eingetragen von ${ev.teacher}, Klasse ${ev.klasse}. Inhalt: ${ev.text}`;
  speak(text, true);
  announceSR(text, 'assertive');
}


// =============================================================================
// EIGENE HAUSAUFGABEN (PRIVAT & KLASSE) + SYNC & MODAL
// =============================================================================
function populateHomeworkSubjectSelect() {
  const sel = document.getElementById('hw-input-subject');
  if (!sel) return;

  const subjectsSet = new Set();

  // Aus Metadaten
  const meta = appData.metadata || {};
  const subjectsMap = meta.subjectsMap || {};
  for (const k in subjectsMap) {
    const val = subjectsMap[k];
    if (val && typeof val === 'string' && val.length > 1) {
      subjectsSet.add(val.includes('(') ? val : `${val} (${k})`);
    }
  }

  // Aus Stundenplan
  if (Array.isArray(appData.timetable)) {
    appData.timetable.forEach(l => {
      if (l.subject) {
        const full = getSubjectFullDisplay(l.subject, l.subjectId);
        if (full) subjectsSet.add(full);
      }
    });
  }

  // Aus Notenübersicht
  if (Array.isArray(appData.webuntisGradeList)) {
    appData.webuntisGradeList.forEach(g => {
      if (g.subjectName) {
        subjectsSet.add(g.subjectCode ? `${g.subjectName} (${g.subjectCode})` : g.subjectName);
      }
    });
  }

  // Standard-Fächer als Fallback
  if (typeof COMMON_FALLBACK_SUBJECTS !== 'undefined') {
    Object.entries(COMMON_FALLBACK_SUBJECTS).forEach(([code, name]) => {
      subjectsSet.add(`${name} (${code})`);
    });
  }

  const sortedList = Array.from(subjectsSet).sort((a, b) => a.localeCompare(b, 'de'));

  let optHtml = '<option value="">-- Bitte Schulfach auswählen --</option>';
  sortedList.forEach(s => {
    optHtml += `<option value="${escHtml(s)}">${escHtml(s)}</option>`;
  });
  optHtml += '<option value="Klassenorganisation / Allgemein">Klassenorganisation / Allgemein</option>';

  sel.innerHTML = optHtml;
}

function openAddHomeworkModal() {
  const modal = document.getElementById('modal-add-homework');
  if (!modal) return;

  populateHomeworkSubjectSelect();
  const optClass = document.getElementById('hw-scope-class-opt');
  if (optClass) {
    const klName = appData.config.klasse || (appData.timetable && appData.timetable[0] && appData.timetable[0].klasse) || '';
    optClass.textContent = '[Klasse] Für meine Klasse' + (klName ? ` (${klName})` : '');
  }


  // Standard-Datum auf morgen setzen
  setHwQuickDate(1);

  const textInput = document.getElementById('hw-input-text');
  if (textInput) textInput.value = '';

  modal.style.display = 'flex';
  document.body.classList.add('modal-open');

  const firstInput = document.getElementById('hw-input-subject');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 50);
  }
  playEarcon('open');
  speak('Hausaufgabe hinzufügen Dialog geöffnet.', true);
}

function closeAddHomeworkModal() {
  const modal = document.getElementById('modal-add-homework');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.classList.remove('modal-open');
}

function handleAddHwModalBackdropClick(event) {
  if (event && event.target && event.target.id === 'modal-add-homework') {
    closeAddHomeworkModal();
  }
}

function setHwQuickDate(daysOffset) {
  const input = document.getElementById('hw-input-date');
  if (!input) return;

  const target = new Date();
  target.setDate(target.getDate() + daysOffset);

  // Samstag (6) -> Montag (+2)
  if (target.getDay() === 6) {
    target.setDate(target.getDate() + 2);
  } else if (target.getDay() === 0) {
    target.setDate(target.getDate() + 1);
  }

  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  input.value = `${yyyy}-${mm}-${dd}`;
}

function handleSaveHomeworkSubmit(event) {
  if (event) event.preventDefault();

  const subjSel = document.getElementById('hw-input-subject');
  const dateInput = document.getElementById('hw-input-date');
  const textInput = document.getElementById('hw-input-text');
  const scopeSel = document.getElementById('hw-input-scope');

  const subject = subjSel ? subjSel.value.trim() : '';
  const dueDate = dateInput ? dateInput.value.trim() : '';
  const text = textInput ? textInput.value.trim() : '';
  const scope = scopeSel ? scopeSel.value : 'private';

  if (!subject) {
    alert('Bitte wähle ein Schulfach aus.');
    if (subjSel) subjSel.focus();
    return;
  }
  if (!dueDate) {
    alert('Bitte wähle ein Fälligkeitsdatum aus.');
    if (dateInput) dateInput.focus();
    return;
  }
  if (!text) {
    alert('Bitte gib eine Aufgabenbeschreibung ein.');
    if (textInput) textInput.focus();
    return;
  }

  const newHw = {
    id: `custom-hw-${Date.now()}`,
    subject: subject,
    dueDate: dueDate,
    text: text,
    completed: false,
    isCustom: true,
    scope: scope,
    createdAt: new Date().toISOString()
  };

  if (!Array.isArray(appData.customHomework)) {
    appData.customHomework = [];
  }
  appData.customHomework.push(newHw);

  if (!Array.isArray(appData.homework)) {
    appData.homework = [];
  }
  appData.homework.push(newHw);

  saveAppData();
  pushCloudHomeworkUpdate();
  syncCloudHomework();

  closeAddHomeworkModal();
  renderHomework();
  renderUrgentNotificationBanner();

  const scopeLabel = scope === 'class' ? 'für deine Klasse' : 'nur für dich';
  playEarcon('success');
  speak(`Hausaufgabe für ${subject} ${scopeLabel} gespeichert.`, true);
  announceSR(`Hausaufgabe für ${subject} gespeichert.`, 'polite');
}

function deleteCustomHomework(hwId) {
  const hw = (appData.homework || []).find(h => String(h.id) === String(hwId));
  const subj = hw ? hw.subject : 'die Hausaufgabe';
  if (!confirm(`Möchtest du die Hausaufgabe für ${subj} wirklich löschen?`)) {
    return;
  }

  if (Array.isArray(appData.customHomework)) {
    appData.customHomework = appData.customHomework.filter(h => String(h.id) !== String(hwId));
  }
  if (Array.isArray(appData.homework)) {
    appData.homework = appData.homework.filter(h => String(h.id) !== String(hwId));
  }

  saveAppData();
  pushCloudHomeworkUpdate();
  syncCloudHomework();

  renderHomework();
  renderUrgentNotificationBanner();
  playEarcon('delete');
  speak('Hausaufgabe gelöscht.', true);
  announceSR('Hausaufgabe gelöscht.', 'polite');
}

function syncCustomHomeworkToBackend() {
  if (!Array.isArray(appData.customHomework)) return;
  fetch('/api/custom_homework', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(appData.customHomework)
  }).catch(() => {});
}

function loadCustomHomeworkFromBackend() {
  fetch('/api/custom_homework')
    .then(r => r.json())
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        if (!Array.isArray(appData.customHomework)) appData.customHomework = [];
        let added = false;
        data.forEach(item => {
          if (!appData.customHomework.some(c => c.id === item.id || (c.dueDate === item.dueDate && c.text === item.text && c.subject === item.subject))) {
            appData.customHomework.push(item);
            added = true;
          }
        });
        if (added) {
          // In homework überführen
          if (!Array.isArray(appData.homework)) appData.homework = [];
          appData.customHomework.forEach(ch => {
            if (!appData.homework.some(h => h.id === ch.id)) {
              appData.homework.push(ch);
            }
          });
          saveAppData();
          renderHomework();
        }
      }
    })
    .catch(() => {});
}

function exportHomeworkJson() {
  const exportData = {
    version: '1.9.13',
    exportDate: new Date().toISOString(),
    klasse: appData.config.klasse || 'BFW2B',
    customHomework: appData.customHomework || [],
    completedHomeworkIds: (appData.homework || []).filter(h => h.completed).map(h => h.id)
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hausaufgaben_export_${formatGermanDate(new Date()).replace(/\s+/g, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  speak('Hausaufgaben erfolgreich exportiert.', true);
}

function importHomeworkJson(event) {
  const file = event && event.target && event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      let count = 0;
      if (Array.isArray(parsed.customHomework)) {
        if (!Array.isArray(appData.customHomework)) appData.customHomework = [];
        if (!Array.isArray(appData.homework)) appData.homework = [];

        parsed.customHomework.forEach(hw => {
          if (!appData.customHomework.some(c => c.id === hw.id || (c.text === hw.text && c.dueDate === hw.dueDate))) {
            appData.customHomework.push(hw);
            appData.homework.push(hw);
            count++;
          }
        });
      }
      if (Array.isArray(parsed.completedHomeworkIds)) {
        parsed.completedHomeworkIds.forEach(id => {
          const matched = (appData.homework || []).find(h => String(h.id) === String(id));
          if (matched) matched.completed = true;
          const matchedCustom = (appData.customHomework || []).find(h => String(h.id) === String(id));
          if (matchedCustom) matchedCustom.completed = true;
        });
      }
      saveAppData();
      pushCloudHomeworkUpdate();
  syncCloudHomework();
      renderHomework();
      speak(`${count} Hausaufgabe(n) erfolgreich importiert.`, true);
      alert(`${count} Hausaufgabe(n) erfolgreich importiert.`);
    } catch (err) {
      alert('Fehler beim Importieren der Datei. Bitte überprüfe das Format.');
    }
  };
  reader.readAsText(file);
}


// =============================================================================
// INTERNET CLOUD SYNC (KLASSE & PERSÖNLICHE HAUSAUFGABEN + ERLEDIGT-STATUS)
// =============================================================================
const CLOUD_GIST_ID = 'e66b5c70ca5ea38585985e43f2976fe8';
let lastCloudSyncTime = null;
let isCloudSyncing = false;

function getCloudKeys() {
  const school = (appData.config.schoolShort || 'lwl-bk-soest').toLowerCase().replace(/[^a-z0-9]/g, '-');

  // Schuljahr dynamisch ermitteln (z.B. "2026/2027" -> "2026-2027")
  let sy = '2026-2027';
  if (appData.schoolYear && appData.schoolYear.name) {
    sy = String(appData.schoolYear.name).replace(/\//g, '-').trim();
  } else if (appData.selectedGradeSchoolYear) {
    sy = String(appData.selectedGradeSchoolYear).replace(/\//g, '-').trim();
  }

  // Klasse dynamisch ermitteln (z.B. "BFW2B")
  let kl = 'allgemein';
  if (appData.config.klasse) {
    kl = String(appData.config.klasse).trim().replace(/[^a-zA-Z0-9]/g, '');
  } else if (appData.timetable && appData.timetable.length > 0 && appData.timetable[0].klasse) {
    kl = String(appData.timetable[0].klasse).trim().replace(/[^a-zA-Z0-9]/g, '');
  }

  // Benutzername für persönliche Aufgaben und persönliche Erledigt-Haken
  const user = (appData.config.username || 'schueler').toLowerCase().replace(/[^a-z0-9]/g, '_');

  const classKey = `${school}_${sy}_${kl}`;
  const userKey = `${school}_${user}`;

  return { school, sy, kl, user, classKey, userKey };
}

function syncCloudHomework(showNotification = false) {
  if (isCloudSyncing) return;
  isCloudSyncing = true;

  const keys = getCloudKeys();

  // 1. Zuerst aus Cloud abrufen
  fetch(`https://api.github.com/gists/${CLOUD_GIST_ID}`, {
    headers: { 'Accept': 'application/vnd.github.v3+json' }
  })
    .then(r => r.json())
    .then(data => {
      let cloudContent = { classes: {}, users: {} };
      if (data && data.files && data.files['cloud_sync.json'] && data.files['cloud_sync.json'].content) {
        try {
          cloudContent = JSON.parse(data.files['cloud_sync.json'].content);
        } catch (e) {}
      }

      if (!cloudContent.classes) cloudContent.classes = {};
      if (!cloudContent.users) cloudContent.users = {};

      // A. Prüfen ob Klassenbereich bereits existiert - WENN NICHT: NEU ANLEGEN!
      if (!cloudContent.classes[keys.classKey]) {
        cloudContent.classes[keys.classKey] = {
          school: keys.school,
          schoolYear: keys.sy,
          class: keys.kl,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          homework: []
        };
      }

      // B. Prüfen ob Benutzerbereich existiert - WENN NICHT: NEU ANLEGEN!
      if (!cloudContent.users[keys.userKey]) {
        cloudContent.users[keys.userKey] = {
          school: keys.school,
          user: keys.user,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          homework: [],
          completedHomeworkIds: []
        };
      }

      // C. Lokale Daten mit Cloud-Daten zusammenführen
      const classHw = cloudContent.classes[keys.classKey].homework || [];
      const userHw = cloudContent.users[keys.userKey].homework || [];
      const completedIds = new Set(cloudContent.users[keys.userKey].completedHomeworkIds || []);

      if (!Array.isArray(appData.customHomework)) appData.customHomework = [];
      if (!Array.isArray(appData.homework)) appData.homework = [];

      // Lokale erledigte Aufgaben in die Cloud-Menge aufnehmen
      appData.homework.forEach(h => {
        if (h.completed) completedIds.add(h.id);
      });
      cloudContent.users[keys.userKey].completedHomeworkIds = Array.from(completedIds);

      // Klassen-Hausaufgaben synchronisieren
      classHw.forEach(ch => {
        const isDone = completedIds.has(ch.id);
        const existingCustom = appData.customHomework.find(c => c.id === ch.id);
        if (existingCustom) {
          existingCustom.completed = isDone;
        } else {
          appData.customHomework.push({ ...ch, completed: isDone, isCustom: true, scope: 'class' });
        }

        const existingHw = appData.homework.find(h => h.id === ch.id);
        if (existingHw) {
          existingHw.completed = isDone;
        } else {
          appData.homework.push({ ...ch, completed: isDone, isCustom: true, scope: 'class' });
        }
      });

      // Persönliche Hausaufgaben synchronisieren
      userHw.forEach(uh => {
        const isDone = completedIds.has(uh.id);
        const existingCustom = appData.customHomework.find(c => c.id === uh.id);
        if (existingCustom) {
          existingCustom.completed = isDone;
        } else {
          appData.customHomework.push({ ...uh, completed: isDone, isCustom: true, scope: 'private' });
        }

        const existingHw = appData.homework.find(h => h.id === uh.id);
        if (existingHw) {
          existingHw.completed = isDone;
        } else {
          appData.homework.push({ ...uh, completed: isDone, isCustom: true, scope: 'private' });
        }
      });

      // Eigene noch nicht in der Cloud vorhandene Aufgaben hochladen
      let cloudDirty = false;
      appData.customHomework.forEach(localHw => {
        if (localHw.scope === 'class') {
          if (!cloudContent.classes[keys.classKey].homework.some(c => c.id === localHw.id)) {
            cloudContent.classes[keys.classKey].homework.push(localHw);
            cloudDirty = true;
          }
        } else {
          if (!cloudContent.users[keys.userKey].homework.some(u => u.id === localHw.id)) {
            cloudContent.users[keys.userKey].homework.push(localHw);
            cloudDirty = true;
          }
        }
      });

      saveAppData();
      renderHomework();
      lastCloudSyncTime = new Date();

      // Wenn Änderungen vorhanden sind, im Backend sichern
      pushCloudHomeworkUpdate(cloudContent);

      if (showNotification) {
        speak('Hausaufgaben erfolgreich mit der Internet-Cloud synchronisiert.', true);
        announceSR('Hausaufgaben mit Internet synchronisiert.', 'polite');
      }
    })
    .catch(err => {
      console.warn('Cloud sync offline or error:', err);
    })
    .finally(() => {
      isCloudSyncing = false;
    });
}

function pushCloudHomeworkUpdate(cloudContent) {
  const payload = cloudContent || buildFullCloudPayload();

  // Desktop C# Backend aufrufen
  fetch('/api/cloud_sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

function buildFullCloudPayload() {
  const keys = getCloudKeys();
  const classHw = (appData.customHomework || []).filter(h => h.scope === 'class');
  const userHw = (appData.customHomework || []).filter(h => h.scope === 'private');
  const completedIds = (appData.homework || []).filter(h => h.completed).map(h => h.id);

  const payload = {
    version: '1.0',
    updatedAt: new Date().toISOString(),
    classes: {},
    users: {}
  };

  payload.classes[keys.classKey] = {
    school: keys.school,
    schoolYear: keys.sy,
    class: keys.kl,
    updatedAt: new Date().toISOString(),
    homework: classHw
  };

  payload.users[keys.userKey] = {
    school: keys.school,
    user: keys.user,
    updatedAt: new Date().toISOString(),
    homework: userHw,
    completedHomeworkIds: completedIds
  };

  return payload;
}

function toggleHomeworkCompleted(hwId) {
  const hw = (appData.homework || []).find(h => String(h.id) === String(hwId));
  if (!hw) return;
  hw.completed = !hw.completed;

  // In appData.customHomework ebenfalls aktualisieren
  if (Array.isArray(appData.customHomework)) {
    const ch = appData.customHomework.find(c => String(c.id) === String(hwId));
    if (ch) ch.completed = hw.completed;
  }

  saveAppData();
  pushCloudHomeworkUpdate();
  syncCloudHomework();
  renderHomework();
  renderUrgentNotificationBanner();
  playEarcon('done');
  speak(hw.completed ? 'Als erledigt markiert.' : 'Als nicht erledigt markiert.', false);
}

function readHomeworkSummary() {
  const filter = appData.homeworkFilter || 'classreg';
  if (filter === 'classreg') {
    const events = appData.classregEvents || [];
    if (events.length === 0) {
      speak('Es liegen aktuell keine offiziellen Klassenbucheinträge vor.', true);
      return;
    }
    let text = `Klassenbucheinträge: Du hast ${events.length} offizielle Einträge deiner Klasse BFW2B. `;
    events.forEach((ev, idx) => {
      const dObj = ev.date ? new Date(ev.date) : null;
      const dateFormatted = dObj && !isNaN(dObj) ? formatGermanDate(dObj) : '';
      text += `Eintrag ${idx + 1} vom ${dateFormatted}: Fach ${ev.subject}, Lehrkraft ${ev.teacher}: ${ev.text}. `;
    });
    speak(text, true);
    announceSR(text, 'assertive');
    return;
  }

  if (filter === 'classbook') {
    const cb = appData.classbook || [];
    let text = `Klassenbuch-Lehrstoff: Es gibt ${cb.length} dokumentierte Unterrichtsstunden. `;
    if (cb.length > 0) {
      text += `Neuester Eintrag: ${cb[0].subject || ''}, Thema: ${cb[0].topic || cb[0].text || ''}.`;
    }
    speak(text, true);
    announceSR(text, 'assertive');
    return;
  }

  const all    = appData.homework || [];
  const pending = all.filter(h => !h.completed);
  const today   = new Date(); today.setHours(0,0,0,0);
  const overdue = pending.filter(h => h.dueDate && new Date(h.dueDate) < today);

  let text = `Hausaufgaben-Übersicht: Du hast insgesamt ${all.length} Hausaufgabe${all.length !== 1 ? 'n' : ''}`;
  text += `, davon ${pending.length} ausstehend`;
  if (overdue.length > 0) text += ` und ${overdue.length} überfällig`;
  text += '. ';

  if (pending.length > 0) {
    const next = pending.sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0))[0];
    if (next) {
      const dueStr = next.dueDate ? formatGermanDate(new Date(next.dueDate)) : 'ohne Datum';
      text += `Die nächste Hausaufgabe ist ${next.subject || 'Unbekannt'}: ${next.description || ''}, fällig am ${dueStr}. `;
    }
  }

  const crCount = (appData.classregEvents || []).length;
  if (crCount > 0) text += `Es gibt außerdem ${crCount} offizielle Klassenbucheinträge.`;

  speak(text, true);
  announceSR(text, 'assertive');
}

// =============================================================================
// 9d. FEHLZEITEN RENDERN & KRANKMELDUNGEN (VOLLSTÄNDIG BARRIEREFREI WCAG 2.2 AAA)
// =============================================================================

function parseMinutesFromTimeStr(t) {
  if (!t) return 0;
  const s = String(t).trim();
  if (s.includes(':')) {
    const p = s.split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }
  const n = parseInt(s, 10);
  if (isNaN(n)) return 0;
  return Math.floor(n / 100) * 60 + (n % 100);
}

function formatAbsenceTimeClean(t) {
  if (!t) return '–';
  const s = String(t).trim();
  if (s.includes(':')) {
    const parts = s.split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  const n = parseInt(s, 10);
  if (isNaN(n)) return s;
  return `${String(Math.floor(n / 100)).padStart(2, '0')}:${String(n % 100).padStart(2, '0')}`;
}

function formatAbsenceDateReadable(abs) {
  const dRaw = abs.startDate || abs.date || abs.startDateTime;
  if (!dRaw) return '–';
  let iso = '';
  if (typeof dRaw === 'string' && dRaw.includes('-')) {
    iso = dRaw.split('T')[0].trim().slice(0, 10);
  } else {
    const sClean = String(dRaw).replace(/\D/g, '').slice(0, 8);
    if (sClean.length === 8) {
      iso = `${sClean.slice(0, 4)}-${sClean.slice(4, 6)}-${sClean.slice(6, 8)}`;
    } else {
      iso = String(dRaw);
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const parts = iso.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dt = new Date(y, m, d);

    const today = new Date();
    const isToday = (today.getFullYear() === y && today.getMonth() === m && today.getDate() === d);
    const dayName = dt.toLocaleDateString('de-DE', { weekday: 'long' });
    const dayFmt = `${String(d).padStart(2, '0')}.${String(m + 1).padStart(2, '0')}.${y}`;
    return isToday ? `${dayName}, ${dayFmt} (Heute)` : `${dayName}, ${dayFmt}`;
  }
  return String(dRaw);
}

function renderAbsences() {
  const container = document.getElementById('absences-list-container');
  if (!container) return;

  const absences = appData.absences || [];

  // Statistik-Karten aktualisieren (IDs aus index.html)
  const totalEl    = document.getElementById('stat-absence-days');
  const hoursEl    = document.getElementById('stat-absence-hours');
  const excusedEl  = document.getElementById('stat-absence-excused');
  const openEl     = document.getElementById('stat-absence-unexcused');

  const cardHours     = document.getElementById('card-stat-hours');
  const cardDays      = document.getElementById('card-stat-days');
  const cardExcused   = document.getElementById('card-stat-excused');
  const cardUnexcused = document.getElementById('card-stat-unexcused');

  let fullDays = 0;
  let partialDays = 0;
  let totalHours = 0;
  let excusedHours = 0;
  let openHours = 0;
  const dayMap = {};

  absences.forEach(a => {
    let h = 1;
    if (a.hours && typeof a.hours === 'number') {
      h = a.hours;
    } else if (a.startTime && a.endTime) {
      const sMin = parseMinutesFromTimeStr(a.startTime);
      const eMin = parseMinutesFromTimeStr(a.endTime);
      const diff = eMin - sMin;
      h = diff > 0 ? Math.max(1, Math.round(diff / 45)) : 1;
    } else {
      h = 6; // Ganztägige Fehlzeit (Standard: 6 Stunden)
    }
    totalHours += h;
    if (a.isExcused) {
      excusedHours += h;
    } else {
      openHours += h;
    }

    const dayKey = (a.startDate || a.date || '').slice(0, 10);
    if (dayKey) {
      if (!dayMap[dayKey]) dayMap[dayKey] = 0;
      dayMap[dayKey] += h;
    }
  });

  Object.values(dayMap).forEach(dayH => {
    if (dayH >= 5) fullDays += 1;
    else partialDays += 1;
  });

  if (hoursEl)   hoursEl.textContent   = String(totalHours);
  if (totalEl)   totalEl.textContent   = String(fullDays);
  if (excusedEl) excusedEl.textContent = String(excusedHours);
  if (openEl)    openEl.textContent    = String(openHours);

  if (cardHours) cardHours.setAttribute('aria-label', `Fehlstunden gesamt: ${totalHours} Stunden`);
  if (cardDays) {
    const dayLabel = fullDays === 1 ? '1 ganzer Fehltag' : `${fullDays} ganze Fehltage`;
    const partLabel = partialDays > 0 ? ` (${partialDays} Tag mit Verspätung bzw. Teil-Fehlzeit)` : '';
    cardDays.setAttribute('aria-label', `${dayLabel}${partLabel}`);
  }
  if (cardExcused) cardExcused.setAttribute('aria-label', `Entschuldigte Fehlstunden: ${excusedHours} Stunden`);
  if (cardUnexcused) cardUnexcused.setAttribute('aria-label', `Unentschuldigte Fehlstunden: ${openHours} Stunden`);

  if (absences.length === 0) {
    container.innerHTML = `
      <div class="empty-state" role="status" aria-live="polite">
        <span aria-hidden="true"><span class="emoji-icon" aria-hidden="true">✅</span></span>
        <h3 style="margin: 0; font-size: inherit; font-weight: bold;">Keine Fehlzeiten vorhanden.</h3>
        <p class="empty-hint">Fehlzeiten werden automatisch aus WebUntis geladen oder können oben mit "Krankmeldung / Fehlzeit erfassen" eingetragen werden.</p>
      </div>`;
    return;
  }

  let html = `<h3 class="section-subheading" style="margin: 18px 0 12px 0; font-size: 1.25rem;"><span class="emoji-icon" aria-hidden="true">⏱️ </span>Erfasste Fehlzeiten (${absences.length})</h3>`;
  
  absences.forEach((abs, idx) => {
    const dateStr = formatAbsenceDateReadable(abs);
    const timeStr = (abs.startTime && abs.endTime)
      ? `${formatAbsenceTimeClean(abs.startTime)} bis ${formatAbsenceTimeClean(abs.endTime)} Uhr`
      : 'Ganztägig (gesamter Schultag)';

    const statusLabel = abs.isExcused ? '<span class="emoji-icon" aria-hidden="true">🟢 </span>Entschuldigt' : '<span class="emoji-icon" aria-hidden="true">🔴 </span>Unentschuldigt / Offen';
    const statusText  = abs.isExcused ? 'Entschuldigt' : 'Unentschuldigt / Offen';
    const statusClass = abs.isExcused ? 'excused' : 'unexcused';
    const isCustom    = !!abs.isCustom;
    const hoursNum    = abs.hours || 1;

    let cleanReason = (abs.reason || '').trim();
    if (/^Abwesend ohne Grund\s*[–\-:]\s*(.+)$/i.test(cleanReason)) {
      const m = cleanReason.match(/^Abwesend ohne Grund\s*[–\-:]\s*(.+)$/i);
      if (m && m[1] && m[1].trim()) cleanReason = m[1].trim();
    }

    html += `
      <article class="absence-item ${statusClass}">
        <div class="absence-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
          <div>
            <h4 class="absence-date" style="margin: 0; font-size: 1.15rem; font-weight: bold;">
              <span class="emoji-icon" aria-hidden="true">📅 </span>${dateStr} <span style="font-weight: normal; font-size: 0.95rem; color: var(--text-secondary); margin-left: 8px;">• <span class="emoji-icon" aria-hidden="true">⏰ </span>${timeStr} (${hoursNum} Fehlstunde${hoursNum !== 1 ? 'n' : ''})</span>
            </h4>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="absence-status ${statusClass}" style="font-weight: bold;">${statusLabel}</span>
            <button type="button" class="btn btn-secondary" style="min-height: 32px; padding: 3px 8px; font-size: 0.85rem;"
                    onclick="toggleAbsenceExcusedStatus('${abs.id}')"
                    aria-label="${abs.isExcused ? 'Fehlzeit als unentschuldigt markieren' : 'Fehlzeit als entschuldigt markieren'}">
              <span>${abs.isExcused ? 'Als offen markieren' : 'Als entschuldigt markieren'}</span>
            </button>
            ${isCustom ? `
              <button type="button" class="btn btn-secondary" style="min-height: 32px; padding: 3px 8px; font-size: 0.85rem; color: var(--accent-danger);"
                      onclick="deleteCustomAbsence('${abs.id}')"
                      aria-label="Fehlzeit am ${dateStr} löschen">
                <span class="emoji-icon" aria-hidden="true">🗑️ </span>Löschen
              </button>
            ` : ''}
          </div>
        </div>
        ${abs.subject ? `<div style="margin-top: 6px;"><span class="absence-subject"><span class="emoji-icon" aria-hidden="true">📘 </span>Fach: ${escHtml(abs.subject)}</span></div>` : ''}
        ${cleanReason ? `<div style="margin-top: 6px;"><span class="absence-reason"><strong>Grund:</strong> ${escHtml(cleanReason)}</span></div>` : ''}
      </article>`;
  });

  container.innerHTML = html;
}

// Dialog zur Erfassung einer neuen Krankmeldung / Fehlzeit öffnen/schließen
function toggleAbsenceComposer(show) {
  const card = document.getElementById('absence-composer-card');
  if (!card) return;
  const isCurrentlyOpen = (card.style.display !== 'none');
  const shouldOpen = (show !== undefined) ? show : !isCurrentlyOpen;

  card.style.display = shouldOpen ? 'block' : 'none';

  if (shouldOpen) {
    playEarcon('open');
    const todayIso = new Date().toISOString().slice(0, 10);
    const startInput = document.getElementById('absence-start-date');
    const endInput   = document.getElementById('absence-end-date');
    if (startInput && !startInput.value) startInput.value = todayIso;
    if (endInput && !endInput.value) endInput.value = todayIso;

    setTimeout(() => {
      if (startInput) startInput.focus();
    }, 50);
    announceSR('Formular für Krankmeldung und Fehlzeit geöffnet. Trage hier deine Fehlzeit ein.', 'polite');
  } else {
    playEarcon('delete');
    const toggleBtn = document.getElementById('btn-compose-absence-toggle');
    if (toggleBtn) toggleBtn.focus();
    announceSR('Formular geschlossen.', 'polite');
  }
}

function handleAbsenceTypeChange(val) {
  const customDiv = document.getElementById('absence-custom-times');
  if (customDiv) {
    customDiv.style.display = (val === 'custom') ? 'grid' : 'none';
  }
}

// Neue Fehlzeit / Krankmeldung speichern
async function handleReportAbsenceSubmit(event) {
  if (event) event.preventDefault();
  const startInput = document.getElementById('absence-start-date');
  const endInput   = document.getElementById('absence-end-date');
  const reasonSel  = document.getElementById('absence-reason-select');
  const typeSel    = document.getElementById('absence-type-select');
  const startTInput= document.getElementById('absence-start-time');
  const endTInput  = document.getElementById('absence-end-time');
  const noteInput  = document.getElementById('absence-note');
  const sendMsgChk = document.getElementById('absence-send-message');

  const startDate = startInput ? startInput.value : '';
  const endDate   = (endInput && endInput.value) ? endInput.value : startDate;
  const reasonVal = reasonSel ? reasonSel.value : 'Krankheit';
  const noteVal   = noteInput ? noteInput.value.trim() : '';
  const isFullDay = (typeSel && typeSel.value === 'full');
  const startTime = isFullDay ? '07:45' : (startTInput ? startTInput.value : '07:45');
  const endTime   = isFullDay ? '15:10' : (endTInput ? endTInput.value : '15:10');

  if (!startDate) {
    alert('Bitte gib mindestens ein Startdatum an.');
    return;
  }

  const sMin = parseMinutesFromTimeStr(startTime);
  const eMin = parseMinutesFromTimeStr(endTime);
  const duration = Math.max(1, Math.round((eMin - sMin) / 45));

  const newAbs = {
    id: 'custom-abs-' + Date.now(),
    startDate: startDate,
    endDate: endDate,
    startTime: startTime,
    endTime: endTime,
    reason: noteVal ? `${reasonVal}: ${noteVal}` : reasonVal,
    isExcused: false,
    isCustom: true,
    hours: isFullDay ? 6 : duration
  };

  // Lokal in localStorage persistieren
  try {
    const list = JSON.parse(localStorage.getItem('webuntis_custom_absences') || '[]');
    list.unshift(newAbs);
    localStorage.setItem('webuntis_custom_absences', JSON.stringify(list));
  } catch (e) { }

  // Im aktuellen Datenbestand hinzufügen
  if (!appData.absences) appData.absences = [];
  appData.absences.unshift(newAbs);
  appData.absences.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

  playEarcon('save');

  // Optional: Mitteilung an die Klassenlehrkraft senden
  if (sendMsgChk && sendMsgChk.checked) {
    try {
      const studentName = (appData.config && appData.config.username) ? appData.config.username : 'Schüler';
      const msgSubj = `Krankmeldung / Fehlzeit (${startDate})`;
      const msgBody = `Guten Tag,\n\nhiermit melde ich eine Fehlzeit für den Zeitraum von ${startDate} bis ${endDate}.\nGrund: ${reasonVal}${noteVal ? '\nHinweis: ' + noteVal : ''}\n\nMit freundlichen Grüßen,\n${studentName}`;
      if (typeof handleSendMessageDirect === 'function') {
        await handleSendMessageDirect(msgSubj, msgBody);
      }
    } catch (e) { }
  }

  // Formular zurücksetzen & schließen
  toggleAbsenceComposer(false);
  renderAbsences();
  announceSR(`Fehlzeit für ${startDate} erfolgreich erfasst und gespeichert.`, 'assertive');
}

// Fehlzeit löschen
function deleteCustomAbsence(id) {
  if (!confirm('Möchtest du diese erfasste Fehlzeit wirklich löschen?')) return;
  try {
    let list = JSON.parse(localStorage.getItem('webuntis_custom_absences') || '[]');
    list = list.filter(a => a.id !== id);
    localStorage.setItem('webuntis_custom_absences', JSON.stringify(list));
  } catch (e) { }

  if (appData.absences) {
    appData.absences = appData.absences.filter(a => a.id !== id);
  }
  playEarcon('delete');
  renderAbsences();
  announceSR('Fehlzeit wurde gelöscht.', 'polite');
}

// Status Entschuldigt / Unentschuldigt umschalten
function toggleAbsenceExcusedStatus(id) {
  if (!appData.absences) return;
  const abs = appData.absences.find(a => a.id === id);
  if (!abs) return;

  abs.isExcused = !abs.isExcused;

  // In custom absences aktualisieren falls vorhanden
  try {
    let list = JSON.parse(localStorage.getItem('webuntis_custom_absences') || '[]');
    const cItem = list.find(a => a.id === id);
    if (cItem) {
      cItem.isExcused = abs.isExcused;
      localStorage.setItem('webuntis_custom_absences', JSON.stringify(list));
    }
  } catch (e) { }

  // Im Cache sichern
  try {
    localStorage.setItem('webuntis_cached_absences', JSON.stringify(appData.absences));
  } catch (e) { }

  playEarcon('done');
  renderAbsences();
  const stateText = abs.isExcused ? 'entschuldigt' : 'unentschuldigt / offen';
  announceSR(`Status für Fehlzeit am ${formatAbsenceDateReadable(abs)} auf ${stateText} geändert.`, 'polite');
}

function readAbsencesSummary() {
  const absences = appData.absences || [];

  let fullDays = 0;
  let partialDays = 0;
  let totalHours = 0;
  let excusedHours = 0;
  let openHours = 0;
  const dayMap = {};

  absences.forEach(a => {
    let h = 1;
    if (a.hours && typeof a.hours === 'number') {
      h = a.hours;
    } else if (a.startTime && a.endTime) {
      const sMin = parseMinutesFromTimeStr(a.startTime);
      const eMin = parseMinutesFromTimeStr(a.endTime);
      const diff = eMin - sMin;
      h = diff > 0 ? Math.max(1, Math.round(diff / 45)) : 1;
    } else {
      h = 6;
    }
    totalHours += h;
    if (a.isExcused) {
      excusedHours += h;
    } else {
      openHours += h;
    }

    const dayKey = (a.startDate || a.date || '').slice(0, 10);
    if (dayKey) {
      if (!dayMap[dayKey]) dayMap[dayKey] = 0;
      dayMap[dayKey] += h;
    }
  });

  Object.values(dayMap).forEach(dayH => {
    if (dayH >= 5) fullDays += 1;
    else partialDays += 1;
  });

  const total = absences.length;
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayAbsences = absences.filter(a => (a.startDate || a.date || '').slice(0, 10) === todayIso);

  let text = `Fehlzeiten-Übersicht: Du hast insgesamt ${totalHours} Fehlstunde${totalHours !== 1 ? 'n' : ''} und ${fullDays} ganze Fehltag${fullDays !== 1 ? 'e' : ''}`;
  if (partialDays > 0 && fullDays === 0) {
    text += ` (${partialDays} Tag mit Verspätung bzw. Teil-Fehlzeit)`;
  }
  if (totalHours > 0) {
    text += `, davon ${excusedHours} Stunden entschuldigt und ${openHours} Stunden unentschuldigt oder offen`;
  }
  text += '. ';

  if (todayAbsences.length > 0) {
    text += `Wichtig für heute: Es liegt eine Verspätung bzw. Fehlzeit von `;
    todayAbsences.forEach(ta => {
      const h = ta.hours || 1;
      text += `${h} Stunde${h !== 1 ? 'n' : ''} vor (${ta.startTime || ''} bis ${ta.endTime || ''} Uhr). Grund: ${ta.reason || 'Krank'}. Status: ${ta.isExcused ? 'Entschuldigt' : 'Noch unentschuldigt'}. `;
    });
  }

  if (openHours > 0) {
    text += `Du hast aktuell noch ${openHours} unentschuldigte Fehlstunde${openHours !== 1 ? 'n' : ''}. Reiche zeitnah eine Entschuldigung ein.`;
  } else if (total > 0) {
    text += 'Alle deine erfassten Fehlzeiten sind vollständig entschuldigt.';
  } else {
    text += 'Es liegen keine Fehlzeiten vor.';
  }

  speak(text, true);
}

// =============================================================================
// 9e. DRINGLICHKEITS- & COUNTDOWN-BANNER (FEATURE 4)
// =============================================================================
function renderUrgentNotificationBanner() {
  const card = document.getElementById('urgent-notifications-card');
  const grid = document.getElementById('urgent-items-grid');
  const summaryEl = document.getElementById('urgent-card-summary');
  if (!card || !grid) return;

  const homework = (appData.homework || []).filter(h => !h.completed);
  const exams = (appData.exams || []);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const overdueHw = [];
  const soonHw = [];

  homework.forEach(hw => {
    if (!hw.dueDate) return;
    const dParts = hw.dueDate.split('-');
    if (dParts.length !== 3) return;
    const due = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      overdueHw.push({ ...hw, diffDays });
    } else if (diffDays <= 7) {
      soonHw.push({ ...hw, diffDays });
    }
  });

  // Nächste anstehende Klausuren im Schuljahr
  const upcomingExams = exams.map(ex => {
    if (!ex.date) return null;
    const dParts = ex.date.split('-');
    if (dParts.length !== 3) return null;
    const exDate = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
    const diffDays = Math.ceil((exDate - now) / (1000 * 60 * 60 * 24));
    return { ...ex, exDate, diffDays };
  }).filter(ex => ex && ex.diffDays >= 0).sort((a, b) => a.diffDays - b.diffDays);

  const nextExam = upcomingExams.length > 0 ? upcomingExams[0] : null;

  const messages = appData.messages || [];
  const activeNews = messages.filter(m => m.type === 'news' || m.type === 'inbox');
  const classregEvents = appData.classregEvents || [];

  // Wenn keine offenen Aufgaben, keine anstehende Klausur, keine Mitteilungen und keine Klassenbucheinträge existieren, ausblenden
  if (homework.length === 0 && !nextExam && activeNews.length === 0 && classregEvents.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';

  // Text-Zusammenfassung generieren
  const summaryParts = [];
  if (classregEvents.length > 0) {
    summaryParts.push(`<span class="emoji-icon" aria-hidden="true">📋 </span>${classregEvents.length} offizielle Klassenbucheinträge`);
  }
  if (activeNews.length > 0) {
    summaryParts.push(`<span class="emoji-icon" aria-hidden="true">📢 </span>${activeNews.length} Schulinformation / Mitteilung`);
  }
  if (overdueHw.length > 0) {
    summaryParts.push(`<span class="emoji-icon" aria-hidden="true">🚨 </span>${overdueHw.length} überfällige Aufgabe${overdueHw.length > 1 ? 'n' : ''}`);
  }
  if (soonHw.length > 0) {
    summaryParts.push(`<span class="emoji-icon" aria-hidden="true">⏳ </span>${soonHw.length} anstehende Frist${soonHw.length > 1 ? 'en' : ''} in den nächsten 7 Tagen`);
  }
  if (nextExam) {
    const daysLabel = nextExam.diffDays === 0 ? 'Heute!' : (nextExam.diffDays === 1 ? 'Morgen!' : `in ${nextExam.diffDays} Tagen`);
    summaryParts.push(`<span class="emoji-icon" aria-hidden="true">📝 </span>Nächste Klausur: ${nextExam.subject || 'Klausur'} (${daysLabel})`);
  }
  if (summaryEl) {
    summaryEl.innerHTML = summaryParts.join(' • ') || 'Aktuelle Fristenübersicht aus WebUntis.';
  }

  // Grid-Karten aufbauen
  let itemsHtml = '';

  // 0a. Offizielle Klassenbucheinträge
  classregEvents.forEach(ev => {
    const dObj = ev.date ? new Date(ev.date) : null;
    const dateFormatted = dObj && !isNaN(dObj) ? formatGermanDate(dObj) : (ev.date || 'Aktuell');
    itemsHtml += `
      <div class="urgent-item" style="border-left: 6px solid #2563eb;" tabindex="0" role="article" aria-label="Klassenbucheintrag: ${escHtml(ev.text)}">
        <div class="urgent-item-header">
          <span class="urgent-badge" style="background: #dbeafe; color: #1e40af;"><span class="emoji-icon" aria-hidden="true">📋 </span>Klassenbucheintrag</span>
          <span class="field-hint" style="font-weight: bold;">${escHtml(dateFormatted)}${ev.timeStr ? ' • ' + escHtml(ev.timeStr) : ''}</span>
        </div>
        <div>
          <h4 class="urgent-item-subject">${escHtml(ev.subject || 'Klassenbuch')} (${escHtml(ev.klasse || 'BFW2B')})</h4>
          <p class="urgent-item-desc">${escHtml(ev.text)}</p>
        </div>
        <button type="button" class="btn btn-secondary urgent-action-btn" onclick="switchTab('homework'); setHomeworkFilter('classreg');" aria-label="Zu den Klassenbucheinträgen wechseln">
          <span><span class="emoji-icon" aria-hidden="true">📋 </span>Zu den Klassenbucheinträgen</span>
        </button>
      </div>`;
  });

  // 0b. Schulinformationen / Tagesnachrichten
  activeNews.forEach(msg => {
    const isNews = msg.type === 'news';
    const badgeLabel = isNews ? '<span class="emoji-icon" aria-hidden="true">📢 </span>Tagesnachricht' : '<span class="emoji-icon" aria-hidden="true">💬 </span>Neue Mitteilung';
    const dateFormatted = msg.date ? formatGermanDate(new Date(msg.date)) : 'Aktuell';
    itemsHtml += `
      <div class="urgent-item" style="border-left: 6px solid #eab308;" tabindex="0" role="article" aria-label="${badgeLabel}: ${escHtml(msg.subject || 'Nachricht')}">
        <div class="urgent-item-header">
          <span class="urgent-badge" style="background: #fef08a; color: #854d0e;">${badgeLabel}</span>
          <span class="field-hint" style="font-weight: bold;">${escHtml(dateFormatted)}</span>
        </div>
        <div>
          <h4 class="urgent-item-subject">${escHtml(msg.subject || 'Schulinformation')}</h4>
          <p class="urgent-item-desc">${escHtml(msg.text || msg.body || '')}</p>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
          <button type="button" class="btn btn-secondary urgent-action-btn" onclick="switchTab('messages')" aria-label="Zu den Mitteilungen wechseln">
            <span><span class="emoji-icon" aria-hidden="true">💬 </span>Zur Mitteilung</span>
          </button>
          <button type="button" class="btn btn-danger urgent-action-btn" onclick="deleteMessage('${msg.id}')" aria-label="Mitteilung ${escHtml(msg.subject || '')} löschen">
            <span><span class="emoji-icon" aria-hidden="true">🗑️ </span>Löschen</span>
          </button>
        </div>
      </div>`;
  });

  // 1. Überfällige Hausaufgaben
  overdueHw.forEach(hw => {
    const daysOverdue = Math.abs(hw.diffDays);
    const dateFormatted = formatGermanDate(new Date(hw.dueDate));
    itemsHtml += `
      <div class="urgent-item overdue" tabindex="0" role="article" aria-label="Überfällige Hausaufgabe in ${escHtml(hw.subject || 'Hausaufgabe')}">
        <div class="urgent-item-header">
          <span class="urgent-badge overdue"><span class="emoji-icon" aria-hidden="true">🚨 </span>Überfällig (seit ${daysOverdue} Tag${daysOverdue === 1 ? '' : 'en'})</span>
          <span class="field-hint" style="font-weight: bold;">${escHtml(dateFormatted)}</span>
        </div>
        <div>
          <h4 class="urgent-item-subject">${escHtml(hw.subject || 'Hausaufgabe')}</h4>
          <p class="urgent-item-desc">${escHtml(hw.text || 'Hausaufgabe ohne Text')}</p>
        </div>
        <button type="button" class="btn btn-secondary urgent-action-btn" onclick="switchTab('homework')" aria-label="Zu den Hausaufgaben wechseln">
          <span><span class="emoji-icon" aria-hidden="true">📚 </span>Zu den Hausaufgaben</span>
        </button>
      </div>`;
  });

  // 2. Anstehende Hausaufgaben
  soonHw.forEach(hw => {
    const dText = hw.diffDays === 0 ? 'Heute fällig!' : (hw.diffDays === 1 ? 'Morgen fällig!' : `In ${hw.diffDays} Tagen fällig`);
    const dateFormatted = formatGermanDate(new Date(hw.dueDate));
    itemsHtml += `
      <div class="urgent-item due-soon" tabindex="0" role="article" aria-label="Anstehende Hausaufgabe in ${escHtml(hw.subject || 'Hausaufgabe')}, ${dText}">
        <div class="urgent-item-header">
          <span class="urgent-badge due-soon"><span class="emoji-icon" aria-hidden="true">⏳ </span>${dText}</span>
          <span class="field-hint" style="font-weight: bold;">${escHtml(dateFormatted)}</span>
        </div>
        <div>
          <h4 class="urgent-item-subject">${escHtml(hw.subject || 'Hausaufgabe')}</h4>
          <p class="urgent-item-desc">${escHtml(hw.text || 'Hausaufgabe ohne Text')}</p>
        </div>
        <button type="button" class="btn btn-secondary urgent-action-btn" onclick="switchTab('homework')" aria-label="Zu den Hausaufgaben wechseln">
          <span><span class="emoji-icon" aria-hidden="true">📚 </span>Zu den Hausaufgaben</span>
        </button>
      </div>`;
  });

  // 3. Nächste Klausur mit Live-Countdown
  if (nextExam) {
    const dText = nextExam.diffDays === 0 ? 'Heute!' : (nextExam.diffDays === 1 ? 'Morgen!' : `Noch ${nextExam.diffDays} Tage`);
    const dateFormatted = formatGermanDate(new Date(nextExam.date));
    const timeFormatted = `${nextExam.startTime || '07:45'} - ${nextExam.endTime || '09:15'} Uhr`;
    itemsHtml += `
      <div class="urgent-item exam-countdown" tabindex="0" role="article" aria-label="Nächste Klausur in ${escHtml(nextExam.subject)}, ${dText}">
        <div class="urgent-item-header">
          <span class="urgent-badge exam"><span class="emoji-icon" aria-hidden="true">📝 </span>Klausur-Countdown</span>
          <span class="urgent-badge exam" style="background: rgba(124,58,237,0.25); color: var(--text-primary); border: 1.5px solid #7c3aed;"><span class="emoji-icon" aria-hidden="true">⏳ </span>${dText}</span>
        </div>
        <div>
          <h4 class="urgent-item-subject">${escHtml(nextExam.subject)}</h4>
          <p class="urgent-item-desc">
            <span class="emoji-icon" aria-hidden="true">📅 </span>${escHtml(dateFormatted)} • <span class="emoji-icon" aria-hidden="true">⏰ </span>${escHtml(timeFormatted)}<br>
            <span class="emoji-icon" aria-hidden="true">👨</span>‍<span class="emoji-icon" aria-hidden="true">🏫 </span>${escHtml(nextExam.teacher || 'Fachlehrkraft')} • <span class="emoji-icon" aria-hidden="true">🚪 </span>${escHtml(nextExam.room || 'Raum laut Plan')}
          </p>
        </div>
        <button type="button" class="btn btn-secondary urgent-action-btn" onclick="switchTab('exams')" aria-label="Zum Prüfungskalender wechseln">
          <span><span class="emoji-icon" aria-hidden="true">📝 </span>Zum Prüfungskalender</span>
        </button>
      </div>`;
  }

  // 4. Fehlzeiten-Warnung bei unentschuldigten Fehlstunden
  const absences = appData.absences || [];
  const unexcused = absences.filter(a => !a.isExcused && !a.excused);
  if (unexcused.length > 0) {
    itemsHtml += `
      <div class="urgent-item overdue" tabindex="0" role="article" aria-label="Warnung: ${unexcused.length} unentschuldigte Fehlzeiten">
        <div class="urgent-item-header">
          <span class="urgent-badge overdue"><span class="emoji-icon" aria-hidden="true">⚠️ </span>Unentschuldigte Fehlzeit</span>
          <span class="field-hint" style="font-weight: bold;">Handlungsbedarf</span>
        </div>
        <div>
          <h4 class="urgent-item-subject">${unexcused.length} Fehlzeit${unexcused.length > 1 ? 'en' : ''} noch offen</h4>
          <p class="urgent-item-desc">Bitte reiche zeitnah eine Entschuldigung oder Bescheinigung beim Klassenlehrer ein.</p>
        </div>
        <button type="button" class="btn btn-secondary urgent-action-btn" onclick="switchTab('absences')" aria-label="Zu den Fehlzeiten wechseln">
          <span><span class="emoji-icon" aria-hidden="true">⏱️ </span>Zu den Fehlzeiten</span>
        </button>
      </div>`;
  }

  grid.innerHTML = itemsHtml;
}

function getLessonsForSelectedDay() {
  const currentWeekMo = getBaseMonday();
  const currentWeekMoKey = formatDateToUntis(currentWeekMo);
  const currentWeekLessons = (appData.timetableCache && appData.timetableCache[currentWeekMoKey] && appData.timetableCache[currentWeekMoKey].length > 0)
    ? appData.timetableCache[currentWeekMoKey]
    : (appData.timetable || []);

  const jsDay = new Date().getDay();
  const dayIndex = (jsDay >= 1 && jsDay <= 5) ? jsDay : 1;
  return currentWeekLessons.filter(l => l.day === dayIndex).sort((a, b) => a.period - b.period);
}

function readCombinedOverview() {
  const homework = (appData.homework || []).filter(h => !h.completed);
  const exams = appData.exams || [];
  const messages = appData.messages || [];
  const absences = appData.absences || [];
  const activeNews = messages.filter(m => m.type === 'news' || m.type === 'inbox');
  const unexcused = absences.filter(a => !a.isExcused && !a.excused);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let overdue = 0;
  let soon = 0;
  homework.forEach(h => {
    if (!h.dueDate) return;
    const p = h.dueDate.split('-');
    if (p.length !== 3) return;
    const due = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    const diff = Math.ceil((due - now) / 86400000);
    if (diff < 0) overdue++;
    else if (diff <= 7) soon++;
  });

  const upcomingExams = exams.map(ex => {
    if (!ex.date) return null;
    const p = ex.date.split('-');
    if (p.length !== 3) return null;
    const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return { ...ex, diff: Math.ceil((d - now) / 86400000) };
  }).filter(e => e && e.diff >= 0).sort((a, b) => a.diff - b.diff);

  const nextEx = upcomingExams[0];

  let speech = 'Zentrale Übersicht: Tagesnachrichten, Warnungen und Fristen. ';

  const classreg = appData.classregEvents || [];
  if (classreg.length > 0) {
    speech += `Du hast ${classreg.length} offizielle Klassenbucheinträge deiner Klasse ${appData.config.klasse || 'BFW2B'}. `;
  }

  if (activeNews.length > 0) {
    speech += `Du hast ${activeNews.length} Schulinformation${activeNews.length > 1 ? 'en oder Mitteilungen' : ' oder Mitteilung'}. `;
    activeNews.slice(0, 2).forEach(n => {
      const senderInfo = n.type === 'news' ? 'Tagesnachricht der Schule' : 'Mitteilung von ' + (n.sender || 'Lehrkraft');
      speech += `${senderInfo}: ${n.subject}. `;
    });
  }

  if (overdue > 0) {
    speech += `Achtung: Du hast ${overdue} überfällige Hausaufgabe${overdue > 1 ? 'n' : ''}. `;
  }
  if (soon > 0) {
    speech += `In den nächsten 7 Tagen stehen ${soon} Hausaufgabe${soon > 1 ? 'n' : ''} an. `;
  }
  if (nextEx) {
    const daysStr = nextEx.diff === 0 ? 'heute' : (nextEx.diff === 1 ? 'morgen' : `in ${nextEx.diff} Tagen`);
    speech += `Deine nächste Klausur ist ${nextEx.subject} ${daysStr}, am ${formatGermanDate(new Date(nextEx.date))}. `;
  }
  if (unexcused.length > 0) {
    speech += `Hinweis: Es liegen ${unexcused.length} unentschuldigte Fehlzeiten vor. `;
  }

  if (activeNews.length === 0 && overdue === 0 && soon === 0 && !nextEx && unexcused.length === 0 && classreg.length === 0) {
    speech += 'Aktuell sind keine dringenden Aufgaben oder Warnungen erfasst. ';
  }

  // Aktueller Unterrichts-Status
  const lessons = getLessonsForSelectedDay();
  if (lessons && lessons.length > 0) {
    speech += `Heute hast du ${lessons.length} Unterrichtsstunden laut Plan. Drücke Taste 2, um zum Stundenplan zu wechseln.`;
  }

  speak(speech, true);
  announceSR(speech, 'assertive');
}

function readUrgentSummary() {
  readCombinedOverview();
}

function triggerDesktopNotification() {
  const homework = (appData.homework || []).filter(h => !h.completed);
  const exams = appData.exams || [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const upcomingExams = exams.map(ex => {
    if (!ex.date) return null;
    const p = ex.date.split('-');
    if (p.length !== 3) return null;
    const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return { ...ex, diff: Math.ceil((d - now) / 86400000) };
  }).filter(e => e && e.diff >= 0).sort((a, b) => a.diff - b.diff);

  const nextEx = upcomingExams[0];
  let msg = `${homework.length} offene Aufgabe${homework.length === 1 ? '' : 'n'}`;
  if (nextEx) {
    msg += ` • Nächste Klausur: ${nextEx.subject} in ${nextEx.diff} Tagen (${nextEx.date})`;
  }

  fetch(`/api/notify?title=${encodeURIComponent('LWL Stundenplan & Prüfungen')}&msg=${encodeURIComponent(msg)}`).catch(() => {});
}

// =============================================================================
// 10. INITIALISIERUNG & TASTEN-STEUERUNG
// =============================================================================
function initApp() {
  loadAppData();
  syncCloudHomework();
  setInterval(() => syncCloudHomework(false), 2.5 * 60 * 1000);
  updateTodayBadge();

  // 1. Tastatur- und Screenreader-Steuerung bereitstellen

  // 2. Kein versehentliches Beenden bei Tabwechsel oder Neuladen
  // (Server bleibt stabil und dauerhaft aktiv)

  // 3. Kontinuierlicher Heartbeat alle 2.5 Sekunden mit Sichtbarkeitsstatus
  function sendHeartbeat() {
    const vis = document.visibilityState || 'visible';
    fetch('/api/ping?v=' + encodeURIComponent(vis)).catch(() => {});
  }
  setInterval(sendHeartbeat, 2500);
  document.addEventListener('visibilitychange', sendHeartbeat);
  sendHeartbeat();

  // Tastaturnavigation
  window.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      openAddHomeworkModal();
    } else if (e.key === 'Escape') {
      const hwModal = document.getElementById('modal-add-homework');
      if (hwModal && hwModal.style.display !== 'none') {
        e.preventDefault();
        closeAddHomeworkModal();
        return;
      }
    }
    if (e.key === '1') {
      e.preventDefault();
      switchTab('overview');
    } else if (e.key === '2') {
      e.preventDefault();
      switchTab('timetable');
    } else if (e.key === '3') {
      e.preventDefault();
      switchTab('exams');
    } else if (e.key === '4') {
      e.preventDefault();
      switchTab('homework');
    } else if (e.key === '5') {
      e.preventDefault();
      switchTab('absences');
    } else if (e.key === '6') {
      e.preventDefault();
      switchTab('messages');
    } else if (e.key === '7') {
      e.preventDefault();
      switchTab('grades');
    } else if (e.key === '8') {
      e.preventDefault();
      if (isSoestCampusSchool()) {
        switchTab('canteen');
      } else {
        switchTab('settings');
      }
    } else if (e.key === '9') {
      e.preventDefault();
      if (isSoestCampusSchool()) {
        switchTab('settings');
      }
    } else if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      setDayFilter('today');
    } else if (e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      resetWeekOffset();
    } else if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      changeWeekOffset(-1);
    } else if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      changeWeekOffset(1);
    } else if (e.key === 'v' || e.key === 'V') {
      e.preventDefault();
      // Vorlesen kontextabhängig je nach aktivem Tab und Modal
      const modal = document.getElementById('modal-lesson-details');
      const gradeModal = document.getElementById('modal-add-grade');
      if (modal && modal.style.display !== 'none') {
        speakCurrentLessonDetails();
      } else if (gradeModal && gradeModal.style.display !== 'none') {
        speak('Klausurnote eintragen Dialog geöffnet.', true);
      } else if (currentTab === 'overview') {
        readCombinedOverview();
      } else if (currentTab === 'timetable') {
        readTodayTimetable();
      } else if (currentTab === 'exams') {
        readAllExamsAndEvents();
      } else if (currentTab === 'homework') {
        readHomeworkSummary();
      } else if (currentTab === 'absences') {
        readAbsencesSummary();
      } else if (currentTab === 'messages') {
        readMessagesSummary();
      } else if (currentTab === 'grades') {
        readGradesSummary();
      } else if (currentTab === 'canteen') {
        readCanteenSummary();
      }
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      if (currentTab === 'canteen') {
        refreshCanteenData();
      } else {
        triggerManualSync();
      }
    } else if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      if (currentTab !== 'absences') {
        switchTab('absences');
      }
      toggleAbsenceComposer(true);
    } else if (e.key === 'Escape') {
      closeLessonDetails();
      closeGradeModal();
      toggleMessageComposer(false);
      toggleAbsenceComposer(false);
    }
  });


  // Automatische Anmeldung & Synchronisation beim Start
  if (appData.config.username && appData.config.password) {
    hideLoginView();
    updateWeekAndDayLabels();
    renderTimetable();
    renderExams();
    renderHomework();
    renderAbsences();
    renderMessagesView();
    renderGradesView();
    renderCanteenView();
    renderUrgentNotificationBanner();
    updateCurrentAndNextLesson();
    performWebUntisSync();
  } else {
    showLoginView();
  }

  // Automatischer Hintergrund-Refresh alle 5 Minuten
  if (autoSyncIntervalTimer) clearInterval(autoSyncIntervalTimer);
  autoSyncIntervalTimer = setInterval(() => {
    if (appData.config.username && appData.config.password) {
      performWebUntisSync();
    }
  }, 5 * 60 * 1000);

  // Wenn der Benutzer zum Fenster zurückkehrt (Fokus), prüfen ob Refresh nötig
  window.addEventListener('focus', () => {
    if (lastSyncTimestamp && (Date.now() - lastSyncTimestamp.getTime() > 3 * 60 * 1000)) {
      if (appData.config.username && appData.config.password) {
        performWebUntisSync();
      }
    }
  });

  // Version von lokalem Server abfragen
  fetchInstalledVersion();

  // Feedback-Archiv initial laden
  loadFeedbackArchive();
}

async function fetchInstalledVersion() {
  try {
    const res = await fetch('/api/version');
    const data = await res.json();
    const verEl = document.getElementById('app-version-display');
    if (verEl && data.version) {
      verEl.textContent = `v${data.version}`;
    }
  } catch (e) { }
}

async function checkSoftwareUpdate() {
  const btn = document.getElementById('btn-check-update');
  const box = document.getElementById('update-result-box');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="emoji-icon">⏳</span> <strong>Prüfe auf GitHub...</strong>';
  }
  announceSR('Prüfe auf GitHub nach neuen Updates...', 'polite');

  try {
    const res = await fetch('/api/update/check');
    const data = await res.json();
    if (box) {
      box.style.display = 'block';
      if (data.updated) {
        box.innerHTML = `
          <div style="background: rgba(21, 128, 61, 0.15); border: 2px solid var(--accent-ok); border-radius: 8px; padding: 14px;">
            <strong style="color: var(--accent-ok);"><span class="emoji-icon" aria-hidden="true">🎉 </span>Neues Update erfolgreich heruntergeladen!</strong>
            <p style="margin-top: 6px; font-size: 14px;">Version ${data.currentVersion} wurde installiert. Die Seite wird jetzt neu geladen...</p>
          </div>
        `;
        announceSR(`Ein neues Update auf Version ${data.currentVersion} wurde installiert. Seite lädt neu.`, 'assertive');
        setTimeout(() => { window.location.reload(); }, 2000);
      } else {
        box.innerHTML = `
          <div style="background: rgba(2, 132, 199, 0.1); border: 2px solid var(--accent-info); border-radius: 8px; padding: 14px;">
            <strong style="color: var(--accent-info);"><span class="emoji-icon" aria-hidden="true">✅ </span>Alles auf dem neuesten Stand!</strong>
            <p style="margin-top: 6px; font-size: 14px;">Du nutzt bereits die aktuellste Version ${data.currentVersion}.</p>
          </div>
        `;
        announceSR(`Du nutzt bereits die aktuellste Version ${data.currentVersion}. Keine Updates verfügbar.`, 'polite');
      }
    }
  } catch (e) {
    if (box) {
      box.style.display = 'block';
      box.innerHTML = `
        <div style="background: rgba(185, 28, 28, 0.1); border: 2px solid var(--accent-danger); border-radius: 8px; padding: 14px;">
          <strong style="color: var(--accent-danger);"><span class="emoji-icon" aria-hidden="true">⚠️ </span>Update-Prüfung fehlgeschlagen</strong>
          <p style="margin-top: 6px; font-size: 14px;">GitHub konnte nicht erreicht werden. Bitte prüfe deine Internetverbindung.</p>
        </div>
      `;
    }
    announceSR('Update-Prüfung fehlgeschlagen. Keine Verbindung zu GitHub.', 'assertive');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="emoji-icon" aria-hidden="true">🔍 </span><strong>Jetzt auf Updates prüfen</strong>';
    }
  }
}

// =============================================================================
// 11. FEEDBACK-SYSTEM & IN-APP ARCHIV
// =============================================================================
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendUserFeedback(e) {
  if (e && e.preventDefault) e.preventDefault();

  const catEl = document.getElementById('feedback-category');
  const authorEl = document.getElementById('feedback-author');
  const emailEl = document.getElementById('feedback-email');
  const textEl = document.getElementById('feedback-text');
  const statusBox = document.getElementById('feedback-status-box');
  const submitBtn = document.getElementById('btn-submit-feedback');

  if (!textEl || !textEl.value.trim()) {
    announceSR('Bitte gib eine Nachricht für dein Feedback ein.', 'assertive');
    return;
  }

  const category = catEl ? catEl.value : '<span class="emoji-icon" aria-hidden="true">💡 </span>Vorschlag / Feedback';
  const rawAuthor = (authorEl && authorEl.value.trim()) ? authorEl.value.trim() : '';
  // NUR wenn der Nutzer ausdrücklich einen Namen eingegeben hat, wird dieser übertragen.
  // Sonst anonym - der WebUntis-Benutzername wird NICHT übertragen!
  const author = rawAuthor || 'Anonym';
  const email = (emailEl && emailEl.value.trim()) ? emailEl.value.trim() : 'Keine E-Mail angegeben';
  const message = textEl.value.trim();
  const now = new Date().toLocaleString('de-DE');
  const appVer = document.getElementById('app-version-display') ? document.getElementById('app-version-display').textContent : 'v1.3.2';

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="emoji-icon">⏳</span> <strong>Wird gesendet...</strong>';
  }

  const payload = {
    _subject: `Stundenplan LWL: ${category} von ${author}`,
    _template: 'table',
    _captcha: 'false',
    Absender: author,
    Kategorie: category,
    Email: email,
    Nachricht: message,
    Datum: now,
    AppVersion: appVer,
    Schule: appData.config.schoolName || 'LWL-Berufskolleg Soest'
  };

  try {
    // 1. Lokaler Server (speichert in Feedback_Archiv.txt & versendet an lauju1909@gmail.com)
    await fetch('/api/send_feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('Fehler beim lokalen Speichern:', err);
  }

  // 2. Ntfy Push-Benachrichtigung an den Entwickler
  const nl = '\n';
  const ntfyBody = `Absender: ${author}${nl}Kategorie: ${category}${nl}E-Mail: ${email}${nl}Datum: ${now}${nl}${nl}Nachricht:${nl}${message}`;
  try {
    await fetch('https://ntfy.sh/lauju_stundenplan_feedback', {
      method: 'POST',
      headers: {
        'Title': 'Stundenplan LWL Feedback',
        'Priority': 'default',
        'Tags': 'school,bulb,speech_balloon'
      },
      body: ntfyBody
    });
  } catch (err) {
    try {
      await fetch('https://ntfy.sh/lauju_stundenplan_feedback', {
        method: 'POST',
        mode: 'no-cors',
        body: ntfyBody
      });
    } catch (err2) { }
  }

  if (textEl) textEl.value = '';

  if (statusBox) {
    statusBox.style.display = 'block';
    statusBox.innerHTML = `
      <div style="background: rgba(21, 128, 61, 0.15); border: 2px solid var(--accent-ok); border-radius: var(--radius-md); padding: 16px;">
        <strong style="color: var(--accent-ok); font-size: 16px;"><span class="emoji-icon" aria-hidden="true">✅ </span>Vielen Dank für deine Rückmeldung!</strong>
        <p style="margin-top: 6px; font-size: 14px;">Dein Feedback wurde erfolgreich an den Entwickler übermittelt und direkt hier im Archiv gespeichert.</p>
      </div>
    `;
  }

  announceSR('Vielen Dank! Dein Feedback wurde erfolgreich übertragen und im Archiv gespeichert.', 'polite');

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span class="emoji-icon" aria-hidden="true">📤 </span><strong>Feedback &amp; Nachricht absenden</strong>';
  }

  // Archiv in der App sofort aktualisieren
  loadFeedbackArchive();
}

async function loadFeedbackArchive() {
  const container = document.getElementById('feedback-archive-list');
  if (!container) return;

  try {
    const res = await fetch('/api/feedback_archive');
    const data = await res.json();
    const raw = data.content || '';

    if (!raw.trim()) {
      container.innerHTML = `
        <div style="background: var(--bg-surface); border: 2px dashed var(--border-subtle); border-radius: var(--radius-md); padding: 22px; text-align: center;">
          <p style="color: var(--text-muted); font-size: 15px;"><span class="emoji-icon" aria-hidden="true">📭 </span>Noch keine gesendeten Feedback-Nachrichten im Archiv vorhanden.</p>
        </div>
      `;
      return;
    }

    const chunks = raw.split('----------------------------------').map(c => c.trim()).filter(Boolean);
    if (chunks.length === 0) {
      container.innerHTML = `
        <div style="background: var(--bg-surface); border: 2px dashed var(--border-subtle); border-radius: var(--radius-md); padding: 22px; text-align: center;">
          <p style="color: var(--text-muted); font-size: 15px;"><span class="emoji-icon" aria-hidden="true">📭 </span>Noch keine gesendeten Feedback-Nachrichten im Archiv vorhanden.</p>
        </div>
      `;
      return;
    }

    let html = '<div role="list" aria-label="Liste aller bisher gesendeten Rückmeldungen">';
    // Neueste Nachrichten zuerst anzeigen
    chunks.reverse().forEach(chunk => {
      const matchTime = chunk.match(/^\[(.*?)\]\s*([\s\S]*)$/);
      let timeStr = 'Datum unbekannt';
      let bodyStr = chunk;

      if (matchTime) {
        timeStr = matchTime[1];
        bodyStr = matchTime[2].trim();
      }

      let parsed = null;
      try {
        parsed = JSON.parse(bodyStr);
      } catch (e) { }

      let category = '<span class="emoji-icon" aria-hidden="true">💬 </span>Feedback / Nachricht';
      let author = 'App-Nutzer';
      let email = '';
      let msg = bodyStr;

      if (parsed) {
        category = parsed.Kategorie || parsed._subject || category;
        author = parsed.Absender || parsed.WebUntisBenutzer || author;
        email = (parsed.Email && parsed.Email !== 'Keine E-Mail angegeben') ? parsed.Email : '';
        msg = parsed.Nachricht || bodyStr;
      }

      html += `
        <article class="feedback-card" role="listitem" tabindex="0" aria-label="Feedback vom ${escapeHTML(timeStr)}: ${escapeHTML(category)} von ${escapeHTML(author)}">
          <div class="feedback-header">
            <span class="feedback-type-badge">${escapeHTML(category)}</span>
            <span class="feedback-timestamp"><span class="emoji-icon" aria-hidden="true">🕒 </span>${escapeHTML(timeStr)}</span>
          </div>
          <div class="feedback-sender">
            <span class="emoji-icon" aria-hidden="true">👤 </span><strong>Absender:</strong> ${escapeHTML(author)} ${email ? `| <span class="emoji-icon" aria-hidden="true">✉️ </span>${escapeHTML(email)}` : ''}
          </div>
          <div class="feedback-message">${escapeHTML(msg)}</div>
        </article>
      `;
    });
    html += '</div>';

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `
      <div style="background: rgba(185, 28, 28, 0.1); border: 2px solid var(--accent-danger); border-radius: var(--radius-md); padding: 14px;">
        <span style="color: var(--accent-danger);"><span class="emoji-icon" aria-hidden="true">⚠️ </span>Archiv konnte nicht geladen werden.</span>
      </div>
    `;
  }
}

async function clearFeedbackArchive() {
  if (!confirm('Möchtest du das Feedback-Archiv auf diesem Rechner wirklich leeren?')) return;

  try {
    await fetch('/api/feedback_archive/clear', { method: 'POST' });
    announceSR('Das Feedback-Archiv wurde geleert.', 'polite');
    loadFeedbackArchive();
  } catch (e) {
    alert('Fehler beim Leeren des Feedback-Archivs.');
  }
}

async function openFeedbackZentraleApp() {
  announceSR('Öffne Feedback-Zentrale...', 'polite');
  try {
    const res = await fetch('/api/open_feedback_zentrale');
    if (res.ok) {
      announceSR('Feedback-Zentrale wurde erfolgreich gestartet.', 'polite');
      return;
    }
  } catch (e) { }

  // Fallback: Im Browser öffnen
  window.open('/Feedback_Inbox.html', '_blank');
}

// =============================================================================
// 12. TAGESNACHRICHTEN & MITTEILUNGEN (WEBUNTIS & MESSENGER)
// =============================================================================

const DEFAULT_TEACHERS_FALLBACK = [
  { id: 87, name: 'HAN', longName: 'Hanauer' },
  { id: 37, name: 'FE', longName: 'Feix' },
  { id: 187, name: 'MON', longName: 'Monser' },
  { id: 92, name: 'HUE', longName: 'Hübner' },
  { id: 24, name: 'DRE', longName: 'Drewianka' },
  { id: 102, name: 'M-I', longName: 'Marschinke-Ives' },
  { id: 2, name: 'ALT', longName: 'Altmann' },
  { id: 317, name: 'BER', longName: 'Berger' },
  { id: 266, name: 'BUE', longName: 'Büngeler' },
  { id: 319, name: 'CAL', longName: 'Calvano' },
  { id: 137, name: 'KUE', longName: 'Küppers' },
  { id: 72, name: 'HEN', longName: 'Henze' },
  { id: 187, name: 'RUE', longName: 'Rüberg' },
  { id: 102, name: 'JAC', longName: 'Jacob' },
  { id: 198, name: 'SON', longName: 'Sonntag' },
  { id: 212, name: 'ZOE', longName: 'Zörner' },
  { id: 999, name: 'SL', longName: 'Schulleitung / Sekretariat' }
];

function getTeachersList() {
  if (appData.teachers && Array.isArray(appData.teachers) && appData.teachers.length > 0) {
    return appData.teachers;
  }
  const meta = appData.metadata || {};
  const teachersMap = meta.teachersMap || {};
  const list = [];
  const seen = new Set();
  for (const idOrCode in teachersMap) {
    const tName = teachersMap[idOrCode];
    if (tName && !seen.has(tName)) {
      seen.add(tName);
      list.push({ id: idOrCode, name: idOrCode, longName: tName });
    }
  }
  if (list.length > 0) {
    return list;
  }
  if (typeof isSoestCampusSchool === 'function' && isSoestCampusSchool()) {
    return DEFAULT_TEACHERS_FALLBACK;
  }
  return [];
}

function renderMessagesView() {
  const container = document.getElementById('messages-list-container');
  if (!container) return;

  const messages = appData.messages || [];
  const filter = appData.messagesFilter || 'all';

  // Zähler aktualisieren
  const iservEmails = (appData.config.iservEnabled && Array.isArray(appData.iservEmails)) ? appData.iservEmails : [];
  const allCount = messages.length + iservEmails.length;
  const newsCount = messages.filter(m => m.type === 'news').length;
  const inboxCount = messages.filter(m => m.type === 'inbox').length;
  const sentCount = messages.filter(m => m.type === 'sent').length;
  const iservCount = iservEmails.length;

  const cAll = document.getElementById('count-msg-all');
  const cNews = document.getElementById('count-msg-news');
  const cInbox = document.getElementById('count-msg-inbox');
  const cSent = document.getElementById('count-msg-sent');
  const cIserv = document.getElementById('count-msg-iserv');
  if (cAll) cAll.textContent = String(allCount);
  if (cNews) cNews.textContent = String(newsCount);
  if (cInbox) cInbox.textContent = String(inboxCount);
  if (cSent) cSent.textContent = String(sentCount);
  if (cIserv) cIserv.textContent = String(iservCount);

  // Filter Buttons Styling
  ['all', 'news', 'inbox', 'sent', 'iserv'].forEach(f => {
    const btn = document.getElementById(`btn-filter-msg-${f}`);
    if (btn) {
      btn.classList.toggle('active', f === filter);
      btn.setAttribute('aria-pressed', String(f === filter));
    }
  });

  // Empfänger-Dropdown im Sendeformular befüllen
  const recipientSelect = document.getElementById('msg-recipient');
  if (recipientSelect && recipientSelect.options.length <= 1) {
    recipientSelect.innerHTML = '<option value="">-- Lehrkraft auswählen --</option>';
    const teachers = getTeachersList().sort((a, b) => (a.longName || a.name || '').localeCompare(b.longName || b.name || ''));
    teachers.forEach(t => {
      const opt = document.createElement('option');
      const displayName = `${t.longName || t.name}${t.foreName ? ' ' + t.foreName : ''} (${t.name || ''})`;
      opt.value = displayName;
      opt.textContent = displayName;
      recipientSelect.appendChild(opt);
    });
  }

  // Filtern
  let filtered = messages;
  if (filter === 'news') filtered = messages.filter(m => m.type === 'news');
  else if (filter === 'inbox') filtered = messages.filter(m => m.type === 'inbox');
  else if (filter === 'sent') filtered = messages.filter(m => m.type === 'sent');
  else if (filter === 'iserv') filtered = iservEmails;
  else if (filter === 'all' && iservEmails.length > 0) {
    filtered = [...messages, ...iservEmails].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" role="status" aria-live="polite">
        <span aria-hidden="true"><span class="emoji-icon" aria-hidden="true">💬</span></span>
        <h3 style="margin: 0; font-size: inherit; font-weight: bold;">Keine Mitteilungen in dieser Kategorie vorhanden.</h3>
        <p class="empty-hint">Klicke oben auf „Neue Mitteilung verfassen“, um eine Nachricht an eine Lehrkraft zu senden, oder aktualisiere die Tagesnachrichten.</p>
      </div>`;
    return;
  }

  let html = `<h3 class="section-subheading" style="margin: 18px 0 12px 0; font-size: 1.25rem;"><span class="emoji-icon" aria-hidden="true">📬 </span>Nachrichtenliste (${filtered.length})</h3><div class="messages-stack" role="list">`;
  filtered.forEach(msg => {
    const isNews = msg.type === 'news';
    const isSent = msg.type === 'sent';
    const isIserv = msg.type === 'iserv';
    const isInbox = msg.type === 'inbox' || (!isNews && !isSent && !isIserv);

    let badgeClass = 'msg-badge-inbox';
    let badgeLabel = '<span class="emoji-icon" aria-hidden="true">📥 </span>Posteingang';
    let highlightClass = 'inbox-highlight';

    if (isIserv) {
      badgeClass = 'msg-badge-iserv';
      badgeLabel = '<span class="emoji-icon" aria-hidden="true">📧 </span>IServ E-Mail';
      highlightClass = msg.unread ? 'iserv-highlight iserv-unread' : 'iserv-highlight';
    } else if (isNews) {
      badgeClass = 'msg-badge-news';
      badgeLabel = '<span class="emoji-icon" aria-hidden="true">📢 </span>Tagesnachricht der Schule';
      highlightClass = 'news-highlight';
    } else if (isSent) {
      badgeClass = 'msg-badge-sent';
      badgeLabel = '<span class="emoji-icon" aria-hidden="true">📤 </span>Gesendet';
      highlightClass = 'sent-highlight';
    }

    const dateFormatted = msg.date ? formatGermanDate(new Date(msg.date)) : 'Aktuell';
    const timeFormatted = msg.date ? new Date(msg.date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';

    html += `
      <article class="msg-card ${highlightClass}" role="listitem" tabindex="0" aria-label="${badgeLabel}: ${escHtml(msg.subject || 'Mitteilung')}">
        <div class="msg-header">
          <div class="msg-badges">
            <span class="msg-badge ${badgeClass}">${badgeLabel}</span>
            <span class="msg-date"><span class="emoji-icon" aria-hidden="true">📅 </span>${escHtml(dateFormatted)}${timeFormatted ? ' um ' + escHtml(timeFormatted) + ' Uhr' : ''}</span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            ${isIserv ? `
            <button type="button" class="btn btn-secondary" style="min-height: 34px; padding: 4px 10px; font-size: 13px;" onclick="speakIServEmail('${msg.id}')" aria-label="Diese E-Mail vorlesen">
              <span class="emoji-icon" aria-hidden="true">🔊 </span>Vorlesen
            </button>
            <a href="https://${escHtml(appData.config.iservServer || 'lwl-bk-soest.de')}/iserv/mail" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="min-height: 34px; padding: 4px 10px; font-size: 13px; text-decoration: none;" aria-label="E-Mail im IServ Webmailer öffnen">
              <span class="emoji-icon" aria-hidden="true">🌐 </span>In IServ öffnen
            </a>` : `
            <button type="button" class="btn btn-secondary" style="min-height: 34px; padding: 4px 10px; font-size: 13px;" onclick="speakMsg('${msg.id}')" aria-label="Diese Mitteilung vorlesen">
              <span class="emoji-icon" aria-hidden="true">🔊 </span>Vorlesen
            </button>
            <button type="button" class="btn btn-danger" style="min-height: 34px; padding: 4px 10px; font-size: 13px;" onclick="deleteMessage('${msg.id}')" aria-label="Mitteilung ${escHtml(msg.subject || '')} löschen">
              <span class="emoji-icon" aria-hidden="true">🗑️ </span>Löschen
            </button>`}
          </div>
        </div>
        <h4 class="msg-title">${escHtml(msg.subject || 'Ohne Betreff')}</h4>
        <div class="msg-author-line">
          ${isSent ? `<span class="emoji-icon" aria-hidden="true">👤 </span><strong>Empfänger:</strong> ${escHtml(msg.recipient || 'Lehrkraft')}` : `<span class="emoji-icon" aria-hidden="true">👤 </span><strong>Von:</strong> ${escHtml(msg.sender || 'LWL-Berufskolleg Soest')}`}
        </div>
        <div class="msg-body">${escHtml(msg.text || msg.body || '')}</div>
      </article>
    `;
  });
  html += '</div>';

  container.innerHTML = html;
}

function speakMsg(msgId) {
  const msg = (appData.messages || []).find(m => String(m.id) === String(msgId));
  if (!msg) return;
  const isSent = msg.type === 'sent';
  const person = isSent ? `an ${msg.recipient}` : `von ${msg.sender || 'der Schule'}`;
  const text = `Mitteilung ${person}: Betreff ${msg.subject || 'Kein Betreff'}. Inhalt: ${msg.text || msg.body || ''}`;
  speak(text, true);
  announceSR(text, 'assertive');
}

async function deleteMessage(msgId) {
  if (!msgId) return;
  const msg = (appData.messages || []).find(m => String(m.id) === String(msgId));
  const title = msg ? (msg.subject || 'diese Mitteilung') : 'diese Mitteilung';

  if (!confirm(`Möchtest du die Mitteilung „${title}“ wirklich löschen?`)) {
    return;
  }

  // 1. Wenn es eine WebUntis-Nachricht ist, versuche DELETE an die WebUntis API zu senden
  let untisId = null;
  const sId = String(msgId);
  if (sId.startsWith('webuntis-inbox-')) {
    untisId = sId.replace('webuntis-inbox-', '');
  } else if (sId.startsWith('webuntis-news-')) {
    untisId = sId.replace('webuntis-news-', '');
  } else if (/^\d+$/.test(sId)) {
    untisId = sId;
  }

  if (untisId) {
    try {
      // Versuch, die Mitteilung auf dem WebUntis Server zu löschen (über REST DELETE)
      await callWebUntisRest(`/api/rest/view/v1/messages/${untisId}`, null, 'DELETE');
    } catch (e) {
      console.warn('WebUntis Server DELETE fehlgeschlagen oder keine Schüler-Berechtigung:', e);
    }
  }

  // 2. In Blacklist eintragen, damit sie bei zukünftigen WebUntis-Synchronisationen nie wieder erscheint
  if (!appData.deletedMessageIds) appData.deletedMessageIds = [];
  if (!appData.deletedMessageIds.includes(sId)) {
    appData.deletedMessageIds.push(sId);
  }
  if (untisId && !appData.deletedMessageIds.includes(untisId)) {
    appData.deletedMessageIds.push(untisId);
  }

  // 3. Aus lokalem Speicher entfernen (exakte ID-Prüfung)
  appData.messages = (appData.messages || []).filter(m => {
    const curId = String(m.id || '');
    return curId !== sId && (!untisId || (curId !== untisId && curId !== ('webuntis-inbox-' + untisId) && curId !== ('webuntis-news-' + untisId)));
  });
  saveAppData();

  // 4. Anzeige in beiden Ansichten (Mitteilungen & Übersicht) sofort aktualisieren
  renderMessagesView();
  renderUrgentNotificationBanner();

  // 5. Screenreader- und Sprachausgabe-Bestätigung
  const feedback = `Mitteilung ${title} wurde gelöscht.`;
  speak(feedback, true);
  announceSR(feedback, 'assertive');
}

function toggleMessageComposer(forceState) {
  const card = document.getElementById('message-composer-card');
  if (!card) return;

  const willShow = typeof forceState === 'boolean' ? forceState : (card.style.display === 'none');
  card.style.display = willShow ? 'block' : 'none';

  if (willShow) {
    const rec = document.getElementById('msg-recipient');
    if (rec) rec.focus();
    announceSR('Mitteilungs-Formular geöffnet. Wähle eine Lehrkraft als Empfänger.', 'polite');
  }
}

function handleSendMessageSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();

  const recEl = document.getElementById('msg-recipient');
  const subjEl = document.getElementById('msg-subject');
  const textEl = document.getElementById('msg-text');
  const statusBox = document.getElementById('composer-status-box');

  if (!recEl || !recEl.value || !subjEl || !subjEl.value.trim() || !textEl || !textEl.value.trim()) {
    alert('Bitte wähle einen Empfänger aus und fülle Betreff sowie Nachrichtentext aus.');
    return;
  }

  const recipient = recEl.value.trim();
  const subject = subjEl.value.trim();
  const text = textEl.value.trim();

  const newMsg = {
    id: 'msg-' + Date.now(),
    type: 'sent',
    sender: appData.config.username ? `Schüler (${appData.config.username})` : 'Laurin Schneider',
    recipient: recipient,
    subject: subject,
    text: text,
    date: new Date().toISOString()
  };

  if (!appData.messages) appData.messages = [];
  appData.messages.unshift(newMsg);
  saveAppData();

  // Desktop Toast Notification
  fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Mitteilung gesendet',
      message: `An ${recipient}: ${subject}`
    })
  }).catch(() => {});

  // Formular zurücksetzen und schließen
  subjEl.value = '';
  textEl.value = '';
  recEl.selectedIndex = 0;
  toggleMessageComposer(false);

  renderMessagesView();
  renderUrgentNotificationBanner();

  const successMsg = `Mitteilung an ${recipient} wurde erfolgreich erfasst und im Archiv gespeichert.`;
  speak(successMsg, true);
  announceSR(successMsg, 'assertive');
}

function filterMessages(type) {
  appData.messagesFilter = type;
  renderMessagesView();
  const names = {
    all: 'Alle Nachrichten und E-Mails',
    news: 'Tagesnachrichten und Ticker',
    inbox: 'WebUntis Posteingang',
    sent: 'Gesendete Mitteilungen',
    iserv: 'IServ E-Mails'
  };
  announceSR('Filter aktiviert: ' + (names[type] || type), 'polite');
}

function readMessagesSummary() {
  const msgs = appData.messages || [];
  const news = msgs.filter(m => m.type === 'news');
  const inbox = msgs.filter(m => m.type === 'inbox');
  const sent = msgs.filter(m => m.type === 'sent');
  const iserv = (appData.config.iservEnabled && Array.isArray(appData.iservEmails)) ? appData.iservEmails : [];

  let text = `Mitteilungs-Übersicht: Du hast ${msgs.length} Mitteilung${msgs.length !== 1 ? 'en' : ''}. `;
  if (news.length > 0) text += `Davon ${news.length} Tagesnachricht${news.length > 1 ? 'en' : ''} der Schule. `;
  if (inbox.length > 0) text += `Du hast ${inbox.length} Nachricht${inbox.length > 1 ? 'en' : ''} im Posteingang. `;
  if (sent.length > 0) text += `Du hast ${sent.length} Nachricht${sent.length > 1 ? 'en' : ''} gesendet. `;
  if (iserv.length > 0) text += `Zusätzlich liegen ${iserv.length} E-Mail${iserv.length > 1 ? 's' : ''} in deinem IServ-Postfach. `;

  if (msgs.length === 0) {
    text += 'Aktuell liegen keine neuen Mitteilungen oder Tagesnachrichten vor.';
  } else {
    text += `Neueste Mitteilung: ${msgs[0].subject || 'Ohne Betreff'}.`;
  }

  speak(text, true);
  announceSR(text, 'assertive');
}

async function syncMessagesAndNews() {
  announceSR('Synchronisiere Mitteilungen und Nachrichten...', 'polite');
  try {
    // 1. WebUntis REST-Mitteilungen (/api/rest/view/v1/messages) abrufen
    try {
      const msgsRes = await callWebUntisRest('/api/rest/view/v1/messages', null);
      if (msgsRes && msgsRes.incomingMessages && Array.isArray(msgsRes.incomingMessages)) {
        if (!appData.messages) appData.messages = [];
        const delSet = new Set((appData.deletedMessageIds || []).map(String));
        const teachersList = appData.teachers || [];
        
        msgsRes.incomingMessages.forEach(m => {
          const sId = String(m.id);
          const id = `webuntis-inbox-${m.id}`;
          if (delSet.has(sId) || delSet.has(id)) return;

          let msgDateIso = '';
          const rawDate = m.sentDateTime || m.sentDate || m.date || m.createDate || m.dateTime || m.createDateTime;
          if (rawDate) {
            if (typeof rawDate === 'string' && rawDate.includes('T')) {
              msgDateIso = rawDate;
            } else if (typeof rawDate === 'string' && rawDate.length >= 10) {
              msgDateIso = new Date(rawDate).toISOString();
            } else if (typeof rawDate === 'number') {
              if (rawDate > 1000000000000) msgDateIso = new Date(rawDate).toISOString();
              else if (rawDate > 10000000) {
                const sNum = String(rawDate);
                msgDateIso = `${sNum.slice(0,4)}-${sNum.slice(4,6)}-${sNum.slice(6,8)}T08:00:00Z`;
              }
            }
          }
          const existingIdx = appData.messages.findIndex(x => x.id === id);
          if (!msgDateIso) {
            msgDateIso = (existingIdx >= 0 && appData.messages[existingIdx].date) ? appData.messages[existingIdx].date : new Date().toISOString();
          }

          let senderName = '';
          if (m.sender && typeof m.sender === 'object') {
            senderName = m.sender.displayName || m.sender.name || m.sender.longName || '';
          } else if (typeof m.sender === 'string') {
            senderName = m.sender;
          }
          if (!senderName) senderName = 'Schulleitung / Lehrkraft';
          const matchedT = teachersList.find(t => t.name && senderName && t.name.toUpperCase() === senderName.toUpperCase());
          if (matchedT && matchedT.longName) {
            senderName = `${matchedT.longName} (${matchedT.name})`;
          }

          const msgObj = {
            id: id,
            type: 'inbox',
            sender: senderName,
            subject: m.subject || 'Mitteilung',
            text: m.contentPreview || m.content || m.body || '',
            date: msgDateIso
          };
          if (existingIdx >= 0) {
            appData.messages[existingIdx] = msgObj;
          } else {
            appData.messages.unshift(msgObj);
          }
        });
      }
    } catch (errMsgs) {
      console.warn('syncMessagesAndNews REST Messages Warnung:', errMsgs);
    }

    // 2. WebUntis getMessagesOfDay2017
    try {
      const todayNum = parseInt(new Date().toISOString().slice(0,10).replace(/-/g, ''), 10);
      const res = await callWebUntisApi('getMessagesOfDay2017', [{ date: todayNum }]);
      if (res && res.result && res.result.messages && Array.isArray(res.result.messages)) {
        if (!appData.messages) appData.messages = [];
        const delSet = new Set((appData.deletedMessageIds || []).map(String));
        res.result.messages.forEach(m => {
          const sId = String(m.id || Date.now());
          const id = `webuntis-news-${sId}`;
          if (delSet.has(sId) || delSet.has(id)) return;
          if (!appData.messages.some(x => x.id === id)) {
            appData.messages.unshift({
              id: id,
              type: 'news',
              sender: 'Schulleitung / WebUntis',
              subject: m.subject || m.title || 'Tagesnachricht',
              text: m.text || m.body || m.content || '',
              date: new Date().toISOString()
            });
          }
        });
      }
    } catch (errNews) {
      console.warn('syncMessagesAndNews NewsOfDay Warnung:', errNews);
    }

    // 3. IServ E-Mails synchronisieren (wenn aktiviert)
    if (appData.config && appData.config.iservEnabled) {
      try {
        await syncIServData(false);
      } catch (errIserv) {
        console.warn('syncMessagesAndNews IServ Warnung:', errIserv);
      }
    }

    saveAppData();
  } catch (e) {
    console.warn('syncMessagesAndNews Fehler:', e);
  }

  renderMessagesView();
  renderUrgentNotificationBanner();
  announceSR('Mitteilungen und Nachrichten aktualisiert.', 'polite');
}

// =============================================================================
// 13. NOTEN & LEISTUNGSÜBERSICHT (FEATURE 6 - OFFIZIELLE WEBUNTIS-NOTEN)
// =============================================================================

const DEFAULT_WEBUNTIS_GRADES = [{"subject": "D", "grade": {"id": 138414, "date": 20241014, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend +", "markDisplayValue": 3.7, "markValue": 370}, "text": "", "exam": {"name": "1. KL Deutsch"}}}, {"subject": "M", "grade": {"id": 139112, "date": 20241104, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": null}}, {"subject": "D", "grade": {"id": 138407, "date": 20241105, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "", "exam": null}}, {"subject": "FB LF 5", "grade": {"id": 138426, "date": 20241106, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "M", "grade": {"id": 139091, "date": 20241106, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Sehr gut +", "markDisplayValue": 0.7, "markValue": 70}, "text": "", "exam": {"name": "Mathe"}}}, {"subject": "FB LF 1", "grade": {"id": 140183, "date": 20241106, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "1. GPU-Arbeit (Lernfelder 1,2,4,5,9)", "exam": null}}, {"subject": "FB LF 1", "grade": {"id": 140195, "date": 20241117, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "PP", "grade": {"id": 140498, "date": 20241121, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "PK", "grade": {"id": 142086, "date": 20250108, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "", "exam": null}}, {"subject": "PP", "grade": {"id": 141884, "date": 20250109, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "", "exam": null}}, {"subject": "E", "grade": {"id": 142200, "date": 20250112, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Mangelhaft +", "markDisplayValue": 4.7, "markValue": 470}, "text": "", "exam": {"name": "E1"}}}, {"subject": "E", "grade": {"id": 142215, "date": 20250112, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend", "markDisplayValue": 4.0, "markValue": 400}, "text": "", "exam": {"name": "E2"}}}, {"subject": "E", "grade": {"id": 142229, "date": 20250112, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend -", "markDisplayValue": 4.3, "markValue": 430}, "text": "", "exam": {"name": "Sonstige Leistung E1"}}}, {"subject": "E", "grade": {"id": 142238, "date": 20250112, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "", "exam": {"name": "Sonstige Leistungen E2"}}}, {"subject": "M", "grade": {"id": 142943, "date": 20250113, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": null}}, {"subject": "FB LF 6", "grade": {"id": 143063, "date": 20250113, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "FB LF 6", "grade": {"id": 143079, "date": 20250113, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "D", "grade": {"id": 143201, "date": 20250114, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend", "markDisplayValue": 4.0, "markValue": 400}, "text": "", "exam": null}}, {"subject": "FB LF 7", "grade": {"id": 143094, "date": 20250115, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "M", "grade": {"id": 142925, "date": 20250116, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": {"name": "Mathe"}}}, {"subject": "PK", "grade": {"id": 143007, "date": 20250116, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "", "exam": {"name": "Klassenarbeit Nr. 1 "}}}, {"subject": "FB LF 6", "grade": {"id": 143028, "date": 20250116, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": {"name": "Klassenarbeit PbP"}}}, {"subject": "FB LF 6", "grade": {"id": 143031, "date": 20250116, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": {"name": "Klassenarbeit Nr.2"}}}, {"subject": "FB LF 7", "grade": {"id": 143043, "date": 20250116, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": {"name": "Klassenarbeit GWP"}}}, {"subject": "FB LF 1", "grade": {"id": 143151, "date": 20250117, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "", "exam": null}}, {"subject": "FB LF 1", "grade": {"id": 143165, "date": 20250117, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "D", "grade": {"id": 143181, "date": 20250117, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend -", "markDisplayValue": 4.3, "markValue": 430}, "text": "", "exam": {"name": "2. Deutsch KL"}}}, {"subject": "FB LF 4", "grade": {"id": 144857, "date": 20250121, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "1. Quartal", "exam": null}}, {"subject": "FB LF 4", "grade": {"id": 144874, "date": 20250121, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "1. KA vom 06.11.2024", "exam": null}}, {"subject": "FB LF 4", "grade": {"id": 144888, "date": 20250121, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "2. Quartal", "exam": null}}, {"subject": "FB LF 4", "grade": {"id": 144904, "date": 20250121, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "2. KA vom 14.01.2025", "exam": null}}, {"subject": "FB LF 9", "grade": {"id": 144921, "date": 20250124, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "1. Quartal", "exam": null}}, {"subject": "FB LF 9", "grade": {"id": 144939, "date": 20250124, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "1. KA vom 06.11.2025", "exam": null}}, {"subject": "FB LF 9", "grade": {"id": 144957, "date": 20250124, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "2. Quartal", "exam": null}}, {"subject": "FB LF 9", "grade": {"id": 144972, "date": 20250124, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "2. KA vom 14.01.2025", "exam": null}}, {"subject": "FB NW", "grade": {"id": 145862, "date": 20250126, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Ungenügend", "markDisplayValue": 6.0, "markValue": 600}, "text": "nicht abgegeben, krank, aber keine Entschuldigung/Rückmeldung", "exam": null}}, {"subject": "FB NW", "grade": {"id": 145876, "date": 20250126, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "FB NW", "grade": {"id": 145892, "date": 20250126, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "SP", "grade": {"id": 147092, "date": 20250128, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "SL1", "exam": null}}, {"subject": "SP", "grade": {"id": 147143, "date": 20250128, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "SL2", "exam": null}}, {"subject": "FB LF 5", "grade": {"id": 147522, "date": 20250204, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": {"name": "1. GPU Arbeit"}}}, {"subject": "FB LF 5", "grade": {"id": 147531, "date": 20250204, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "", "exam": null}}, {"subject": "FB LF 5", "grade": {"id": 147545, "date": 20250204, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "FB LF 2", "grade": {"id": 147556, "date": 20250204, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "", "exam": {"name": "2. GPU-Arbeit"}}}, {"subject": "FB LF 2", "grade": {"id": 147565, "date": 20250204, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": null}}, {"subject": "FB LF 2", "grade": {"id": 147584, "date": 20250205, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "FB LF 2", "grade": {"id": 147602, "date": 20250205, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": null}}, {"subject": "FB LF 7", "grade": {"id": 147671, "date": 20250205, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "FB LF 7", "grade": {"id": 147687, "date": 20250205, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "FB LF 8", "grade": {"id": 147705, "date": 20250206, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": null}}, {"subject": "FB LF 8", "grade": {"id": 147722, "date": 20250206, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "FB LF 8", "grade": {"id": 147740, "date": 20250206, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "FB LF 8", "grade": {"id": 147756, "date": 20250206, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "E", "grade": {"id": 148525, "date": 20250226, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend +", "markDisplayValue": 3.7, "markValue": 370}, "text": "", "exam": {"name": "E3"}}}, {"subject": "FB LF 4", "grade": {"id": 155954, "date": 20250408, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "SL-Noten_3. Quartal", "exam": null}}, {"subject": "FB LF 4", "grade": {"id": 155970, "date": 20250408, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend", "markDisplayValue": 4.0, "markValue": 400}, "text": "KA-3. Quartal vom 07.03.2025", "exam": null}}, {"subject": "PP", "grade": {"id": 149372, "date": 20250410, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend +", "markDisplayValue": 3.7, "markValue": 370}, "text": "", "exam": null}}, {"subject": "FB LF 9", "grade": {"id": 155987, "date": 20250411, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend", "markDisplayValue": 4.0, "markValue": 400}, "text": "KA-3. Quartal vom 07.03.2025", "exam": null}}, {"subject": "FB LF 9", "grade": {"id": 156003, "date": 20250411, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "SL-Noten_3. Quartal", "exam": null}}, {"subject": "M", "grade": {"id": 150729, "date": 20250428, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": null}}, {"subject": "M", "grade": {"id": 150711, "date": 20250515, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Sehr gut -", "markDisplayValue": 1.3, "markValue": 130}, "text": "", "exam": {"name": "M"}}}, {"subject": "FB LF 7", "grade": {"id": 151719, "date": 20250611, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "FB LF 7", "grade": {"id": 151736, "date": 20250611, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "FB LF 8", "grade": {"id": 151671, "date": 20250612, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "FB LF 8", "grade": {"id": 151687, "date": 20250612, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "FB LF 8", "grade": {"id": 151704, "date": 20250612, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "", "exam": null}}, {"subject": "M", "grade": {"id": 152873, "date": 20250616, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": null}}, {"subject": "D", "grade": {"id": 152233, "date": 20250617, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend", "markDisplayValue": 4.0, "markValue": 400}, "text": "", "exam": {"name": "3. KL Deutsch"}}}, {"subject": "D", "grade": {"id": 152244, "date": 20250617, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": {"name": "4. KL Deutsch"}}}, {"subject": "D", "grade": {"id": 152263, "date": 20250617, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "3. SL Note", "exam": null}}, {"subject": "D", "grade": {"id": 152281, "date": 20250617, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend +", "markDisplayValue": 3.7, "markValue": 370}, "text": "4. SL Note", "exam": null}}, {"subject": "E", "grade": {"id": 152707, "date": 20250622, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "", "exam": {"name": "Sonstige Leistung E3"}}}, {"subject": "E", "grade": {"id": 152718, "date": 20250622, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Mangelhaft +", "markDisplayValue": 4.7, "markValue": 470}, "text": "", "exam": {"name": "E4"}}}, {"subject": "E", "grade": {"id": 152735, "date": 20250622, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend +", "markDisplayValue": 3.7, "markValue": 370}, "text": "", "exam": {"name": "Sonstige Leistung E4"}}}, {"subject": "M", "grade": {"id": 152852, "date": 20250622, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": {"name": "M"}}}, {"subject": "FB LF 6", "grade": {"id": 154696, "date": 20250623, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "FB LF 6", "grade": {"id": 154715, "date": 20250623, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": null}}, {"subject": "FB LF 6", "grade": {"id": 154665, "date": 20250624, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Sehr gut -", "markDisplayValue": 1.3, "markValue": 130}, "text": "", "exam": {"name": "Klassenarbeit Nr. 3"}}}, {"subject": "FB LF 6", "grade": {"id": 154676, "date": 20250624, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": {"name": "Klassenarbeit PbP"}}}, {"subject": "FB LF 7", "grade": {"id": 154847, "date": 20250624, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "", "exam": {"name": "Klassenarbeit GWP"}}}, {"subject": "FB LF 4", "grade": {"id": 156020, "date": 20250624, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "KA 04. Quartal vom 13.06.2025", "exam": null}}, {"subject": "FB LF 4", "grade": {"id": 156037, "date": 20250624, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "SL-Noten_4. Quartal", "exam": null}}, {"subject": "PP", "grade": {"id": 156145, "date": 20250624, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend +", "markDisplayValue": 3.7, "markValue": 370}, "text": "", "exam": null}}, {"subject": "FB LF 7", "grade": {"id": 154901, "date": 20250625, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "PK", "grade": {"id": 155201, "date": 20250625, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "PK", "grade": {"id": 155219, "date": 20250625, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "FB LF 8", "grade": {"id": 154978, "date": 20250626, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "FB NW", "grade": {"id": 155166, "date": 20250627, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "FB NW", "grade": {"id": 155184, "date": 20250627, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "FB LF 9", "grade": {"id": 156056, "date": 20250627, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "SL-Noten_4. Quartal", "exam": null}}, {"subject": "FB LF 9", "grade": {"id": 156074, "date": 20250627, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "KA_04. Quartal vom 13.06.2025", "exam": null}}, {"subject": "FB LF 2", "grade": {"id": 160127, "date": 20250702, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "FB LF 2", "grade": {"id": 160145, "date": 20250702, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "FB LF 5", "grade": {"id": 160163, "date": 20250702, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "FB LF 5", "grade": {"id": 160180, "date": 20250702, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": null}}, {"subject": "FB LF 1", "grade": {"id": 160198, "date": 20250702, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend", "markDisplayValue": 4.0, "markValue": 400}, "text": "3. KL", "exam": null}}, {"subject": "FB LF 1", "grade": {"id": 160214, "date": 20250702, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "4. KL", "exam": null}}, {"subject": "FB LF 1", "grade": {"id": 160230, "date": 20250702, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": null}}, {"subject": "FB LF 1", "grade": {"id": 160247, "date": 20250702, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": null}}, {"subject": "SP", "grade": {"id": 159052, "date": 20250708, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "SL 3 ", "exam": null}}, {"subject": "SP", "grade": {"id": 159120, "date": 20250708, "examType": {"name": "Sonst. Leistung AV", "longname": "Sonstige Leistung Ausbildungsvorbereitung"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "SL 4 ", "exam": null}}, {"subject": "FB LF 2", "grade": {"id": 160094, "date": 20250711, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Ausreichend", "markDisplayValue": 4.0, "markValue": 400}, "text": "", "exam": {"name": "3. GPU-Arbeit"}}}, {"subject": "FB LF 2", "grade": {"id": 160108, "date": 20250711, "examType": {"name": "Klassenarbeit AV", "longname": "Klassenarbeit Ausbildungsvorbereitung"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": {"name": "4. GPU-Arbeit"}}}, {"subject": "PK", "grade": {"id": 163995, "date": 20251028, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": null}}, {"subject": "M", "grade": {"id": 161191, "date": 20251104, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": null}}, {"subject": "FB GPU1", "grade": {"id": 161730, "date": 20251104, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": null}}, {"subject": "FB PBP (BWO)", "grade": {"id": 161163, "date": 20251105, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": null}}, {"subject": "D", "grade": {"id": 161174, "date": 20251105, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "D", "grade": {"id": 161184, "date": 20251111, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": {"name": "D"}}}, {"subject": "M", "grade": {"id": 161205, "date": 20251111, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": {"name": "M"}}}, {"subject": "PP", "grade": {"id": 161373, "date": 20251113, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "FB PBP", "grade": {"id": 162001, "date": 20251118, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "1. Quartal", "exam": null}}, {"subject": "SP", "grade": {"id": 161824, "date": 20251119, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "1. Quartal", "exam": null}}, {"subject": "FB GPU1", "grade": {"id": 161739, "date": 20251125, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "leer", "markDisplayValue": 0.0, "markValue": 0}, "text": "", "exam": {"name": "FB GPU1"}}}, {"subject": "FB GPU1", "grade": {"id": 161745, "date": 20251125, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Sehr Gut -", "markDisplayValue": 1.3, "markValue": 130}, "text": "", "exam": {"name": "FB GPU1"}}}, {"subject": "FB GPU2", "grade": {"id": 161975, "date": 20251127, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": {"name": "01. KA_GPU2"}}}, {"subject": "FB PBP", "grade": {"id": 161994, "date": 20251127, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Ausreichend +", "markDisplayValue": 3.7, "markValue": 370}, "text": "", "exam": {"name": "01. KA_PBP"}}}, {"subject": "PK", "grade": {"id": 164005, "date": 20251216, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "Portfolio", "exam": null}}, {"subject": "PP", "grade": {"id": 162701, "date": 20260108, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "PK", "grade": {"id": 164012, "date": 20260119, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": null}}, {"subject": "M", "grade": {"id": 164146, "date": 20260119, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Sehr Gut -", "markDisplayValue": 1.3, "markValue": 130}, "text": "", "exam": {"name": "M"}}}, {"subject": "D", "grade": {"id": 164167, "date": 20260119, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Ausreichend", "markDisplayValue": 4.0, "markValue": 400}, "text": "", "exam": {"name": "D"}}}, {"subject": "M", "grade": {"id": 164288, "date": 20260120, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "FB PBP", "grade": {"id": 166089, "date": 20260120, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "2. Quartal_SL", "exam": null}}, {"subject": "FB GPU1", "grade": {"id": 167845, "date": 20260120, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "", "exam": null}}, {"subject": "FB PBP (BWO)", "grade": {"id": 164209, "date": 20260121, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "D", "grade": {"id": 164234, "date": 20260121, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "SP", "grade": {"id": 164322, "date": 20260121, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "", "exam": null}}, {"subject": "FB GPU2", "grade": {"id": 166019, "date": 20260121, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Sehr Gut -", "markDisplayValue": 1.3, "markValue": 130}, "text": "", "exam": {"name": "KA_02_GPU2"}}}, {"subject": "FB GPU2", "grade": {"id": 166068, "date": 20260121, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "2. Quartal_SL", "exam": null}}, {"subject": "FB PBP", "grade": {"id": 166081, "date": 20260121, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": {"name": "02. KA_PBP"}}}, {"subject": "E", "grade": {"id": 167456, "date": 20260125, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Ausreichend -", "markDisplayValue": 4.3, "markValue": 430}, "text": "", "exam": {"name": "E"}}}, {"subject": "E", "grade": {"id": 167462, "date": 20260125, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Mangelhaft", "markDisplayValue": 5.0, "markValue": 500}, "text": "", "exam": {"name": "E"}}}, {"subject": "FB GPU1", "grade": {"id": 167836, "date": 20260126, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": {"name": "FB GPU1"}}}, {"subject": "E", "grade": {"id": 167471, "date": 20260127, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Ausreichend", "markDisplayValue": 4.0, "markValue": 400}, "text": "", "exam": null}}, {"subject": "E", "grade": {"id": 167483, "date": 20260127, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Ausreichend +", "markDisplayValue": 3.7, "markValue": 370}, "text": "", "exam": null}}, {"subject": "FB GPU1", "grade": {"id": 168410, "date": 20260305, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "", "exam": {"name": "FB GPU1"}}}, {"subject": "PP", "grade": {"id": 169463, "date": 20260416, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": null}}, {"subject": "FB GPU1", "grade": {"id": 169688, "date": 20260423, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "", "exam": null}}, {"subject": "FB PBP", "grade": {"id": 169913, "date": 20260504, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": {"name": "KA_03_PBP"}}}, {"subject": "FB GPU2", "grade": {"id": 169920, "date": 20260504, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "", "exam": {"name": "KA_03_GPU2"}}}, {"subject": "SP", "grade": {"id": 169965, "date": 20260506, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "3. SL", "exam": null}}, {"subject": "FB GPU2", "grade": {"id": 170240, "date": 20260511, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "3. Quartal_SL", "exam": null}}, {"subject": "FB PBP", "grade": {"id": 170231, "date": 20260512, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "3. Quartal_SL", "exam": null}}, {"subject": "E", "grade": {"id": 170247, "date": 20260512, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": {"name": "E"}}}, {"subject": "E", "grade": {"id": 170255, "date": 20260512, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "SL3", "exam": null}}, {"subject": "FB PBP (BWO)", "grade": {"id": 170800, "date": 20260520, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "D", "grade": {"id": 170808, "date": 20260520, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": null}}, {"subject": "M", "grade": {"id": 170825, "date": 20260522, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "", "exam": null}}, {"subject": "D", "grade": {"id": 170817, "date": 20260527, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Ausreichend -", "markDisplayValue": 4.3, "markValue": 430}, "text": "", "exam": {"name": "D"}}}, {"subject": "M", "grade": {"id": 170834, "date": 20260527, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": {"name": "M"}}}, {"subject": "PP", "grade": {"id": 172144, "date": 20260611, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "PK", "grade": {"id": 172679, "date": 20260616, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": {"name": "KA PK "}}}, {"subject": "FB PBP", "grade": {"id": 172687, "date": 20260617, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": {"name": "04._KA_PBP"}}}, {"subject": "FB GPU2", "grade": {"id": 172688, "date": 20260617, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "", "exam": null}}, {"subject": "FB GPU1", "grade": {"id": 172859, "date": 20260618, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut +", "markDisplayValue": 1.7, "markValue": 170}, "text": "", "exam": {"name": "FB GPU1"}}}, {"subject": "FB GPU2", "grade": {"id": 172894, "date": 20260619, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "", "exam": {"name": "04. KA_GPU2"}}}, {"subject": "PK", "grade": {"id": 174275, "date": 20260630, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut -", "markDisplayValue": 2.3, "markValue": 230}, "text": "", "exam": null}}, {"subject": "PK", "grade": {"id": 174288, "date": 20260630, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend +", "markDisplayValue": 2.7, "markValue": 270}, "text": "", "exam": null}}, {"subject": "D", "grade": {"id": 175380, "date": 20260630, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Ausreichend +", "markDisplayValue": 3.7, "markValue": 370}, "text": "", "exam": {"name": "D"}}}, {"subject": "M", "grade": {"id": 175402, "date": 20260630, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": null}}, {"subject": "M", "grade": {"id": 175447, "date": 20260630, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Ausreichend +", "markDisplayValue": 3.7, "markValue": 370}, "text": "", "exam": null}}, {"subject": "FB PBP (BWO)", "grade": {"id": 175306, "date": 20260701, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend", "markDisplayValue": 3.0, "markValue": 300}, "text": "", "exam": null}}, {"subject": "D", "grade": {"id": 175350, "date": 20260701, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Ausreichend +", "markDisplayValue": 3.7, "markValue": 370}, "text": "", "exam": null}}, {"subject": "SP", "grade": {"id": 179033, "date": 20260701, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": null}}, {"subject": "E", "grade": {"id": 178730, "date": 20260707, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Befriedigend -", "markDisplayValue": 3.3, "markValue": 330}, "text": "", "exam": null}}, {"subject": "FB GPU1", "grade": {"id": 178810, "date": 20260707, "examType": {"name": "Sonst. Leist. TZ/BF", "longname": "Sonstige Leistung Teilzeit/Berufsfachschulen"}, "mark": {"name": "Gut", "markDisplayValue": 2.0, "markValue": 200}, "text": "", "exam": null}}, {"subject": "E", "grade": {"id": 178719, "date": 20260709, "examType": {"name": "Klassenarbeit TZ/BF", "longname": "Klassenarbeit Teilzeit/Berufsfachschulen"}, "mark": {"name": "Mangelhaft -", "markDisplayValue": 5.3, "markValue": 530}, "text": "", "exam": {"name": "E"}}}];

function getGradeSchoolYear(gradeItem) {
  const g = (gradeItem && gradeItem.grade) || {};
  const d = String(g.date || '');
  if (d.length === 8) {
    const year = parseInt(d.substring(0, 4), 10);
    const month = parseInt(d.substring(4, 6), 10);
    if (month >= 8) {
      return `${year}/${year + 1}`;
    } else {
      return `${year - 1}/${year}`;
    }
  }
  return '2026/2027';
}

function isWrittenExam(gradeItem) {
  const g = (gradeItem && gradeItem.grade) || {};
  const et = (g.examType && g.examType.name) || '';
  const etLower = et.toLowerCase();
  if (etLower.includes('klassenarbeit') || etLower.includes('klausur')) return true;
  if (g.exam && g.exam.name) return true;
  return false;
}

function isMatchingSubject(itemSubj, targetCode) {
  if (!itemSubj || !targetCode) return false;
  const s = itemSubj.trim().toUpperCase();
  const t = targetCode.trim().toUpperCase();
  if (s === t) return true;
  if (s.includes('(' + t + ')')) return true;
  return false;
}

function formatGradeDate(dateNum) {
  if (!dateNum) return '';
  const s = String(dateNum);
  if (s.length === 8) {
    return `${s.substring(6, 8)}.${s.substring(4, 6)}.${s.substring(0, 4)}`;
  }
  return s;
}

function getGradeBadgeClass(markVal) {
  if (markVal === null || markVal === undefined || isNaN(markVal) || markVal === 0) return 'grade-pending';
  if (markVal <= 1.5) return 'grade-1';
  if (markVal <= 2.5) return 'grade-2';
  if (markVal <= 3.5) return 'grade-3';
  if (markVal <= 4.5) return 'grade-4';
  return 'grade-5';
}

function getExamSchoolYear(exam) {
  if (!exam || !exam.date) return '2026/2027';
  const d = String(exam.date).replace(/-/g, '');
  if (d.length >= 8) {
    const y = parseInt(d.substring(0, 4), 10);
    const m = parseInt(d.substring(4, 6), 10);
    if (m >= 8) return `${y}/${y + 1}`;
    return `${y - 1}/${y}`;
  }
  return '2026/2027';
}

function getSubjectInfo(code, schoolYear = null) {
  if (!code) return { code: 'Fach', name: 'Schulfach', fullName: 'Schulfach', teacher: '', klasse: '' };
  const trimmed = code.trim();
  const meta = appData.metadata || {};
  const subjectsMap = meta.subjectsMap || {};
  const teachersMap = meta.teachersMap || {};
  const klassenMap = meta.klassenMap || {};

  // 1. Schulfach-Vollname dynamisch aus WebUntis-Metadaten ermitteln
  let fullName = subjectsMap[trimmed] || '';
  if (!fullName) {
    for (const k in subjectsMap) {
      if (k.toUpperCase() === trimmed.toUpperCase()) {
        fullName = subjectsMap[k];
        break;
      }
    }
  }

  // 2. Suche passende Stunde im aktuellen WebUntis-Stundenplan für Fach, Lehrer und Klasse
  let teacherFromUntis = '';
  let klasseFromUntis = '';
  const timetable = appData.timetable || [];
  const matchingLesson = timetable.find(l => isMatchingSubject(l.subject || l.subjectCode, trimmed));
  if (matchingLesson) {
    if (!fullName && matchingLesson.subject) {
      fullName = matchingLesson.subject;
    }
    if (matchingLesson.teacher) {
      teacherFromUntis = matchingLesson.teacher;
    }
    if (matchingLesson.klasse) {
      klasseFromUntis = matchingLesson.klasse;
    }
  }

  // 3. Suche in webuntisLessons (aus WebUntis REST /api/classreg/grade/grading/list)
  if (Array.isArray(appData.webuntisLessons)) {
    const wLesson = appData.webuntisLessons.find(l => {
      const s = (l.subject && (l.subject.name || l.subject.longName)) || l.subjectName || '';
      return isMatchingSubject(s, trimmed);
    });
    if (wLesson) {
      if (!fullName && wLesson.subject) {
        fullName = wLesson.subject.longName || wLesson.subject.name;
      }
      if (!teacherFromUntis && wLesson.teachers && wLesson.teachers[0]) {
        const t = wLesson.teachers[0];
        teacherFromUntis = t.displayName || t.longName || t.name || teachersMap[t.id] || '';
      }
      if (!klasseFromUntis && wLesson.classes && wLesson.classes[0]) {
        const c = wLesson.classes[0];
        klasseFromUntis = c.name || c.longName || klassenMap[c.id] || '';
      }
    }
  }

  // 4. Wenn kein langer Name in WebUntis hinterlegt ist, Kürzel als Fachname verwenden (100% dynamisch)
  if (!fullName) {
    fullName = trimmed;
  }

  // 5. WICHTIG: Lehrer und Klasse NUR für das laufende Schuljahr aus dem aktuellen Stundenplan übernehmen!
  // Für vergangene Schuljahre (z.B. 2025/2026 oder 2024/2025) oder andere Schulen dürfen keine falschen
  // Lehrer oder Klassen des heutigen Tages angezeigt werden, da sich Lehrer und Klassen jedes Jahr ändern.
  const isCurrentSy = (schoolYear === '2026/2027' || schoolYear === (appData.schoolYear && appData.schoolYear.name));
  const teacher = isCurrentSy ? teacherFromUntis : '';
  const klasse = isCurrentSy ? (klasseFromUntis || appData.config.schoolClass || '') : '';

  return {
    code: trimmed,
    name: fullName,
    fullName: fullName,
    teacher: teacher,
    klasse: klasse
  };
}

function setGradeSchoolYear(sy, fromSelect = false) {
  appData.selectedGradeSchoolYear = sy;
  saveAppData();
  renderGradesView(fromSelect);
  announceGradeSchoolYearChange(sy);
}

function announceGradeSchoolYearChange(sy) {
  const allGrades = (appData.auth && appData.auth.isLoggedIn)
    ? (Array.isArray(appData.webuntisGradeList) ? appData.webuntisGradeList : [])
    : ((appData.webuntisGradeList && appData.webuntisGradeList.length > 0) ? appData.webuntisGradeList : (typeof DEFAULT_WEBUNTIS_GRADES !== 'undefined' ? [...DEFAULT_WEBUNTIS_GRADES] : []));
  const activeGrades = (sy === 'all')
    ? allGrades
    : allGrades.filter(g => getGradeSchoolYear(g) === sy);

  const validGrades = activeGrades.filter(g => {
    const mk = g.grade && g.grade.mark;
    return mk && mk.markDisplayValue > 0 && mk.name !== 'leer';
  });
  const gradeSum = validGrades.reduce((sum, g) => sum + g.grade.mark.markDisplayValue, 0);
  const overallGpa = validGrades.length > 0 ? (gradeSum / validGrades.length).toFixed(1).replace('.', ',') : null;

  const label = (sy === '2026/2027')
    ? 'Schuljahr 2026/2027 (Aktuell)'
    : (sy === 'all' ? 'Alle Schuljahre' : `Schuljahr ${sy}`);
  const countText = activeGrades.length === 1 ? '1 Note erfasst' : `${activeGrades.length} Noten erfasst`;
  const schnittText = overallGpa ? `Gesamtschnitt ${overallGpa}` : 'noch keine Noten bewertet';

  const speechText = `${label} ausgewählt. ${countText}. ${schnittText}.`;

  // 1. Lokales aria-live Feedback-Element (polite: lässt NVDA die Option ungestört vorlesen)
  const feedbackEl = document.getElementById('grade-schoolyear-feedback');
  if (feedbackEl) {
    feedbackEl.textContent = '';
    setTimeout(() => { feedbackEl.textContent = speechText; }, 100);
  } else {
    announceSR(speechText, 'polite');
  }

  // 2. Sprachausgabe (TTS) laut sprechen
  speak(speechText, true);
}

function renderGradesView(fromSelect = false) {
  const container = document.getElementById('grades-list-container');
  if (!container) return;

  const allGrades = (appData.auth && appData.auth.isLoggedIn)
    ? (Array.isArray(appData.webuntisGradeList) ? appData.webuntisGradeList : [])
    : ((appData.webuntisGradeList && appData.webuntisGradeList.length > 0) ? appData.webuntisGradeList : (typeof DEFAULT_WEBUNTIS_GRADES !== 'undefined' ? [...DEFAULT_WEBUNTIS_GRADES] : []));
  const exams = appData.exams || [];
  const manualGrades = appData.grades || {};
  const finalMarks = appData.webuntisFinalMarks || {};

  // Schuljahre dynamisch aus allen Noten zählen und Durchschnitte ermitteln
  const syCounts = {};
  const sySums = {};
  const syValidCounts = {};
  allGrades.forEach(g => {
    const sy = getGradeSchoolYear(g);
    if (sy) {
      syCounts[sy] = (syCounts[sy] || 0) + 1;
      const mk = g.grade && g.grade.mark;
      if (mk && mk.markDisplayValue > 0 && mk.name !== 'leer') {
        sySums[sy] = (sySums[sy] || 0) + mk.markDisplayValue;
        syValidCounts[sy] = (syValidCounts[sy] || 0) + 1;
      }
    }
  });
  if (!syCounts['2026/2027']) syCounts['2026/2027'] = 0;

  // Standard-Schuljahr bestimmen: wenn aktuelles Jahr noch 0 Noten hat, 2025/2026 vorauswählen
  let selectedSy = appData.selectedGradeSchoolYear;
  if (!selectedSy) {
    selectedSy = (syCounts['2026/2027'] > 0) ? '2026/2027' : '2025/2026';
    appData.selectedGradeSchoolYear = selectedSy;
  }

  // Alle Schuljahre mit Noten dynamisch auflisten + aktuelles Schuljahr
  const yearKeys = Object.keys(syCounts).sort().reverse();
  const syOptions = yearKeys.map(sy => {
    const cnt = syCounts[sy] || 0;
    const vCnt = syValidCounts[sy] || 0;
    const gpa = vCnt > 0 ? (sySums[sy] / vCnt).toFixed(1).replace('.', ',') : null;
    let label = (sy === '2026/2027') ? `Schuljahr ${sy} (Aktuell)` : `Schuljahr ${sy}`;
    let desc = `${cnt} ${cnt === 1 ? 'Note erfasst' : 'Noten erfasst'}`;
    if (gpa) desc += `, Schnitt Ø ${gpa}`;
    else if (cnt === 0) desc += ', noch kein Schnitt';
    return { id: sy, label, desc };
  });

  const allValidCnt = allGrades.filter(g => g.grade && g.grade.mark && g.grade.mark.markDisplayValue > 0 && g.grade.mark.name !== 'leer');
  const allSum = allValidCnt.reduce((s, g) => s + g.grade.mark.markDisplayValue, 0);
  const allGpa = allValidCnt.length > 0 ? (allSum / allValidCnt.length).toFixed(1).replace('.', ',') : null;
  syOptions.push({
    id: 'all',
    label: 'Alle Schuljahre',
    desc: `${allGrades.length} Noten erfasst${allGpa ? ', Schnitt Ø ' + allGpa : ''}`
  });

  // Oberes Schuljahr-Auswahlmenü (Kombinationsfeld) synchronisieren
  // Wichtig für NVDA: Wenn fromSelect true ist, auf keinen Fall innerHTML anfassen, damit der Screenreader-Fokus nicht abbricht!
  const gradeSySelect = document.getElementById('grade-schoolyear-select');
  if (gradeSySelect) {
    if (!fromSelect) {
      gradeSySelect.innerHTML = syOptions.map(opt => `
        <option value="${escHtml(opt.id)}" ${opt.id === selectedSy ? 'selected' : ''}>
          ${escHtml(opt.label)} – ${escHtml(opt.desc)}
        </option>
      `).join('');
    }
    if (gradeSySelect.value !== selectedSy) {
      gradeSySelect.value = selectedSy;
    }
  }

  // Noten für gewähltes Schuljahr filtern
  const activeGrades = (selectedSy === 'all')
    ? allGrades
    : allGrades.filter(g => getGradeSchoolYear(g) === selectedSy);

  // Statistik berechnen
  const validGrades = activeGrades.filter(g => {
    const mk = g.grade && g.grade.mark;
    return mk && mk.markDisplayValue > 0 && mk.name !== 'leer';
  });
  const gradeSum = validGrades.reduce((sum, g) => sum + g.grade.mark.markDisplayValue, 0);
  const overallGpa = validGrades.length > 0 ? (gradeSum / validGrades.length).toFixed(1) : '--';
  const writtenCount = activeGrades.filter(isWrittenExam).length;
  const oralCount = activeGrades.filter(g => !isWrittenExam(g)).length;

  // Info-Badge neben dem Dropdown aktualisieren
  const infoBadge = document.getElementById('grade-schoolyear-info-badge');
  if (infoBadge) {
    const gpaDisplay = overallGpa !== '--' ? `Ø ${overallGpa.replace('.', ',')}` : 'Kein Schnitt';
    infoBadge.textContent = `${activeGrades.length} Noten • Schnitt ${gpaDisplay}`;
  }

  // Stat-Karten aktualisieren
  const gpaEl = document.getElementById('stat-grade-gpa');
  const totalGradesEl = document.getElementById('stat-grade-total-grades') || document.getElementById('stat-grade-total-exams');
  const writtenEl = document.getElementById('stat-grade-written');
  const oralEl = document.getElementById('stat-grade-oral');
  const gradedExamsEl = document.getElementById('stat-grade-graded-exams');
  const subjectsCountEl = document.getElementById('stat-grade-subjects-count');

  if (gpaEl) gpaEl.textContent = overallGpa !== '--' ? `Ø ${overallGpa.replace('.', ',')}` : '--';
  if (totalGradesEl) totalGradesEl.textContent = String(activeGrades.length);
  if (writtenEl) writtenEl.textContent = String(writtenCount);
  if (oralEl) oralEl.textContent = String(oralCount);
  if (gradedExamsEl) gradedExamsEl.textContent = `${writtenCount} KA / ${oralCount} SL`;

  // Fächerliste ermitteln (100% dynamisch aus WebUntis: Noten, Stundenplan, Lessons)
  let subjectCodes = [];
  const uniqueInGrades = [...new Set(activeGrades.map(g => g.subject).filter(Boolean))];

  if (selectedSy === 'all' || selectedSy !== '2026/2027') {
    // In vergangenen Schuljahren nur die Fächer anzeigen, für die in jenem Schuljahr tatsächlich Noten vorliegen
    subjectCodes = uniqueInGrades;
  } else {
    // Im aktuellen Schuljahr: Alle Fächer aus WebUntis (Notenfächer + WebUntis-Stundenplan + webuntisLessons)
    const liveSubjects = [];
    if (Array.isArray(appData.webuntisLessons) && appData.webuntisLessons.length > 0) {
      appData.webuntisLessons.forEach(l => {
        const s = (l.subject && (l.subject.name || l.subject.longName)) || l.subjectName || '';
        if (s && !liveSubjects.includes(s)) liveSubjects.push(s);
      });
    }
    if (Array.isArray(appData.timetable) && appData.timetable.length > 0) {
      appData.timetable.forEach(l => {
        const s = l.subjectCode || l.subject || '';
        if (s && !liveSubjects.includes(s)) liveSubjects.push(s);
      });
    }

    const combined = [...new Set([...uniqueInGrades, ...liveSubjects])];
    subjectCodes = combined.length > 0 ? combined : uniqueInGrades;
  }

  if (subjectsCountEl) subjectsCountEl.textContent = String(subjectCodes.length);

  // Fächerkarten rendern
  let html = '<h3 class="sr-only">Notenspiegel aller Schulfächer</h3><div class="grades-grid">';

  if (subjectCodes.length === 0) {
    html += `
      <div class="empty-notice" style="grid-column: 1 / -1; padding: 28px; text-align: center; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px;">
        <p style="margin: 0; font-size: 1.15rem; font-weight: 600;">
          <span class="emoji-icon" aria-hidden="true">ℹ️ </span>Keine Schulfächer oder Noten für dieses Schuljahr erfasst.
        </p>
        <p style="margin: 8px 0 0; color: var(--text-muted);">
          Sobald für dieses Schuljahr Schulfächer oder Noten in WebUntis vorliegen, werden diese hier automatisch angezeigt.
        </p>
      </div>
    `;
  }

  subjectCodes.forEach(code => {
    const subj = getSubjectInfo(code, selectedSy);
    const subjGrades = activeGrades.filter(g => isMatchingSubject(g.subject, subj.code));

    // WebUntis Prüfungsarten aus den tatsächlichen Noten dieses Fachs sammeln
    const examTypes = [...new Set(subjGrades.map(g => (g.grade && g.grade.examType && (g.grade.examType.longname || g.grade.examType.name)) || '').filter(Boolean))];
    const examTypesStr = examTypes.join(', ');

    const displayName = (subj.fullName && subj.fullName.toLowerCase().trim() !== subj.code.toLowerCase().trim())
      ? subj.fullName
      : '';

    const subjValid = subjGrades.filter(g => {
      const mk = g.grade && g.grade.mark;
      return mk && mk.markDisplayValue > 0 && mk.name !== 'leer';
    });
    const subjSum = subjValid.reduce((sum, g) => sum + g.grade.mark.markDisplayValue, 0);
    const subjAvg = subjValid.length > 0 ? (subjSum / subjValid.length).toFixed(1) : null;

    const written = subjGrades.filter(isWrittenExam);
    const oral = subjGrades.filter(g => !isWrittenExam(g));

    // Passende anstehende Klausuren aus dem Stundenplan/Kalender (strikt nach gewähltem Schuljahr filtern!)
    const upcomingExams = exams.filter(ex => {
      if (!isMatchingSubject(ex.subject || ex.subjectCode, subj.code)) return false;
      if (selectedSy === 'all') return true;
      return getExamSchoolYear(ex) === selectedSy;
    });

    // Offizielle WebUntis-Zeugnisnote prüfen (nur im aktuellen Schuljahr oder 'all')
    let officialMarkDisplay = null;
    if (selectedSy === '2026/2027' || selectedSy === 'all') {
      const fm = finalMarks[subj.lessonId || subj.id];
      if (fm && fm.assignedMark && (fm.assignedMark.name || fm.assignedMark.markValue > 0)) {
        officialMarkDisplay = fm.assignedMark.name || `Note ${fm.assignedMark.markValue / 100}`;
      }
    }

    html += `
      <article class="grade-subject-card" role="article" aria-label="Fach ${escHtml(subj.fullName || subj.code)}, ${subjAvg ? 'Notendurchschnitt ' + subjAvg.replace('.', ',') : 'Keine Noten'}">
        <div class="grade-subject-header">
          <div>
            <h3 class="grade-subject-title">
              <span class="homework-subject">${escHtml(subj.code)}</span>
              ${displayName ? `<span class="sr-only">: </span><span class="grade-subject-name">${escHtml(displayName)}</span>` : ''}
            </h3>
            <div class="field-hint" style="margin-top: 4px;">
              ${subj.teacher ? `<span class="meta-item"><span class="emoji-icon" aria-hidden="true">👨‍🏫 </span>${escHtml(subj.teacher)}</span>` : ''}
              ${subj.teacher && subj.klasse ? ' • ' : ''}
              ${subj.klasse ? `<span class="meta-item"><span class="emoji-icon" aria-hidden="true">🏫 </span>Klasse ${escHtml(subj.klasse)}</span>` : ''}
              ${!subj.teacher && !subj.klasse ? `
                <span class="meta-item"><span class="emoji-icon" aria-hidden="true">📅 </span>Schuljahr ${escHtml(selectedSy === 'all' ? 'Gesamthistorie' : selectedSy)}</span>
                ${examTypesStr ? ` • <span class="meta-item"><span class="emoji-icon" aria-hidden="true">📋 </span>${escHtml(examTypesStr)}</span>` : ''}
              ` : ''}
            </div>
          </div>
          <div>
            ${officialMarkDisplay ? `
              <span class="grade-average-badge" style="background: #15803d; color: #ffffff;" title="Offizielle Zeugnisnote: ${escHtml(officialMarkDisplay)}">
                <span class="emoji-icon" aria-hidden="true">🏆 </span>${escHtml(officialMarkDisplay)}
              </span>
            ` : (subjAvg ? `
              <span class="grade-average-badge" title="Notendurchschnitt ${subjAvg.replace('.', ',')} aus ${subjGrades.length} Noten">
                Ø ${subjAvg.replace('.', ',')}
              </span>
            ` : `
              <span class="field-hint" style="font-weight: bold; color: var(--accent-primary);">
                <span class="emoji-icon" aria-hidden="true">⚡ </span>Laufend
              </span>
            `)}
          </div>
        </div>

        <div style="padding: 10px 14px; background: var(--bg-surface-elevated); border-radius: var(--radius-sm); margin: 10px 0; font-size: 13.5px;">
          ${officialMarkDisplay ? `
            <div style="color: #15803d; font-weight: bold;">
              <span class="emoji-icon" aria-hidden="true">✅ </span>Offizielle Zeugnisnote aus WebUntis: <strong>${escHtml(officialMarkDisplay)}</strong>
            </div>
          ` : (subjGrades.length > 0 ? `
            <div style="color: var(--text-secondary);">
              <span class="emoji-icon" aria-hidden="true">📊 </span><strong>Leistungsstand:</strong> ${subjGrades.length} Noten erfasst (Ø ${subjAvg ? subjAvg.replace('.', ',') : '--'}) • ${written.length} Klassenarbeiten, ${oral.length} sonstige Leistungen.
            </div>
          ` : `
            <div style="color: var(--text-secondary);">
              <span class="emoji-icon" aria-hidden="true">📋 </span><strong>Status:</strong> Noch keine Noten für ${escHtml(selectedSy === 'all' ? 'dieses Fach' : 'Schuljahr ' + selectedSy)} eingetragen.
            </div>
          `)}
        </div>

        <!-- 1. KLASSENARBEITEN -->
        ${written.length > 0 ? `
          <div class="grade-section" style="margin-bottom: 12px;">
            <h4 class="grade-exams-heading">
              <span class="emoji-icon" aria-hidden="true">📝 </span>Klassenarbeiten (${written.length}):
            </h4>
            <div class="grade-exams-list">
              ${written.map((gItem, idx) => {
                const gr = gItem.grade || {};
                const mk = gr.mark || {};
                const markVal = mk.markDisplayValue > 0 ? mk.markDisplayValue : null;
                const markName = mk.name && mk.name !== 'leer' ? mk.name : 'Noch nicht bewertet';
                const badgeClass = getGradeBadgeClass(markVal);
                const dateStr = formatGradeDate(gr.date);
                const title = (gr.exam && gr.exam.name) || (gr.examType && gr.examType.name) || `Klassenarbeit ${idx + 1}`;

                return `
                  <div class="grade-exam-row">
                    <div style="flex: 1; min-width: 180px;">
                      <h5 class="grade-exam-name">Klassenarbeit ${idx + 1}: ${escHtml(title)}</h5>
                      <div class="field-hint">
                        <span class="emoji-icon" aria-hidden="true">📅 </span>${escHtml(dateStr)}
                        ${gr.examType && gr.examType.name ? ` • <span class="emoji-icon" aria-hidden="true">📋 </span>${escHtml(gr.examType.name)}` : ''}
                      </div>
                      ${gr.text ? `
                        <div class="grade-teacher-note">
                          <span class="emoji-icon" aria-hidden="true">💬 </span>${escHtml(gr.text)}
                        </div>
                      ` : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <span class="grade-badge-value ${badgeClass}" title="Note: ${escHtml(markName)} (${markVal ? markVal.toFixed(1) : '-'})">
                        ${markVal ? markVal.toFixed(1) : 'Offen'}
                      </span>
                      <span class="grade-mark-text">${escHtml(markName)}.</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- 2. SONSTIGE LEISTUNGEN & MITARBEIT -->
        ${oral.length > 0 ? `
          <div class="grade-section" style="margin-bottom: 12px;">
            <h4 class="grade-exams-heading">
              <span class="emoji-icon" aria-hidden="true">💬 </span>Sonstige Leistungen &amp; Mitarbeit (${oral.length}):
            </h4>
            <div class="grade-exams-list">
              ${oral.map((gItem, idx) => {
                const gr = gItem.grade || {};
                const mk = gr.mark || {};
                const markVal = mk.markDisplayValue > 0 ? mk.markDisplayValue : null;
                const markName = mk.name && mk.name !== 'leer' ? mk.name : 'Noch nicht bewertet';
                const badgeClass = getGradeBadgeClass(markVal);
                const dateStr = formatGradeDate(gr.date);
                const typeName = (gr.examType && gr.examType.name) || 'Sonstige Leistung';

                return `
                  <div class="grade-exam-row">
                    <div style="flex: 1; min-width: 180px;">
                      <h5 class="grade-exam-name">Leistung ${idx + 1}: ${escHtml(gr.text || typeName)}</h5>
                      <div class="field-hint">
                        <span class="emoji-icon" aria-hidden="true">📅 </span>${escHtml(dateStr)} • <span class="emoji-icon" aria-hidden="true">📋 </span>${escHtml(typeName)}
                      </div>
                      ${gr.text ? `
                        <div class="grade-teacher-note">
                          <span class="emoji-icon" aria-hidden="true">💬 </span>Bemerkung: ${escHtml(gr.text)}
                        </div>
                      ` : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <span class="grade-badge-value ${badgeClass}" title="Note: ${escHtml(markName)} (${markVal ? markVal.toFixed(1) : '-'})">
                        ${markVal ? markVal.toFixed(1) : 'Offen'}
                      </span>
                      <span class="grade-mark-text">${escHtml(markName)}.</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- 3. ANSTEHENDE KLAUSUREN AUS DEM STUNDENPLAN -->
        ${upcomingExams.length > 0 ? `
          <div class="grade-section">
            <h4 class="grade-exams-heading">
              <span class="emoji-icon" aria-hidden="true">⏳ </span>Anstehende Klausurtermine (${upcomingExams.length}):
            </h4>
            <div class="grade-exams-list">
              ${upcomingExams.map((ex, idx) => {
                const gr = manualGrades[ex.id];
                const hasGrade = gr && gr.mark;
                const markVal = hasGrade ? parseFloat(gr.mark) : null;
                const badgeClass = getGradeBadgeClass(markVal);
                const dateFormatted = ex.date ? formatGermanDate(new Date(ex.date)) : 'Termin offen';

                return `
                  <div class="grade-exam-row">
                    <div style="flex: 1; min-width: 180px;">
                      <h5 class="grade-exam-name">Prüfung ${idx + 1}: ${escHtml(ex.name || subj.code)}</h5>
                      <div class="field-hint">
                        <span class="emoji-icon" aria-hidden="true">📅 </span>${escHtml(dateFormatted)} • <span class="emoji-icon" aria-hidden="true">⏰ </span>${escHtml(ex.startTime || '07:45')} - ${escHtml(ex.endTime || '09:15')} Uhr • <span class="emoji-icon" aria-hidden="true">🚪 </span>${escHtml(ex.room || 'Raum laut Plan')}
                      </div>
                      ${gr && gr.note ? `
                        <div class="grade-teacher-note">
                          <span class="emoji-icon" aria-hidden="true">💬 </span>${escHtml(gr.note)}
                        </div>
                      ` : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <span class="grade-badge-value ${badgeClass}" title="${hasGrade ? 'Eingetragene Note: ' + gr.mark : 'Ausstehend / noch nicht benotet'}">
                        ${hasGrade ? gr.mark : 'Offen'}
                      </span>
                      <button type="button" class="btn btn-secondary" style="min-height: 36px; padding: 4px 10px; font-size: 13px;" onclick="openAddGradeModal('${ex.id}')" aria-label="Notiz oder Note zu Klausur am ${dateFormatted} eintragen">
                        <span><span class="emoji-icon" aria-hidden="true">${hasGrade ? '✏️ ' : '➕ '}</span>Notiz</span>
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        ${subjGrades.length === 0 && upcomingExams.length === 0 ? `
          <p class="field-hint" style="padding: 6px 0;">Keine Noten oder Klausuren für dieses Fach im gewählten Schuljahr (${escHtml(selectedSy === 'all' ? 'Alle' : selectedSy)}) eingetragen.</p>
        ` : ''}

      </article>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

function openAddGradeModal(examId) {
  const modal = document.getElementById('modal-add-grade');
  const select = document.getElementById('grade-exam-select');
  const markSelect = document.getElementById('grade-mark-select');
  const pointsInput = document.getElementById('grade-points-input');
  const noteInput = document.getElementById('grade-note-input');
  if (!modal || !select) return;

  const exams = appData.exams || [];
  select.innerHTML = '';

  exams.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex.id;
    const dateFormatted = ex.date ? formatGermanDate(new Date(ex.date)) : 'Termin';
    opt.textContent = `${ex.subject} am ${dateFormatted} (${ex.name || 'Klausur'})`;
    if (examId && String(ex.id) === String(examId)) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  const currentExamId = select.value;
  const existingGrade = appData.grades ? appData.grades[currentExamId] : null;

  if (existingGrade) {
    if (markSelect) markSelect.value = existingGrade.mark || '2.0';
    if (pointsInput) pointsInput.value = existingGrade.points || '';
    if (noteInput) noteInput.value = existingGrade.note || '';
  } else {
    if (markSelect) markSelect.value = '2.0';
    if (pointsInput) pointsInput.value = '';
    if (noteInput) noteInput.value = '';
  }

  modal.style.display = 'flex';
  if (markSelect) markSelect.focus();
  announceSR('Dialog Klausurnote eintragen geöffnet.', 'polite');
}

function closeGradeModal() {
  const modal = document.getElementById('modal-add-grade');
  if (modal) modal.style.display = 'none';
}

function handleGradeModalBackdropClick(e) {
  if (e.target && e.target.id === 'modal-add-grade') {
    closeGradeModal();
  }
}

function handleGradeExamSelectionChange() {
  const select = document.getElementById('grade-exam-select');
  const markSelect = document.getElementById('grade-mark-select');
  const pointsInput = document.getElementById('grade-points-input');
  const noteInput = document.getElementById('grade-note-input');
  if (!select) return;

  const exId = select.value;
  const existing = appData.grades ? appData.grades[exId] : null;
  if (existing) {
    if (markSelect) markSelect.value = existing.mark || '2.0';
    if (pointsInput) pointsInput.value = existing.points || '';
    if (noteInput) noteInput.value = existing.note || '';
  } else {
    if (markSelect) markSelect.value = '2.0';
    if (pointsInput) pointsInput.value = '';
    if (noteInput) noteInput.value = '';
  }
}

function handleSaveGradeSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();

  const select = document.getElementById('grade-exam-select');
  const markSelect = document.getElementById('grade-mark-select');
  const pointsInput = document.getElementById('grade-points-input');
  const noteInput = document.getElementById('grade-note-input');
  if (!select || !markSelect) return;

  const examId = select.value;
  const mark = markSelect.value;
  const points = pointsInput ? pointsInput.value.trim() : '';
  const note = noteInput ? noteInput.value.trim() : '';

  if (!appData.grades) appData.grades = {};
  appData.grades[examId] = {
    examId: examId,
    mark: mark,
    points: points,
    note: note,
    updatedAt: new Date().toISOString()
  };

  saveAppData();
  closeGradeModal();
  renderGradesView();

  const matchingEx = (appData.exams || []).find(x => String(x.id) === String(examId));
  const subjName = matchingEx ? matchingEx.subject : 'Klausur';

  const msg = `Note ${mark} für ${subjName} wurde erfolgreich gespeichert.`;
  speak(msg, true);
  announceSR(msg, 'assertive');
}

function readGradesSummary() {
  const allGrades = (appData.auth && appData.auth.isLoggedIn)
    ? (Array.isArray(appData.webuntisGradeList) ? appData.webuntisGradeList : [])
    : ((appData.webuntisGradeList && appData.webuntisGradeList.length > 0) ? appData.webuntisGradeList : (typeof DEFAULT_WEBUNTIS_GRADES !== 'undefined' ? [...DEFAULT_WEBUNTIS_GRADES] : []));
  const selectedSy = appData.selectedGradeSchoolYear || '2025/2026';
  const activeGrades = (selectedSy === 'all')
    ? allGrades
    : allGrades.filter(g => getGradeSchoolYear(g) === selectedSy);

  const validGrades = activeGrades.filter(g => {
    const mk = g.grade && g.grade.mark;
    return mk && mk.markDisplayValue > 0 && mk.name !== 'leer';
  });
  const gradeSum = validGrades.reduce((sum, g) => sum + g.grade.mark.markDisplayValue, 0);
  const overallGpa = validGrades.length > 0 ? (gradeSum / validGrades.length).toFixed(1).replace('.', ',') : null;
  const writtenCount = activeGrades.filter(isWrittenExam).length;
  const oralCount = activeGrades.filter(g => !isWrittenExam(g)).length;

  const syLabel = selectedSy === 'all' ? 'allen Schuljahren' : `dem Schuljahr ${selectedSy}`;
  let speech = `Offizielle WebUntis Notenübersicht für ${syLabel}. `;

  if (activeGrades.length === 0) {
    speech += 'Für dieses Schuljahr sind noch keine Noten in WebUntis eingetragen.';
  } else {
    if (overallGpa) {
      speech += `Dein aktueller Notendurchschnitt liegt bei Note ${overallGpa}. `;
    }
    speech += `Es sind insgesamt ${activeGrades.length} Noten erfasst, davon ${writtenCount} Klassenarbeiten und ${oralCount} sonstige Leistungen. `;

    // Noten der wichtigsten Fächer ansagen
    const uniqueSubjs = [...new Set(activeGrades.map(g => g.subject).filter(Boolean))];
    const topSummaries = [];
    uniqueSubjs.slice(0, 5).forEach(c => {
      const info = getSubjectInfo(c);
      const sGrades = activeGrades.filter(g => isMatchingSubject(g.subject, c));
      const sValid = sGrades.filter(g => g.grade && g.grade.mark && g.grade.mark.markDisplayValue > 0 && g.grade.mark.name !== 'leer');
      if (sValid.length > 0) {
        const avg = (sValid.reduce((sum, g) => sum + g.grade.mark.markDisplayValue, 0) / sValid.length).toFixed(1).replace('.', ',');
        topSummaries.push(`${info.name}: Durchschnitt ${avg} aus ${sGrades.length} Noten`);
      }
    });

    if (topSummaries.length > 0) {
      speech += topSummaries.join('. ') + '. ';
    }
  }

  speak(speech, true);
  announceSR(speech, 'assertive');
}





// =============================================================================
// 14. MENSA & SPEISEPLÄNE (REITER 8)
// Offizielle Speisepläne der Mensa LWL-Von-Vincke-Schule & BBW Soest
// =============================================================================

const DEFAULT_CANTEEN_DATA = {"source": "LWL-Von-Vincke-Schule Soest & BBW Soest", "sourceUrl": "https://www.lwl-von-vincke-schule.de/de/aktuelles/speiseplane/", "lastUpdated": "2026-09-13T17:40:00Z", "weeks": [{"weekId": "kw38", "kw": 38, "label": "Diese Woche (KW 38: 14.09. – 17.09.2026)", "dateRange": "14.09. bis 17.09.2026", "isCurrent": true, "days": [{"day": "Montag", "date": "14.09.2026", "breakfast": "Gouda", "menu1": "6 Geflügel Cevapcici E,G,D\nZaziki M;\ntomatisierter Gemüsereis C\nWeißkohl-Paprikasalat in Essig/Öldressing Dressing Bio Vanillejoghurt M", "menu2": "6 Geflügel Cevapcici E,G,D\nZaziki M;\ntomatisierterGemüsereis C\nWeißkohl-Paprikasalat in\nEssig/Öldressing D\nBio Vanillejoghurt M", "menu3": "Gemüsenuggets C\nfruchtige Currysoße M\nKartoffelwedges\nWeißkohl-Paprikasalat in\nEssig/Öldressing D\nBio Vanillejoghurt M", "extra": "Eine Salattheke mit diversen Salaten und Dressinge , zur Selbstbedienung steht für Sie bereit", "dinner": "Geflügelfrisch wurst, Geflügel dauerwurst"}, {"day": "Dienstag", "date": "15.09.2026", "breakfast": "Edamer", "menu1": "Schweinerückesteak auf griechischer Art E,G\nZwiebel-Senfsenfdip\nrustikaler Salat mit Hirtenkäse in pikanten Kräuterdip C,D\nFladenbrot G,\nZitronenkuchen GE", "menu2": "Putensteak auf griechischer Art E,G\nZwiebel-Senfsenfdip\nrustikaler Salat mit Hirtenkäse in pikanten Kräuterdip C,D\nFladenbrot G\nZitronenkuchen G,E", "menu3": "2 Hot Dogs M;G;C;D\nvegetarische Bockwurst, Hot- Dogbrötchen, hausgemachte Hot- Dogsauce, Tomatenketchup, Röstzwiebel\nSalatbeilage Kräuterdressing C;H\nZitronenkuchen G,E", "extra": "Tagessuppe", "dinner": "Geflügelleber-wurst\nBitte über den Tagesanforderungsschein bestellen."}, {"day": "Mittwoch", "date": "16.09.2026", "breakfast": "Tilsiter\nFruchtjoghurt oder Fruchtquark speise", "menu1": "Hähnchenschnitzel G,H,E\nRahmsoße M\nKartoffelkroketten\nbunter Gemüsemix M\nSchokopudding mit Sahne M,S", "menu2": "Hähnchenschnitzel G,H,E\nRahmsoße M\nKartoffelkroketten\nbunter Gemüsemix M\nSchokopudding mit Sahne M,S", "menu3": "Kartoffelpizza\ndiverse Gemüse, Tomate mit veganem Käse überbacken C,G,M\nSalatbeilage mit Joghurtdressing\nSchokopudding mit Sahne M,S", "extra": "Eine Salattheke mit diversen Salaten und Dressinge , zur Selbstbedienung steht für Sie bereit", "dinner": "Toast Hawaii"}, {"day": "Donnerstag", "date": "17.09.2026", "breakfast": "Butterkäse oder\nMaasdamer", "menu1": "Tortellini mit Rindfleischfüllung\nfruchtiger Tomatensoße G,M,E,C geriebener Hartkäse\ngemischte Salatbeilage mit Joghurtdressing M\nObst", "menu2": "Tortellini mit Rindfleischfüllung\nfruchtiger Tomatensoße G,M,E,C geriebener Hartkäse\nSalatbeilage mit Joghurtdressing M\nObst", "menu3": "Eierpfannkuchen mit Spinat und Mozzarella gefüllt. G,E,M\nGemüse-Bulgur C,G\nObst", "extra": "", "dinner": "Geflügelfrisch wurst, Geflügel dauerwurst"}]}, {"weekId": "kw39", "kw": 39, "label": "Nächste Woche (KW 39: 21.09. – 24.09.2026)", "dateRange": "21.09. bis 24.09.2026", "isCurrent": false, "days": [{"day": "Montag", "date": "21.09.2026", "breakfast": "Gouda", "menu1": "Hähnchencrossies G,M,E\nfruchtige Currysoße M\nReis\ngemischter Salat\nmit Joghurtdressing M\nObstsalat", "menu2": "Hähnchencrossies G,M,E\nfruchtige Currysoße M\nReis\ngemischter Salat\nmit Joghurtdressing M\nObstsalat", "menu3": "Gemüseknusperrösti S,H,G,E\nFrischkäse-Kräuterdip M\nReis\ngemischter Salatteller\nmit Joghurtdressing M\nObstsalat", "extra": "Eine Salattheke mit diversen Salaten und Dressinge, steht zur Selbstbedienung für Sie bereit", "dinner": "Geflügelfrisch wurst, Geflügel dauerwurst"}, {"day": "Dienstag", "date": "22.09.2026", "breakfast": "Edamer", "menu1": "Fischfilet gebacken E,G,\nTomatencremesoße\nMexicogemüse\nKartoffelplätzchen\nVanillecreme mit Sahne M", "menu2": "Geflügelhacksteak\nTomatencremesoße\nMexicogemüse\nKartoffelplätzchen\nVanillecreme mit Sahne M", "menu3": "5 Gemüse-Maultaschen\nBlumenkohl-Schnittlauchcremesauce\nPfannengemüse Pastinake, Möhre und Kohlrabi\nG,E,C,M Vanillecreme mit Sahne M", "extra": "Tagessuppe", "dinner": "Mozzarella\nBitte über den Tagesanforderungsschein bestellen"}, {"day": "Mittwoch", "date": "23.09.2026", "breakfast": "Tilsiter\nFruchtjoghurt oder Fruchtquark speise", "menu1": "Nudelauflauf\nmit Gemüse, gebratenen Putenbrustgeschnetzeltem und Käse überbachen G,E,H,M\nRahmsoße M,\nEisdessert G,S", "menu2": "Nudelauflauf\nmit Gemüse und Käse überbachen G,E,H,M\nRahmsoße M,\nEisdessert G,S", "menu3": "Tortellini mit Ricottafüllung\nfruchtige Paprika-Tomatensoße M,G,C,E,D\nSalatbeilage mit Thousend Islanddressing M,C,\nEisdessert G,S", "extra": "Eine Salattheke mit diversen Salaten und Dressinge, steht zur Selbstbedienung für Sie bereit", "dinner": "Coleslaw\namerikanischer Krautsalat. Weißkohl, Möhre, Joghurt-Majonnaisedressing M"}, {"day": "Donnerstag", "date": "24.09.2026", "breakfast": "Butterkäse oder\nMaasdamer", "menu1": "Chili con carne\nRindfleisch, Kidneybohnen,Tomaten, Paprika, Mais,Möhre, Sellerie Zwiebel in pikanter Soße C,G\nhausgemachtes Baguettebrot G\nMilchreis mit Topping M,S", "menu2": "Chili con carne\nRindfleisch, Kidneybohnen,Tomaten, Paprika, Mais,Möhre, Sellerie Zwiebel in pikanter Soße C,G\nhausgemachtes Baguettebrot G\nMilchreis mit Topping M,S", "menu3": "Süßkartoffel-Schupfnudel-Topf\nverschiedene Gemüse, gebratene Sojawürfel\nGemüse-Veloûte M,G,E,A,C\nMilchreis mit Topping M,S", "extra": "", "dinner": "Geflügelfrisch wurst, Geflügel dauerwurst"}]}, {"weekId": "kw37", "kw": 37, "label": "Vorige Woche (KW 37: 07.09. – 10.09.2026)", "dateRange": "07.09. bis 10.09.2026", "isCurrent": false, "days": [{"day": "Montag", "date": "07.09.2026", "breakfast": "Gouda", "menu1": "leicht gebratenes Hahnchenbrustfilet\nChampignoncremesosse M,G,D,C Brokkoligemüse mit Mandelbutter M,S\nReis G,E,M,C\nFruchtjoghurt M,", "menu2": "leicht gebratenes Hahnchenbrustfilet\nCremesosse M,G,D,C Brokkoligemüse mit Mandelbutter M,S\nReis G,E,M,C\nFruchtjoghurt M", "menu3": "2 Gemüse-Knusperbagel Schnittlauchrahmdip M\nBrokkoligemüse mit Mandelbutter M,S\nFruchjoghurt M", "extra": "Eine Salattheke mit diversen Salaten und Dressinge, steht zur Selbstbedienung für Sie bereit", "dinner": "Geflügelfrisch- wurst, Geflügel dauerwurst"}, {"day": "Dienstag", "date": "08.09.2026", "breakfast": "Edamer", "menu1": "Geschnetzeltes vom Schwein\nmit Gemüse M,C\nButterspätzle E,G,M\nGrießpudding G,M", "menu2": "Putenragout\nmit Gemüse M,C\nButterspätzle E,G,M\nGrießpudding G,M", "menu3": "Salat-Boule\ndiverse Blattsalate und Rohkostsalate,Fetakäse, gekochtes Ei, Baguettebrot G\nEssig/Öldressing D,C\nJoghurtdressing M\nGrießpudding G,M", "extra": "Tagessuppe", "dinner": "Fleischwurst am Stück\nBitte über den Tagesanforderungsschein bestellen"}, {"day": "Mittwoch", "date": "09.09.2026", "breakfast": "Tilsiter\nFruchtjoghurt oder Fruchtquark speise", "menu1": "Döner Teller\nHähnchenfleisch, Salate,\nJoghurtsoße, scharfe Soße,\nPommes-frites\nSchokocreme M,S", "menu2": "Döner Teller\nHähnchenfleisch, Salate,\nJoghurtsoße, scharfe Soße,\nPommes-frites\nSchokocreme M,S", "menu3": "Nudel Bolognese G vegetarische Bolognesesoße A,C,H,S geriebener Hartkäse Salatbeilage Italiendressing C,D\nSchokocreme M,S", "extra": "Eine Salattheke mit diversen Salaten und Dressinge, steht zur Selbstbedienung für Sie bereit", "dinner": "Nudelsalat G,M,E\nmit Geflügelfleischwurst-streifen, gekochtem Ei, Erbsen und Paprikawürfel, in Majonnaisecreme"}, {"day": "Donnerstag", "date": "10.09.2026", "breakfast": "", "menu1": "Grünkernhacksteak natur C,E,D,G,\nBratensoße Provencial G,C,\nReis\nRatatouillegemüse\nObst", "menu2": "gebackene Ofenkartoffel\nSchnittlauchrahmdip M Blumenkohl, Brokkoli mit Semmelbröselbutter Petersilie,gekochtes Ei M,G,E\nObst", "menu3": "gebackene Champignons G,A,E,9,10\ngebackener Blumenkohl G,A,E,9,10\nZaziki M\nBulgur mit Paprikastücken G\nObst", "extra": "", "dinner": ""}]}]};

function getCanteenData() {
  if (appData.canteen && appData.canteen.weeks && appData.canteen.weeks.length > 0) {
    return appData.canteen;
  }
  return DEFAULT_CANTEEN_DATA;
}

function getFullCanteenWeeksList(canteenData) {
  const data = canteenData || getCanteenData();
  const knownWeeks = (data && data.weeks) ? data.weeks : [];
  const knownDict = {};
  knownWeeks.forEach(w => { if (w.weekId) knownDict[w.weekId] = w; });

  const weekDefs = [
    { kw: 37, dateRange: '07.09. bis 10.09.2026', label: 'Vorige Woche (KW 37: 07.09. – 10.09.2026)' },
    { kw: 38, dateRange: '14.09. bis 17.09.2026', label: 'Diese Woche (KW 38: 14.09. – 17.09.2026)', isCurrent: true },
    { kw: 39, dateRange: '21.09. bis 24.09.2026', label: 'Nächste Woche (KW 39: 21.09. – 24.09.2026)' },
    { kw: 40, dateRange: '28.09. bis 01.10.2026', label: 'Kalenderwoche 40 (28.09. – 01.10.2026)' },
    { kw: 41, dateRange: '05.10. bis 08.10.2026', label: 'Kalenderwoche 41 (05.10. – 08.10.2026)' },
    { kw: 42, dateRange: '12.10. bis 15.10.2026', label: 'Kalenderwoche 42 (12.10. – 15.10.2026)' },
    { kw: 43, dateRange: '19.10. bis 22.10.2026', label: 'Kalenderwoche 43 (Herbstferien NRW)' },
    { kw: 44, dateRange: '26.10. bis 29.10.2026', label: 'Kalenderwoche 44 (Herbstferien NRW)' }
  ];

  return weekDefs.map(wdef => {
    const wid = `kw${wdef.kw}`;
    if (knownDict[wid]) {
      const k = knownDict[wid];
      return {
        weekId: wid,
        kw: wdef.kw,
        label: k.label || wdef.label,
        dateRange: k.dateRange || wdef.dateRange,
        isCurrent: !!k.isCurrent || !!wdef.isCurrent,
        hasData: Array.isArray(k.days) && k.days.length > 0,
        days: k.days || []
      };
    }
    return {
      weekId: wid,
      kw: wdef.kw,
      label: wdef.label,
      dateRange: wdef.dateRange,
      isCurrent: !!wdef.isCurrent,
      hasData: false,
      days: []
    };
  });
}

function setCanteenWeek(weekId, fromSelect = false) {
  if (appData.selectedCanteenWeek === weekId) return;
  appData.selectedCanteenWeek = weekId;
  saveAppData();
  renderCanteenView(fromSelect);
  if (!fromSelect) {
    const allWeeks = getFullCanteenWeeksList();
    const wk = allWeeks.find(w => w.weekId === weekId);
    const label = wk ? wk.label : weekId;
    announceSR(`Speiseplan für ${label} geladen.`, 'polite');
  }
}

function changeCanteenWeek(delta) {
  const allWeeks = getFullCanteenWeeksList();
  let currentIdx = allWeeks.findIndex(w => w.weekId === appData.selectedCanteenWeek);
  if (currentIdx === -1) currentIdx = 1; // default to KW 38
  let newIdx = currentIdx + delta;
  if (newIdx < 0) newIdx = 0;
  if (newIdx >= allWeeks.length) newIdx = allWeeks.length - 1;
  setCanteenWeek(allWeeks[newIdx].weekId, false);
}

function setCanteenDay(dayName) {
  appData.selectedCanteenDay = dayName;
  saveAppData();
  renderCanteenView();
  const label = dayName === 'all' ? 'Alle Wochentage' : dayName;
  announceSR(`Tagesfilter ${label} aktiviert.`, 'polite');
}

function isCanteenDateToday(dateStr) {
  if (!dateStr) return false;
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = String(now.getFullYear());
  const todayFormatted = `${d}.${m}.${y}`;
  return dateStr.trim() === todayFormatted;
}

function renderCanteenView(fromSelect = false) {
  const container = document.getElementById('canteen-days-container');
  if (!container) return;

  const data = getCanteenData();
  const allWeeks = getFullCanteenWeeksList(data);

  // 1. Wochenauswahl-Dropdown synchronisieren
  let selectedWeekId = appData.selectedCanteenWeek;
  if (!selectedWeekId || !allWeeks.some(w => w.weekId === selectedWeekId)) {
    const currentWk = allWeeks.find(w => w.isCurrent) || allWeeks[1];
    selectedWeekId = currentWk ? currentWk.weekId : 'kw38';
    appData.selectedCanteenWeek = selectedWeekId;
  }

  const weekSelect = document.getElementById('canteen-week-select');
  if (weekSelect) {
    const currentCount = weekSelect.options ? weekSelect.options.length : 0;
    if (currentCount !== allWeeks.length) {
      weekSelect.innerHTML = allWeeks.map(w => `
        <option value="${escHtml(w.weekId)}" ${w.weekId === selectedWeekId ? 'selected' : ''}>
          ${escHtml(w.label)} ${w.hasData ? '(Speiseplan verfügbar)' : '(Noch kein Plan)'}
        </option>
      `).join('');
    }
    if (weekSelect.value !== selectedWeekId) {
      weekSelect.value = selectedWeekId;
    }
  }

  // 2. Schnellwahl-Buttons für Wochen
  const quickNav = document.getElementById('canteen-week-quick-nav');
  if (quickNav) {
    const quickItems = [
      { id: 'kw37', label: 'KW 37 (Vorige)' },
      { id: 'kw38', label: 'KW 38 (Diese Woche)' },
      { id: 'kw39', label: 'KW 39 (Nächste)' },
      { id: 'kw40', label: 'KW 40' }
    ];
    quickNav.innerHTML = quickItems.map(item => {
      const isSel = (selectedWeekId === item.id);
      return `
        <button type="button" 
                class="canteen-day-btn ${isSel ? 'active' : ''}" 
                style="font-size: 13px; padding: 5px 10px;" 
                onclick="setCanteenWeek('${item.id}', false)"
                aria-label="${escHtml(item.label)}">
          ${escHtml(item.label)}
        </button>
      `;
    }).join('');
  }

  // 3. Status- und Quellen-Banner
  const statusBanner = document.getElementById('canteen-status-banner');
  if (statusBanner) {
    statusBanner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span class="canteen-source-tag">
          <span class="emoji-icon" aria-hidden="true">🏫 </span>
          <strong>Quelle:</strong> ${escHtml(data.source || 'LWL-Bildungszentrum Soest')}
        </span>
        <span style="color: var(--text-secondary); font-size: 13.5px;">
          <span class="emoji-icon" aria-hidden="true">🕒 </span>Stand: ${escHtml(data.lastUpdated || 'Aktuell')}
        </span>
      </div>
      <div style="font-size: 13.5px; color: var(--text-secondary);">
        <span class="emoji-icon" aria-hidden="true">ℹ️ </span>Offizieller Speiseplan (Mo–Do Vollkost, Muslimisch &amp; Vegetarisch)
      </div>
    `;
  }

  // 4. Tages-Schnellfilter-Leiste
  const dayFilterBar = document.getElementById('canteen-day-filter-bar');
  const selectedDay = appData.selectedCanteenDay || 'all';

  if (dayFilterBar) {
    const dayButtons = [
      { id: 'all', label: 'Ganze Woche' },
      { id: 'Montag', label: 'Montag' },
      { id: 'Dienstag', label: 'Dienstag' },
      { id: 'Mittwoch', label: 'Mittwoch' },
      { id: 'Donnerstag', label: 'Donnerstag' }
    ];

    dayFilterBar.innerHTML = dayButtons.map(btn => {
      const isActive = (selectedDay === btn.id);
      return `
        <button type="button" 
                class="canteen-day-btn ${isActive ? 'active' : ''}" 
                role="tab" 
                aria-selected="${isActive}" 
                onclick="setCanteenDay('${btn.id}')"
                aria-label="${btn.label} anzeigen">
          ${escHtml(btn.label)}
        </button>
      `;
    }).join('');
  }

  // 5. Gewählte Woche ermitteln & Tage darstellen
  const activeWeek = allWeeks.find(w => w.weekId === selectedWeekId) || allWeeks[1];
  
  // Wenn noch kein Speiseplan für diese Woche vorliegt:
  if (!activeWeek || !activeWeek.hasData || !activeWeek.days || activeWeek.days.length === 0) {
    container.innerHTML = `
      <article class="canteen-day-card" style="padding: 34px 20px; text-align: center; border: 2px dashed var(--accent-primary); background: var(--bg-surface-elevated);" aria-labelledby="heading-no-canteen-plan">
        <h3 id="heading-no-canteen-plan" class="canteen-day-title" style="justify-content: center; font-size: 1.3rem; margin-bottom: 12px;">
          <span class="emoji-icon" aria-hidden="true">📅 </span>Für diese Woche liegt noch kein Speiseplan vor
        </h3>
        <p style="font-size: 16px; color: var(--text-primary); max-width: 620px; margin: 0 auto 16px auto; line-height: 1.6;">
          Für die <strong>Kalenderwoche ${activeWeek ? activeWeek.kw : ''} (${escHtml(activeWeek ? activeWeek.dateRange : '')})</strong> hat die Mensa noch keinen Speiseplan herausgegeben.
        </p>
        <div style="background: var(--bg-surface); padding: 14px 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); display: inline-block; text-align: left; max-width: 550px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 14.5px; color: var(--text-secondary); line-height: 1.5;">
            <span class="emoji-icon" aria-hidden="true">ℹ️ </span><strong>Wann erscheint der Plan?</strong><br>
            Die Küche der Mensa (Von-Vincke-Schule &amp; BBW Soest) veröffentlicht neue Speisepläne gewöhnlich am <strong>Freitag vor Beginn der jeweiligen Schulwoche</strong>.
          </p>
        </div>
        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          <button type="button" class="btn btn-primary" onclick="refreshCanteenData()" aria-label="Jetzt prüfen ob ein Speiseplan veröffentlicht wurde">
            <span class="emoji-icon" aria-hidden="true">🔄 </span>Speisepläne jetzt neu abrufen (Taste A)
          </button>
          <button type="button" class="btn btn-secondary" onclick="setCanteenWeek('kw38', false)" aria-label="Zur aktuellen Schulwoche KW 38 zurückkehren">
            <span class="emoji-icon" aria-hidden="true">🍽️ </span>Zur aktuellen Woche (KW 38)
          </button>
        </div>
      </article>
    `;
    return;
  }

  let daysToRender = activeWeek.days;
  if (selectedDay !== 'all') {
    daysToRender = activeWeek.days.filter(d => (d.day || '').toLowerCase() === selectedDay.toLowerCase());
  }

  let html = '';
  daysToRender.forEach(d => {
    const isToday = isCanteenDateToday(d.date);

    html += `
      <article class="canteen-day-card ${isToday ? 'is-today' : ''}" aria-labelledby="heading-day-${escHtml(d.day)}">
        <header class="canteen-day-header">
          <h3 id="heading-day-${escHtml(d.day)}" class="canteen-day-title">
            <span class="emoji-icon" aria-hidden="true">📅 </span>
            <span>${escHtml(d.day)}, ${escHtml(d.date)}</span>
            ${isToday ? '<span class="canteen-today-badge"><span class="emoji-icon" aria-hidden="true">🔴 </span>Heute</span>' : ''}
          </h3>
          <span style="font-size: 13.5px; color: var(--text-secondary); font-weight: 600;">
            Mensa Essensausgabe 11:45 – 13:45 Uhr
          </span>
        </header>

        <div class="canteen-menus-grid" role="region" aria-label="Mittagsmenüs">
          <!-- Menü 1: Vollkost -->
          <div class="canteen-menu-card">
            <div class="canteen-menu-header">
              <h4 style="margin: 0; font-size: 14.5px; font-weight: 700; color: var(--text-primary);">
                <span class="emoji-icon" aria-hidden="true">🍲 </span>Menü 1: Vollkost
              </h4>
              <span class="canteen-menu-badge badge-vollkost">Vollkost</span>
            </div>
            <div class="canteen-dish-text">${escHtml(d.menu1 || 'Kein Angebot')}</div>
          </div>

          <!-- Menü 2: Muslimische Kost -->
          <div class="canteen-menu-card">
            <div class="canteen-menu-header">
              <h4 style="margin: 0; font-size: 14.5px; font-weight: 700; color: var(--text-primary);">
                <span class="emoji-icon" aria-hidden="true">🥩 </span>Menü 2: Muslimische Kost
              </h4>
              <span class="canteen-menu-badge badge-muslimisch">Ohne Schwein</span>
            </div>
            <div class="canteen-dish-text">${escHtml(d.menu2 || 'Kein Angebot')}</div>
          </div>

          <!-- Menü 3: Vegetarisch -->
          <div class="canteen-menu-card">
            <div class="canteen-menu-header">
              <h4 style="margin: 0; font-size: 14.5px; font-weight: 700; color: var(--text-primary);">
                <span class="emoji-icon" aria-hidden="true">🥗 </span>Menü 3: Vegetarisch
              </h4>
              <span class="canteen-menu-badge badge-vegetarisch">Vegetarisch</span>
            </div>
            <div class="canteen-dish-text">${escHtml(d.menu3 || 'Kein Angebot')}</div>
          </div>
        </div>

        <!-- Ergänzende Mahlzeiten / Salattheke / Frühstück / Abendessen -->
        <div class="canteen-side-grid" role="region" aria-label="Zusatzangebot und weitere Mahlzeiten">
          ${d.breakfast ? `
            <div class="canteen-side-box">
              <h5 class="canteen-side-title"><span class="emoji-icon" aria-hidden="true">🥐 </span>Frühstück:</h5>
              <div class="canteen-dish-text">${escHtml(d.breakfast)}</div>
            </div>
          ` : ''}

          ${d.extra ? `
            <div class="canteen-side-box">
              <h5 class="canteen-side-title"><span class="emoji-icon" aria-hidden="true">🥗 </span>Salattheke &amp; Extras:</h5>
              <div class="canteen-dish-text">${escHtml(d.extra)}</div>
            </div>
          ` : ''}

          ${d.dinner ? `
            <div class="canteen-side-box">
              <h5 class="canteen-side-title"><span class="emoji-icon" aria-hidden="true">🥪 </span>Abendessen (Internat):</h5>
              <div class="canteen-dish-text">${escHtml(d.dinner)}</div>
            </div>
          ` : ''}
        </div>
      </article>
    `;
  });

  // Freitag-Hinweis anfügen, falls ganze Woche gewählt
  if (selectedDay === 'all') {
    html += `
      <article class="canteen-day-card" style="border-style: dashed; background: var(--bg-surface-elevated);" aria-labelledby="heading-day-freitag">
        <header class="canteen-day-header" style="border-bottom: none; margin-bottom: 0; padding-bottom: 0;">
          <h3 id="heading-day-freitag" class="canteen-day-title" style="font-size: 1.05rem;">
            <span class="emoji-icon" aria-hidden="true">🚌 </span>
            <span>Freitag (Heimreisetag / Lunchpakete)</span>
          </h3>
          <span style="font-size: 13px; color: var(--text-secondary);">Mensa geöffnet bis 12:30 Uhr</span>
        </header>
        <p style="margin: 8px 0 0 0; font-size: 14px; color: var(--text-secondary); line-height: 1.5;">
          Am Freitag findet im Internat und Bildungszentrum die Heimreise statt. In der Mensa werden Snackangebote, belegte Brötchen und Lunchpakete ausgegeben.
        </p>
      </article>
    `;
  }

  container.innerHTML = html;
}

function readCanteenSummary() {
  const data = getCanteenData();
  const allWeeks = getFullCanteenWeeksList(data);
  const selectedWeekId = appData.selectedCanteenWeek || 'kw38';
  const activeWeek = allWeeks.find(w => w.weekId === selectedWeekId) || allWeeks[1];

  if (!activeWeek || !activeWeek.hasData || !activeWeek.days || activeWeek.days.length === 0) {
    const kwLabel = activeWeek ? `Kalenderwoche ${activeWeek.kw}` : 'diese Woche';
    const msg = `Für die ${kwLabel} liegt noch kein Speiseplan der Mensa vor. Die Pläne werden in der Regel am Freitag der Vorwoche veröffentlicht.`;
    speak(msg, true);
    announceSR(msg, 'assertive');
    return;
  }

  // Priorisiere heutigen Tag, ansonsten ersten Tag der Auswahl
  const selectedDay = appData.selectedCanteenDay || 'all';
  let targetDay = null;

  if (selectedDay !== 'all') {
    targetDay = activeWeek.days.find(d => (d.day || '').toLowerCase() === selectedDay.toLowerCase());
  } else {
    targetDay = activeWeek.days.find(d => isCanteenDateToday(d.date)) || activeWeek.days[0];
  }

  if (!targetDay) {
    targetDay = activeWeek.days[0];
  }

  let speech = `Mensa Speiseplan für ${targetDay.day}, den ${targetDay.date}. `;
  if (targetDay.menu1) {
    speech += `Menü 1 Vollkost: ${targetDay.menu1.replace(/\n/g, ', ')}. `;
  }
  if (targetDay.menu2) {
    speech += `Menü 2 Muslimische Kost ohne Schwein: ${targetDay.menu2.replace(/\n/g, ', ')}. `;
  }
  if (targetDay.menu3) {
    speech += `Menü 3 Vegetarisch: ${targetDay.menu3.replace(/\n/g, ', ')}. `;
  }
  if (targetDay.extra) {
    speech += `Salattheke und Zusatzangebot: ${targetDay.extra.replace(/\n/g, ', ')}. `;
  }

  speak(speech, true);
  announceSR(speech, 'assertive');
}

async function refreshCanteenData() {
  const btn = document.getElementById('btn-sync-canteen');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="emoji-icon" aria-hidden="true">⏳ </span>Lade Speisepläne...';
  }

  announceSR('Mensa-Speisepläne werden aus dem Internet synchronisiert...', 'assertive');

  try {
    const resp = await fetch('/api/canteen', { cache: 'no-store' });
    if (resp.ok) {
      const freshData = await resp.json();
      if (freshData && freshData.weeks && freshData.weeks.length > 0) {
        appData.canteen = freshData;
        saveAppData();
        renderCanteenView();
        const successMsg = `Mensa-Speisepläne erfolgreich aktualisiert (${freshData.weeks.length} Wochen geladen).`;
        speak(successMsg, true);
        announceSR(successMsg, 'assertive');
        return;
      }
    }
    throw new Error('Ungültige Server-Antwort');
  } catch (err) {
    console.warn('Canteen sync error:', err);
    renderCanteenView();
    const warnMsg = 'Speisepläne konnten nicht neu geladen werden. Gespeicherter Speiseplan wird verwendet.';
    speak(warnMsg, true);
    announceSR(warnMsg, 'assertive');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="emoji-icon" aria-hidden="true">🔄 </span><strong>Aktualisieren (A)</strong>';
    }
  }
}


document.addEventListener('DOMContentLoaded', initApp);

