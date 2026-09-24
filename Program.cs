using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace BarrierefreierStundenplan
{
    static class Program
    {
        [DllImport("kernel32.dll")]
        private static extern IntPtr GetConsoleWindow();

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        private const int SW_HIDE = 0;
        private const int DEFAULT_PORT = 48250;
        private static int _activePort = DEFAULT_PORT;
        private const string DEFAULT_WEBUNTIS_URL = "https://lwl-bk-soest.webuntis.com/WebUntis/jsonrpc.do?school=lwl-bk-soest";
        
        // GitHub Auto-Updater Konfiguration
        private const string GITHUB_REPO = "Lauju1909/BarrierefreiesWebUntis";
        private const string APP_EXE_NAME = "Barrierefreies_WebUntis.exe";
        private const string APP_DISPLAY_NAME = "Barrierefreies WebUntis";
        private const string GITHUB_RAW_BASE = "https://raw.githubusercontent.com/" + GITHUB_REPO + "/main";
        private const string VERSION_URL = GITHUB_RAW_BASE + "/version.json";

        private static HttpListener _listener;
        private static bool _isRunning = true;
        private static string _baseDir;
        private static Assembly _assembly;
        private static ManualResetEvent _exitEvent = new ManualResetEvent(false);

        // State für automatisches Beenden bei Alt+F4 / Fensterschließen
        private static readonly object _shutdownLock = new object();
        private static System.Threading.Timer _closingTimer = null;
        private static bool _closingPending = false;
        private static DateTime _lastActivity = DateTime.UtcNow;
        private static bool _pageHasLoaded = false;
        private static bool _isWindowHidden = false;
        private static NotifyIcon _trayIcon = null;

        private static void InitTrayIcon()
        {
            try
            {
                _trayIcon = new NotifyIcon();
                _trayIcon.Icon = SystemIcons.Information;
                _trayIcon.Text = "Barrierefreies WebUntis";
                _trayIcon.Visible = true;
            }
            catch { }
        }

        public static void ShowWindowsNotification(string title, string text)
        {
            try
            {
                if (_trayIcon == null) InitTrayIcon();
                if (_trayIcon != null)
                {
                    _trayIcon.BalloonTipTitle = !string.IsNullOrEmpty(title) ? title : "LWL Stundenplan";
                    _trayIcon.BalloonTipText = !string.IsNullOrEmpty(text) ? text : "Aktualisierung verfügbar.";
                    _trayIcon.BalloonTipIcon = ToolTipIcon.Info;
                    _trayIcon.ShowBalloonTip(5000);
                }
            }
            catch { }
        }

        [STAThread]
        static void Main()
        {
            // 1. Konsole sofort unsichtbar machen
            try
            {
                IntPtr consoleHwnd = GetConsoleWindow();
                if (consoleHwnd != IntPtr.Zero)
                {
                    ShowWindow(consoleHwnd, SW_HIDE);
                }
            }
            catch { }

            _baseDir = AppDomain.CurrentDomain.BaseDirectory;
            _assembly = Assembly.GetExecutingAssembly();
            AppDomain.CurrentDomain.ProcessExit += (s, e) => LogUntis("=== ProcessExit event fired ===");
            AppDomain.CurrentDomain.UnhandledException += (s, e) => LogUntis("=== UnhandledException: " + (e.ExceptionObject != null ? e.ExceptionObject.ToString() : "null") + " ===");
            LogUntis("=== PROGRAM START v" + GetLocalVersion() + " ===");

            // Vorherige temporäre Update-Dateien bereinigen
            try
            {
                string exePath = Process.GetCurrentProcess().MainModule.FileName;
                string oldPath = exePath + ".old";
                if (File.Exists(oldPath)) File.Delete(oldPath);
                string updPath1 = Path.Combine(_baseDir, "Barrierefreies_WebUntis_Update.exe");
                if (File.Exists(updPath1)) File.Delete(updPath1);
                string updPath2 = Path.Combine(_baseDir, "Stundenplan_LWL_Update.exe");
                if (File.Exists(updPath2)) File.Delete(updPath2);
            }
            catch { }

            // 2. Prüfen, ob bereits eine Instanz auf Port 48250 lauscht
            LogUntis("Checking if port " + DEFAULT_PORT + " is in use");
            if (IsPortInUse(DEFAULT_PORT))
            {
                bool isHealthy = false;
                try
                {
                    HttpWebRequest pingReq = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + DEFAULT_PORT + "/api/ping");
                    pingReq.Timeout = 800;
                    pingReq.ReadWriteTimeout = 800;
                    using (HttpWebResponse pingResp = (HttpWebResponse)pingReq.GetResponse())
                    {
                        if (pingResp.StatusCode == HttpStatusCode.OK) isHealthy = true;
                    }
                }
                catch { }

                if (isHealthy)
                {
                    LogUntis("Port " + DEFAULT_PORT + " is already in use and active, opening browser and exiting secondary instance");
                    LaunchBestBrowser("http://127.0.0.1:" + DEFAULT_PORT + "/index.html");
                    return;
                }
                else
                {
                    LogUntis("Port " + DEFAULT_PORT + " is blocked by an unresponsive process! Cleaning up stale processes...");
                    try
                    {
                        int currentPid = Process.GetCurrentProcess().Id;
                        foreach (string pName in new string[] { "Barrierefreies_WebUntis", "Stundenplan_LWL" })
                        {
                            foreach (Process p in Process.GetProcessesByName(pName))
                            {
                                if (p.Id != currentPid)
                                {
                                    try { p.Kill(); p.WaitForExit(1000); } catch { }
                                }
                            }
                        }
                    }
                    catch { }
                    Thread.Sleep(500);
                }
            }

            try
            {
                try
                {
                    ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)12288 | SecurityProtocolType.Tls12;
                    ServicePointManager.DefaultConnectionLimit = 50;
                }
                catch { }

                // 3. Starte HttpListener mit Port-Fallback
                bool serverStarted = false;
                for (int p = DEFAULT_PORT; p <= DEFAULT_PORT + 5; p++)
                {
                    try
                    {
                        _listener = new HttpListener();
                        _listener.Prefixes.Add("http://127.0.0.1:" + p + "/");
                        _listener.Start();
                        _activePort = p;
                        serverStarted = true;
                        LogUntis("HttpListener started successfully on port " + p);
                        break;
                    }
                    catch (Exception lex)
                    {
                        LogUntis("Failed to start HttpListener on port " + p + ": " + lex.Message);
                        try { _listener.Close(); } catch { }
                    }
                }

                if (!serverStarted)
                {
                    LogUntis("No HttpListener port could be started!");
                    MessageBox.Show("Der lokale Webserver konnte nicht gestartet werden. Bitte starte deinen Rechner neu.",
                        "Stundenplan LWL", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                // 4. Server-Thread im Hintergrund starten
                Thread serverThread = new Thread(ListenLoop);
                serverThread.IsBackground = true;
                serverThread.Start();
                LogUntis("Server listen thread started");

                // 5. Asynchronen Auto-Update-Check beim Start ausführen
                CheckAndApplyUpdateAsync();

                // 6. Periodischer Hintergrund-Update-Check alle 30 Minuten
                Thread updateTimerThread = new Thread(() =>
                {
                    while (_isRunning)
                    {
                        Thread.Sleep(30 * 60 * 1000);
                        if (!_isRunning) break;
                        try { CheckAndApplyUpdate(); } catch { }
                    }
                });
                updateTimerThread.IsBackground = true;
                updateTimerThread.Start();

                // 7. Server läuft stabil und dauerhaft im Hintergrund (kein vorzeitiges Beenden durch Inaktivität)

                string launchUrl = "http://127.0.0.1:" + _activePort + "/index.html";

                // 8. Browser öffnen
                LogUntis("Launching browser with URL: " + launchUrl);
                LaunchBestBrowser(launchUrl);

                // 9. Blockieren bis Beenden-Signal
                LogUntis("Entering _exitEvent.WaitOne()...");
                _exitEvent.WaitOne();
                LogUntis("_exitEvent was released, exiting");
                Environment.Exit(0);
            }
            catch (Exception ex)
            {
                LogUntis("FATAL EXCEPTION in Main: " + ex.ToString());
                try
                {
                    File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "error.log"), ex.ToString());
                }
                catch { }
                MessageBox.Show("Hinweis beim Starten des Stundenplans: " + ex.Message,
                    "LWL Berufskolleg Soest", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            finally
            {
                LogUntis("Main finally block entered");
                _isRunning = false;
                if (_trayIcon != null)
                {
                    try { _trayIcon.Visible = false; _trayIcon.Dispose(); } catch { }
                    _trayIcon = null;
                }
                if (_listener != null && _listener.IsListening)
                {
                    try { _listener.Stop(); } catch { }
                    try { _listener.Close(); } catch { }
                }
            }
        }

        private static bool IsPortInUse(int port)
        {
            try
            {
                using (TcpClient tcp = new TcpClient())
                {
                    IAsyncResult ar = tcp.BeginConnect("127.0.0.1", port, null, null);
                    bool success = ar.AsyncWaitHandle.WaitOne(300, false);
                    if (success && tcp.Connected)
                    {
                        tcp.EndConnect(ar);
                        return true;
                    }
                }
            }
            catch { }
            return false;
        }

        public static string GetLocalVersion()
        {
            // 1. Zuerst aus der eingebetteten Ressource der EXE lesen (100% autarke Single-EXE)
            if (_assembly != null)
            {
                try
                {
                    foreach (string name in _assembly.GetManifestResourceNames())
                    {
                        if (name.EndsWith("version.json", StringComparison.OrdinalIgnoreCase))
                        {
                            using (Stream stream = _assembly.GetManifestResourceStream(name))
                            {
                                if (stream != null)
                                {
                                    using (StreamReader reader = new StreamReader(stream, Encoding.UTF8))
                                    {
                                        string txt = reader.ReadToEnd();
                                        Match m = Regex.Match(txt, "\"version\"\\s*:\\s*\"v?([^\"]+)\"");
                                        if (m.Success) return m.Groups[1].Value.Trim();
                                    }
                                }
                            }
                        }
                    }
                }
                catch { }
            }

            // 2. Fallback: Datei auf Disk prüfen
            string vPath = Path.Combine(_baseDir, "version.json");
            if (File.Exists(vPath))
            {
                try
                {
                    string txt = File.ReadAllText(vPath, Encoding.UTF8);
                    Match m = Regex.Match(txt, "\"version\"\\s*:\\s*\"v?([^\"]+)\"");
                    if (m.Success) return m.Groups[1].Value.Trim();
                }
                catch { }
            }
            return "1.9.25";
        }

        private static bool IsNewerVersion(string remote, string local)
        {
            try
            {
                string rStr = remote.Trim().TrimStart('v', 'V');
                string lStr = local.Trim().TrimStart('v', 'V');
                // Erweitere x.y auf x.y.0 falls nötig
                if (rStr.Split('.').Length == 2) rStr += ".0";
                if (lStr.Split('.').Length == 2) lStr += ".0";
                Version r = new Version(rStr);
                Version l = new Version(lStr);
                return r > l;
            }
            catch
            {
                return false;
            }
        }

        private static void CheckAndApplyUpdateAsync()
        {
            ThreadPool.QueueUserWorkItem((_) =>
            {
                try
                {
                    CheckAndApplyUpdate();
                }
                catch { }
            });
        }

        public static bool CheckAndApplyUpdate()
        {
            try
            {
                string localVer = GetLocalVersion();
                long ticks = DateTime.UtcNow.Ticks;
                string verUrl = VERSION_URL + "?t=" + ticks;

                using (var client = new TimeoutWebClient(8000))
                {
                    client.Headers.Add("User-Agent", "BarrierefreiesWebUntis-AutoUpdater");
                    client.Headers.Add("Cache-Control", "no-cache");
                    client.Headers.Add("Pragma", "no-cache");

                    string remoteJson = "";
                    try
                    {
                        remoteJson = client.DownloadString(verUrl);
                    }
                    catch (Exception ex)
                    {
                        LogUntis("AutoUpdater error fetching version: " + ex.Message);
                        return false;
                    }

                    Match m = Regex.Match(remoteJson, "\"version\"\\s*:\\s*\"v?([^\"]+)\"");
                    if (!m.Success) return false;

                    string remoteVer = m.Groups[1].Value.Trim();
                    bool isNewer = IsNewerVersion(remoteVer, localVer);
                    LogUntis(string.Format("AutoUpdater: remote={0}, local={1}, isNewer={2}", remoteVer, localVer, isNewer));

                    if (isNewer)
                    {
                        LogUntis("Starting automatic update download from GitHub...");
                        string currentExe = Process.GetCurrentProcess().MainModule.FileName;
                        string tempExe = Path.Combine(_baseDir, "Barrierefreies_WebUntis_Update.exe");
                        string oldExe = currentExe + ".old";

                        // 1. Primäre Download-Quelle: Offizieller GitHub Release, danach Raw-Fallback
                        string[] candidateUrls = new string[]
                        {
                            "https://github.com/" + GITHUB_REPO + "/releases/latest/download/Barrierefreies_WebUntis.exe",
                            "https://raw.githubusercontent.com/" + GITHUB_REPO + "/main/Barrierefreies_WebUntis.exe?t=" + ticks,
                            "https://github.com/" + GITHUB_REPO + "/releases/latest/download/Stundenplan_LWL.exe"
                        };

                        bool exeDownloaded = false;
                        foreach (string downloadUrl in candidateUrls)
                        {
                            try
                            {
                                if (File.Exists(tempExe)) File.Delete(tempExe);
                                client.DownloadFile(downloadUrl, tempExe);
                                FileInfo fi = new FileInfo(tempExe);
                                if (fi.Exists && fi.Length > 25000)
                                {
                                    exeDownloaded = true;
                                    LogUntis("Successfully downloaded updated executable from: " + downloadUrl);
                                    break;
                                }
                            }
                            catch (Exception dlEx)
                            {
                                LogUntis("Failed candidate URL " + downloadUrl + ": " + dlEx.Message);
                            }
                        }

                        if (exeDownloaded)
                        {
                            if (File.Exists(oldExe))
                            {
                                try { File.Delete(oldExe); } catch { }
                            }

                            // Laufende EXE umbenennen und neue platzieren
                            File.Move(currentExe, oldExe);
                            File.Move(tempExe, currentExe);

                            // Nach kurzer Pause neue Version starten
                            ThreadPool.QueueUserWorkItem((_) =>
                            {
                                try
                                {
                                    Thread.Sleep(1500);
                                    Process.Start(currentExe);
                                    Environment.Exit(0);
                                }
                                catch { }
                            });

                            return true;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                LogUntis("AutoUpdater general exception: " + ex.Message);
            }
            return false;
        }

        private static void ListenLoop()
        {
            while (_isRunning && _listener != null && _listener.IsListening)
            {
                try
                {
                    HttpListenerContext context = _listener.GetContext();
                    ThreadPool.QueueUserWorkItem((ctx) => HandleRequest((HttpListenerContext)ctx), context);
                }
                catch
                {
                    if (!_isRunning) break;
                }
            }
        }

        private static void HandleRequest(HttpListenerContext context)
        {
            HttpListenerRequest req = context.Request;
            HttpListenerResponse resp = context.Response;

            resp.Headers["Access-Control-Allow-Origin"] = "*";
            resp.Headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
            resp.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-School, X-Server, X-JSESSIONID, X-Endpoint, X-Untis-Secret, X-Untis-User, Authorization, tenant-id, x-webuntis-api-school-year-id, *";

            if (req.HttpMethod == "OPTIONS")
            {
                resp.StatusCode = 200;
                resp.Close();
                return;
            }

            string rawUrl = req.RawUrl.Split('?')[0];

            // Aktivität registrieren (hält Watchdog aktiv)
            if (rawUrl != "/api/window_closing" && rawUrl != "/api/shutdown")
            {
                lock (_shutdownLock)
                {
                    _lastActivity = DateTime.UtcNow;
                    _pageHasLoaded = true;
                }
            }

            // Wenn ein aktiver Request eingeht (außer window_closing oder shutdown),
            // wird ein anstehender Schließ-Timer sofort storniert (z. B. bei F5, Navigation, Ping):
            if (rawUrl != "/api/window_closing" && rawUrl != "/api/shutdown")
            {
                lock (_shutdownLock)
                {
                    if (_closingPending)
                    {
                        LogUntis("Canceling pending window_closing because of active request: " + rawUrl);
                        _closingPending = false;
                        if (_closingTimer != null)
                        {
                            try { _closingTimer.Dispose(); } catch { }
                            _closingTimer = null;
                        }
                    }
                }
            }

            // 1. Health-Check / Ping / Heartbeat
            if (rawUrl == "/api/ping")
            {
                string q = req.Url != null ? req.Url.Query : "";
                if (!string.IsNullOrEmpty(q) && q.IndexOf("hidden", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    lock (_shutdownLock) { _isWindowHidden = true; }
                }
                else
                {
                    lock (_shutdownLock) { _isWindowHidden = false; }
                }

                resp.StatusCode = 200;
                resp.ContentType = "application/json";
                byte[] pong = Encoding.UTF8.GetBytes("{\"status\":\"ok\"}");
                resp.OutputStream.Write(pong, 0, pong.Length);
                resp.Close();
                return;
            }

            // Client-seitiges Logging (JavaScript Konsole & Fehler)
            if (rawUrl == "/api/client_log")
            {
                try
                {
                    using (StreamReader reader = new StreamReader(req.InputStream, req.ContentEncoding))
                    {
                        string logMsg = reader.ReadToEnd();
                        LogUntis("[CLIENT-JS] " + logMsg);
                    }
                }
                catch { }
                resp.StatusCode = 200;
                resp.ContentType = "application/json";
                byte[] ok = Encoding.UTF8.GetBytes("{\"logged\":true}");
                resp.OutputStream.Write(ok, 0, ok.Length);
                resp.Close();
                return;
            }

            // Windows Desktop Benachrichtigung (Toast / Tray Notification)
            if (rawUrl == "/api/notify")
            {
                string title = "Barrierefreies WebUntis";
                string msg = "";
                string q = req.Url != null ? req.Url.Query : "";
                if (!string.IsNullOrEmpty(q))
                {
                    Match mt = Regex.Match(q, @"[?&]title=([^&]+)");
                    if (mt.Success) title = Uri.UnescapeDataString(mt.Groups[1].Value);
                    Match mm = Regex.Match(q, @"[?&]msg=([^&]+)");
                    if (mm.Success) msg = Uri.UnescapeDataString(mm.Groups[1].Value);
                }
                LogUntis(string.Format("API /api/notify: title='{0}', msg='{1}'", title, msg));
                ShowWindowsNotification(title, msg);
                resp.StatusCode = 200;
                resp.ContentType = "application/json";
                byte[] ok = Encoding.UTF8.GetBytes("{\"success\":true}");
                resp.OutputStream.Write(ok, 0, ok.Length);
                resp.Close();
                return;
            }


                                    // Internet Cloud Sync fuer Klassen- und persoenliche Hausaufgaben
            if (rawUrl == "/api/cloud_sync" || rawUrl == "/api/custom_homework" || rawUrl == "/api/homework_sync")
            {
                string hwFile = Path.Combine(_baseDir, "custom_homework.json");
                string docFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "custom_homework.json");
                string gistId = "e66b5c70ca5ea38585985e43f2976fe8";

                if (req.HttpMethod == "POST")
                {
                    try
                    {
                        string json = "";
                        using (StreamReader reader = new StreamReader(req.InputStream, req.ContentEncoding))
                        {
                            json = reader.ReadToEnd();
                        }
                        File.WriteAllText(hwFile, json, Encoding.UTF8);
                        try { File.WriteAllText(docFile, json, Encoding.UTF8); } catch { }

                        // Im Hintergrund an GitHub Gist uebertragen
                        System.Threading.ThreadPool.QueueUserWorkItem(delegate
                        {
                            try
                            {
                                string token = "";
                                string tokenFile = Path.Combine(_baseDir, "cloud_token.txt");
                                if (File.Exists(tokenFile)) token = File.ReadAllText(tokenFile, Encoding.UTF8).Trim();
                                if (string.IsNullOrEmpty(token))
                                {
                                    try
                                    {
                                        var psi = new System.Diagnostics.ProcessStartInfo("gh", "auth token");
                                        psi.RedirectStandardOutput = true;
                                        psi.UseShellExecute = false;
                                        psi.CreateNoWindow = true;
                                        var proc = System.Diagnostics.Process.Start(psi);
                                        token = proc.StandardOutput.ReadToEnd().Trim();
                                        proc.WaitForExit();
                                    }
                                    catch { }
                                }
                                if (!string.IsNullOrEmpty(token))
                                {
                                    ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
                                    var gReq = (HttpWebRequest)WebRequest.Create("https://api.github.com/gists/" + gistId);
                                    gReq.Method = "PATCH";
                                    gReq.UserAgent = "BarrierefreiesWebUntis-CloudSync";
                                    gReq.Headers["Authorization"] = "Bearer " + token;
                                    gReq.ContentType = "application/json";

                                    StringBuilder sb = new StringBuilder();
                                    for (int i = 0; i < json.Length; i++)
                                    {
                                        char c = json[i];
                                        if (c == '"') sb.Append('\'').Append('"');
                                        else if (c == '\\') sb.Append('\\').Append('\\');
                                        else if (c == '\r') { }
                                        else if (c == '\n') sb.Append('\\').Append('n');
                                        else sb.Append(c);
                                    }
                                    string escapedJson = sb.ToString();
                                    string patchBody = "{\"files\":{\"cloud_sync.json\":{\"content\":\"" + escapedJson + "\"}}}";
                                    byte[] patchBytes = Encoding.UTF8.GetBytes(patchBody);
                                    gReq.ContentLength = patchBytes.Length;
                                    using (Stream os = gReq.GetRequestStream())
                                    {
                                        os.Write(patchBytes, 0, patchBytes.Length);
                                    }
                                    using (var gResp = (HttpWebResponse)gReq.GetResponse())
                                    {
                                        LogUntis(string.Format("Cloud Gist synced: HTTP {0}", (int)gResp.StatusCode));
                                    }
                                }
                            }
                            catch (Exception cEx)
                            {
                                LogUntis("Cloud Gist sync warning: " + cEx.Message);
                            }
                        });

                        resp.StatusCode = 200;
                        resp.ContentType = "application/json; charset=utf-8";
                        byte[] ok = Encoding.UTF8.GetBytes("{\"saved\":true,\"cloud\":true}");
                        resp.OutputStream.Write(ok, 0, ok.Length);
                        resp.Close();
                        return;
                    }
                    catch (Exception ex)
                    {
                        LogUntis("Error in cloud sync: " + ex.Message);
                        resp.StatusCode = 500;
                        resp.Close();
                        return;
                    }
                }
                else
                {
                    string json = "";
                    if (File.Exists(hwFile)) json = File.ReadAllText(hwFile, Encoding.UTF8);
                    else if (File.Exists(docFile)) json = File.ReadAllText(docFile, Encoding.UTF8);
                    else json = "{\"classes\":{},\"users\":{}}";

                    resp.StatusCode = 200;
                    resp.ContentType = "application/json; charset=utf-8";
                    byte[] data = Encoding.UTF8.GetBytes(json);
                    resp.OutputStream.Write(data, 0, data.Length);
                    resp.Close();
                    return;
                }
            }

            // 2. Fensterstatus (kein automatisches Beenden bei bloßem Tabwechsel)
            if (rawUrl == "/api/window_closing")
            {
                LogUntis("API /api/window_closing received (standby mode, server keeps running)");
                resp.StatusCode = 200;
                resp.ContentType = "application/json";
                byte[] bye = Encoding.UTF8.GetBytes("{\"status\":\"ok\"}");
                resp.OutputStream.Write(bye, 0, bye.Length);
                resp.Close();
                return;
            }

            // 3. Beenden-Signal (nur wenn explizit vom Nutzer bestätigt)
            if (rawUrl == "/api/shutdown")
            {
                string q = req.Url != null ? req.Url.Query : "";
                if (!string.IsNullOrEmpty(q) && q.IndexOf("confirmed=true", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    LogUntis("API /api/shutdown?confirmed=true received, exiting application gracefully");
                    resp.StatusCode = 200;
                    resp.ContentType = "application/json";
                    byte[] bye = Encoding.UTF8.GetBytes("{\"status\":\"shutting_down\"}");
                    resp.OutputStream.Write(bye, 0, bye.Length);
                    resp.Close();

                    ThreadPool.QueueUserWorkItem((_) =>
                    {
                        Thread.Sleep(300);
                        Environment.Exit(0);
                    });
                    return;
                }
                else
                {
                    LogUntis("API /api/shutdown ignored (confirmed=true missing)");
                    resp.StatusCode = 200;
                    resp.ContentType = "application/json";
                    byte[] bye = Encoding.UTF8.GetBytes("{\"status\":\"ignored\"}");
                    resp.OutputStream.Write(bye, 0, bye.Length);
                    resp.Close();
                    return;
                }
            }

            // 3. Version & Auto-Update API
            if (rawUrl == "/api/version")
            {
                resp.StatusCode = 200;
                resp.ContentType = "application/json; charset=utf-8";
                string vPath = Path.Combine(_baseDir, "version.json");
                byte[] vData;
                if (File.Exists(vPath))
                {
                    vData = File.ReadAllBytes(vPath);
                }
                else
                {
                    vData = Encoding.UTF8.GetBytes(string.Format("{{\"version\":\"{0}\",\"name\":\"Barrierefreies WebUntis\"}}", GetLocalVersion()));
                }
                resp.OutputStream.Write(vData, 0, vData.Length);
                resp.Close();
                return;
            }

            if (rawUrl == "/api/update/check")
            {
                bool updated = CheckAndApplyUpdate();
                string curVer = GetLocalVersion();
                resp.StatusCode = 200;
                resp.ContentType = "application/json; charset=utf-8";
                byte[] resData = Encoding.UTF8.GetBytes(string.Format("{{\"updated\":{0},\"currentVersion\":\"{1}\"}}", updated ? "true" : "false", curVer));
                resp.OutputStream.Write(resData, 0, resData.Length);
                resp.Close();
                return;
            }

            // 3b. Untis TOTP Generator & Auth Helper API
            if (rawUrl.StartsWith("/api/untis/otp"))
            {
                string secret = req.QueryString["secret"];
                long ts = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                int otp = GenerateTotp(secret, ts);
                resp.StatusCode = 200;
                resp.ContentType = "application/json; charset=utf-8";
                byte[] okData = Encoding.UTF8.GetBytes(string.Format("{{\"otp\":{0},\"otpStr\":\"{1}\",\"clientTime\":{2}}}", otp, otp.ToString("D6"), ts));
                resp.OutputStream.Write(okData, 0, okData.Length);
                resp.Close();
                return;
            }

            // 3c. Untis Mobile Authentifizierung (C# Server-Side)
            if (req.HttpMethod == "POST" && rawUrl == "/api/untis/mobile_auth")
            {
                string body = "";
                using (var reader = new StreamReader(req.InputStream, req.ContentEncoding))
                {
                    body = reader.ReadToEnd();
                }

                string u = "", p = "", sc = "lwl-bk-soest", sv = "lwl-bk-soest.webuntis.com";
                Match mu = Regex.Match(body, "\"username\"\\s*:\\s*\"([^\"]+)\"");
                if (!mu.Success) mu = Regex.Match(body, "\"user\"\\s*:\\s*\"([^\"]+)\"");
                if (mu.Success) u = mu.Groups[1].Value;

                Match mp = Regex.Match(body, "\"password\"\\s*:\\s*\"([^\"]+)\"");
                if (mp.Success) p = mp.Groups[1].Value;

                Match msc = Regex.Match(body, "\"school\"\\s*:\\s*\"([^\"]+)\"");
                if (msc.Success) sc = msc.Groups[1].Value;

                Match msv = Regex.Match(body, "\"server\"\\s*:\\s*\"([^\"]+)\"");
                if (msv.Success) sv = msv.Groups[1].Value;

                string authResJson = ExecuteUntisMobileAuth(u, p, sc, sv);

                resp.StatusCode = 200;
                resp.ContentType = "application/json; charset=utf-8";
                byte[] okData = Encoding.UTF8.GetBytes(authResJson);
                resp.OutputStream.Write(okData, 0, okData.Length);
                resp.Close();
                return;
            }

            // 3d. Debug Log API (Abruf des Live-WebUntis-Logs)
            if (rawUrl == "/api/debug_log")
            {
                string logContent = "Kein Log vorhanden.";
                string p1 = Path.Combine(@"C:\Users\lauri\Documents", "webuntis_debug.log");
                string p2 = Path.Combine(_baseDir, "webuntis_debug.log");
                if (File.Exists(p1)) { try { logContent = File.ReadAllText(p1, Encoding.UTF8); } catch { } }
                else if (File.Exists(p2)) { try { logContent = File.ReadAllText(p2, Encoding.UTF8); } catch { } }

                resp.StatusCode = 200;
                resp.ContentType = "text/plain; charset=utf-8";
                byte[] logData = Encoding.UTF8.GetBytes(logContent);
                resp.OutputStream.Write(logData, 0, logData.Length);
                resp.Close();
                return;
            }

            // 3e. Externe URLs sicher im Standard-Browser öffnen
            if (rawUrl.StartsWith("/api/open_url"))
            {
                string url = req.QueryString["url"];
                if (!string.IsNullOrEmpty(url) && (url.StartsWith("http://") || url.StartsWith("https://")))
                {
                    ThreadPool.QueueUserWorkItem((_) =>
                    {
                        try
                        {
                            Process.Start(new ProcessStartInfo
                            {
                                FileName = url,
                                UseShellExecute = true
                            });
                        }
                        catch { }
                    });
                }
                resp.StatusCode = 200;
                resp.ContentType = "application/json";
                byte[] okData = Encoding.UTF8.GetBytes("{\"status\":\"opened\"}");
                resp.OutputStream.Write(okData, 0, okData.Length);
                resp.Close();
                return;
            }

            // 3f. Mensa & Speisepläne API (Kaskade: Von-Vincke -> BBW Soest -> Berufskolleg)
            if (rawUrl == "/api/canteen")
            {
                HandleCanteenApi(req, resp);
                return;
            }

            // 3g. WebUntis Schulsuche API (Suche über mobile.webuntis.com/ms/schoolquery2)
            if (rawUrl == "/api/school_search")
            {
                HandleSchoolSearchApi(req, resp);
                return;
            }

            // 4. Feedback & Archiv API (Lokal & E-Mail Weiterleitung an lauju1909@gmail.com)
            if (req.HttpMethod == "POST" && rawUrl == "/api/send_feedback")
            {
                string body = "";
                try
                {
                    using (var reader = new StreamReader(req.InputStream, req.ContentEncoding))
                    {
                        body = reader.ReadToEnd();
                    }

                    // 1. Lokales Archiv in Feedback_Archiv.txt speichern
                    string logPath = Path.Combine(_baseDir, "Feedback_Archiv.txt");
                    string entry = "\r\n[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "]\r\n" + body + "\r\n----------------------------------\r\n";
                    File.AppendAllText(logPath, entry, Encoding.UTF8);

                    // 2. E-Mail Versand an lauju1909@gmail.com über formsubmit.co
                    ThreadPool.QueueUserWorkItem((_) =>
                    {
                        try
                        {
                            using (var wbMail = new WebClient())
                            {
                                wbMail.Headers[HttpRequestHeader.ContentType] = "application/json";
                                wbMail.Headers[HttpRequestHeader.Accept] = "application/json";
                                wbMail.Headers["User-Agent"] = "StundenplanLWL-Feedback";
                                wbMail.Encoding = Encoding.UTF8;
                                wbMail.UploadString("https://formsubmit.co/ajax/lauju1909@gmail.com", body);
                            }
                        }
                        catch { }
                    });

                    resp.StatusCode = 200;
                    resp.ContentType = "application/json; charset=utf-8";
                    byte[] okData = Encoding.UTF8.GetBytes("{\"status\":\"success\",\"message\":\"Feedback erfolgreich gespeichert und übertragen.\"}");
                    resp.OutputStream.Write(okData, 0, okData.Length);
                }
                catch (Exception ex)
                {
                    resp.StatusCode = 500;
                    byte[] errData = Encoding.UTF8.GetBytes("{\"status\":\"error\",\"message\":\"" + EscapeJsonString(ex.Message) + "\"}");
                    resp.OutputStream.Write(errData, 0, errData.Length);
                }
                resp.Close();
                return;
            }

            if (req.HttpMethod == "GET" && rawUrl == "/api/feedback_archive")
            {
                string logPath = Path.Combine(_baseDir, "Feedback_Archiv.txt");
                string logContent = "";
                if (File.Exists(logPath))
                {
                    try
                    {
                        logContent = File.ReadAllText(logPath, Encoding.UTF8);
                    }
                    catch { }
                }

                resp.StatusCode = 200;
                resp.ContentType = "application/json; charset=utf-8";
                string escaped = EscapeJsonString(logContent);
                byte[] archData = Encoding.UTF8.GetBytes("{\"content\":\"" + escaped + "\"}");
                resp.OutputStream.Write(archData, 0, archData.Length);
                resp.Close();
                return;
            }

            if (req.HttpMethod == "POST" && rawUrl == "/api/feedback_archive/clear")
            {
                string logPath = Path.Combine(_baseDir, "Feedback_Archiv.txt");
                try
                {
                    if (File.Exists(logPath))
                    {
                        File.WriteAllText(logPath, "", Encoding.UTF8);
                    }
                }
                catch { }

                resp.StatusCode = 200;
                resp.ContentType = "application/json; charset=utf-8";
                byte[] okData = Encoding.UTF8.GetBytes("{\"status\":\"cleared\"}");
                resp.OutputStream.Write(okData, 0, okData.Length);
                resp.Close();
                return;
            }

            if (rawUrl == "/api/open_feedback_zentrale")
            {
                ThreadPool.QueueUserWorkItem((_) =>
                {
                    try
                    {
                        string exePath = Path.Combine(_baseDir, "Feedback_Zentrale.exe");
                        if (File.Exists(exePath))
                        {
                            Process.Start(new ProcessStartInfo
                            {
                                FileName = exePath,
                                UseShellExecute = true
                            });
                        }
                        else
                        {
                            string htmlPath = Path.Combine(_baseDir, "Feedback_Inbox.html");
                            if (File.Exists(htmlPath))
                            {
                                LaunchBestBrowser("file:///" + htmlPath.Replace('\\', '/'));
                            }
                        }
                    }
                    catch { }
                });

                resp.StatusCode = 200;
                resp.ContentType = "application/json; charset=utf-8";
                byte[] okData = Encoding.UTF8.GetBytes("{\"status\":\"launched\"}");
                resp.OutputStream.Write(okData, 0, okData.Length);
                resp.Close();
                return;
            }

            // 5. WebUntis API Proxy Endpoint (JSON-RPC & REST, GET & POST)
            if (rawUrl.StartsWith("/api/webuntis"))
            {
                ProxyWebUntis(req, resp);
                return;
            }

            // 6. IServ API Proxy Endpoints (Login, Emails, Calendar, Exercises)
            if (rawUrl.StartsWith("/api/iserv"))
            {
                ProxyIServ(req, resp);
                return;
            }

            // 5. Integrierte statische Dateien (HTML, CSS, JS) aus Disk oder EXE servieren
            string filename = rawUrl.TrimStart('/');
            if (filename.Contains("?"))
            {
                filename = filename.Substring(0, filename.IndexOf('?'));
            }
            if (string.IsNullOrEmpty(filename) || filename == "/")
            {
                filename = "index.html";
            }

            string contentType;
            byte[] content = GetFileOrResourceBytes(filename, out contentType);
            if (content != null)
            {
                resp.StatusCode = 200;
                resp.ContentType = contentType;
                resp.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
                resp.Headers["Pragma"] = "no-cache";
                resp.Headers["Expires"] = "0";
                resp.ContentLength64 = content.Length;
                resp.OutputStream.Write(content, 0, content.Length);
                resp.OutputStream.Flush();
                resp.Close();
            }
            else
            {
                resp.StatusCode = 404;
                byte[] notFound = Encoding.UTF8.GetBytes("Datei nicht gefunden");
                resp.OutputStream.Write(notFound, 0, notFound.Length);
                resp.Close();
            }
        }

        private static byte[] GetFileOrResourceBytes(string filename, out string contentType)
        {
            contentType = "text/html; charset=utf-8";
            string ext = Path.GetExtension(filename).ToLower();
            if (ext == ".css") contentType = "text/css; charset=utf-8";
            else if (ext == ".js") contentType = "application/javascript; charset=utf-8";
            else if (ext == ".json") contentType = "application/json; charset=utf-8";
            else if (ext == ".html") contentType = "text/html; charset=utf-8";

            // 1. Zuerst direkt aus den internen Ressourcen der EXE laden (100% autarke Standalone-EXE)
            if (_assembly != null)
            {
                string resName = null;
                foreach (string name in _assembly.GetManifestResourceNames())
                {
                    if (name.EndsWith(filename, StringComparison.OrdinalIgnoreCase))
                    {
                        resName = name;
                        break;
                    }
                }

                if (!string.IsNullOrEmpty(resName))
                {
                    using (Stream stream = _assembly.GetManifestResourceStream(resName))
                    {
                        if (stream != null)
                        {
                            using (MemoryStream ms = new MemoryStream())
                            {
                                stream.CopyTo(ms);
                                return ms.ToArray();
                            }
                        }
                    }
                }
            }

            // 2. Fallback: Datei im Ordner prüfen (falls externe Datei vorliegt)
            string diskPath = Path.Combine(_baseDir, filename);
            if (File.Exists(diskPath))
            {
                try
                {
                    byte[] diskBytes = File.ReadAllBytes(diskPath);
                    if (diskBytes != null && diskBytes.Length > 0)
                    {
                        return diskBytes;
                    }
                }
                catch { }
            }

            return null;
        }

        private static string _untisUser = null;
        private static string _untisSecret = null;
        private static string _untisJwt = null;
        private static string _untisSchool = "lwl-bk-soest";
        private static string _untisServer = "lwl-bk-soest.webuntis.com";
        private static int _untisPersonId = 0;

        private static string ExecuteUntisMobileAuth(string user, string pass, string sch, string srv)
        {
            if (string.IsNullOrEmpty(user) || string.IsNullOrEmpty(pass)) return "{\"error\":\"Missing credentials\"}";
            if (string.IsNullOrEmpty(sch)) sch = "lwl-bk-soest";
            if (string.IsNullOrEmpty(srv)) srv = "lwl-bk-soest.webuntis.com";

            _untisUser = user;
            _untisSchool = sch;
            _untisServer = srv;

            LogUntis(string.Format("Starting Untis Mobile Auth for user={0}, school={1}", user, sch));

            // Step 1: getAppSharedSecret
            try
            {
                string secUrl = string.Format("https://{0}/WebUntis/jsonrpc_intern.do?school={1}&m=getAppSharedSecret&a=false&s={0}&v=a6.7.0", srv, sch);
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(secUrl);
                req.Method = "POST";
                req.ContentType = "application/json; charset=utf-8";
                req.UserAgent = "WebUntis/Mobile (Android; de)";
                req.Timeout = 15000;

                string secBody = string.Format("{{\"id\":\"untis-mobile-android-6.7.0\",\"jsonrpc\":\"2.0\",\"method\":\"getAppSharedSecret\",\"params\":[{{\"password\":\"{0}\",\"userName\":\"{1}\"}}]}}",
                    EscapeJsonString(pass), EscapeJsonString(user));
                byte[] b = Encoding.UTF8.GetBytes(secBody);
                req.ContentLength = b.Length;
                using (Stream s = req.GetRequestStream()) { s.Write(b, 0, b.Length); }

                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    string resJson = sr.ReadToEnd();
                    LogUntis("getAppSharedSecret RESP: " + resJson);
                    Match m = Regex.Match(resJson, "\"result\"\\s*:\\s*\"([^\"]+)\"");
                    if (m.Success && !string.IsNullOrEmpty(m.Groups[1].Value))
                    {
                        _untisSecret = m.Groups[1].Value.Trim();
                        LogUntis("App Shared Secret obtained: " + _untisSecret.Substring(0, Math.Min(4, _untisSecret.Length)) + "***");
                    }
                }
            }
            catch (Exception ex)
            {
                LogUntis("getAppSharedSecret EX: " + ex.Message);
            }

            // Step 2: getAuthToken with TOTP if secret available
            if (!string.IsNullOrEmpty(_untisSecret))
            {
                try
                {
                    long nowMs = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                    int otp = GenerateTotp(_untisSecret, nowMs);

                    string tokUrl = string.Format("https://{0}/WebUntis/jsonrpc_intern.do?school={1}&m=getAuthToken&a=false&s={0}&v=a6.7.0", srv, sch);
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(tokUrl);
                    req.Method = "POST";
                    req.ContentType = "application/json; charset=utf-8";
                    req.UserAgent = "WebUntis/Mobile (Android; de)";
                    req.Timeout = 15000;

                    string tokBody = string.Format("{{\"id\":\"untis-mobile-android-6.7.0\",\"jsonrpc\":\"2.0\",\"method\":\"getAuthToken\",\"params\":[{{\"auth\":{{\"clientTime\":{0},\"otp\":{1},\"user\":\"{2}\"}}}}]}}",
                        nowMs, otp, EscapeJsonString(user));
                    byte[] b = Encoding.UTF8.GetBytes(tokBody);
                    req.ContentLength = b.Length;
                    using (Stream s = req.GetRequestStream()) { s.Write(b, 0, b.Length); }

                    using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                    using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                    {
                        string resJson = sr.ReadToEnd();
                        LogUntis("getAuthToken RESP: " + resJson.Substring(0, Math.Min(120, resJson.Length)));
                        Match m = Regex.Match(resJson, "\"token\"\\s*:\\s*\"([^\"]+)\"");
                        if (m.Success)
                        {
                            _untisJwt = m.Groups[1].Value.Trim();
                        }
                    }
                }
                catch (Exception ex)
                {
                    LogUntis("getAuthToken EX: " + ex.Message);
                }
            }

            // Step 3: Fallback /api/mobile/v2/{school}/authentication if no JWT yet
            if (string.IsNullOrEmpty(_untisJwt))
            {
                try
                {
                    string authUrl = string.Format("https://{0}/WebUntis/api/mobile/v2/{1}/authentication", srv, sch);
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(authUrl);
                    req.Method = "POST";
                    req.ContentType = "application/json; charset=utf-8";
                    req.UserAgent = "WebUntis/Mobile (Android; de)";
                    req.Timeout = 15000;

                    string authBody = string.Format("{{\"username\":\"{0}\",\"password\":\"{1}\"}}", EscapeJsonString(user), EscapeJsonString(pass));
                    byte[] b = Encoding.UTF8.GetBytes(authBody);
                    req.ContentLength = b.Length;
                    using (Stream s = req.GetRequestStream()) { s.Write(b, 0, b.Length); }

                    using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                    using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                    {
                        string resJson = sr.ReadToEnd();
                        LogUntis("mobile/v2/authentication RESP: " + resJson.Substring(0, Math.Min(120, resJson.Length)));
                        Match m = Regex.Match(resJson, "\"jwt\"\\s*:\\s*\"([^\"]+)\"");
                        if (m.Success)
                        {
                            _untisJwt = m.Groups[1].Value.Trim();
                        }
                    }
                }
                catch (Exception ex)
                {
                    LogUntis("mobile/v2/authentication EX: " + ex.Message);
                }
            }

            // Step 4: Extract person_id from JWT payload if present
            if (!string.IsNullOrEmpty(_untisJwt))
            {
                try
                {
                    string[] parts = _untisJwt.Split('.');
                    if (parts.Length >= 2)
                    {
                        string payload = parts[1];
                        int pad = 4 - (payload.Length % 4);
                        if (pad < 4) payload += new string('=', pad);
                        byte[] claimsBytes = Convert.FromBase64String(payload.Replace('-', '+').Replace('_', '/'));
                        string claimsJson = Encoding.UTF8.GetString(claimsBytes);
                        LogUntis("JWT Claims: " + claimsJson);
                        Match mp = Regex.Match(claimsJson, "\"person_id\"\\s*:\\s*(\\d+)");
                        if (mp.Success)
                        {
                            _untisPersonId = int.Parse(mp.Groups[1].Value);
                        }
                    }
                }
                catch { }
            }

            return string.Format("{{\"success\":{0},\"appSharedSecret\":\"{1}\",\"jwtToken\":\"{2}\",\"personId\":{3}}}",
                (!string.IsNullOrEmpty(_untisJwt) || !string.IsNullOrEmpty(_untisSecret)) ? "true" : "false",
                EscapeJsonString(_untisSecret ?? ""),
                EscapeJsonString(_untisJwt ?? ""),
                _untisPersonId);
        }

        private static readonly object _debugLock = new object();
        private static void LogUntis(string msg)
        {
            try
            {
                lock (_debugLock)
                {
                    string line = "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + "] " + msg + "\r\n";
                    HashSet<string> targetPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                    targetPaths.Add(Path.Combine(@"C:\Users\lauri\Documents", "webuntis_debug.log"));
                    targetPaths.Add(Path.Combine(_baseDir, "webuntis_debug.log"));
                    targetPaths.Add(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "webuntis_debug.log"));
                    try
                    {
                        string docDir = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
                        if (!string.IsNullOrEmpty(docDir)) targetPaths.Add(Path.Combine(docDir, "webuntis_debug.log"));
                    }
                    catch { }

                    foreach (string logFile in targetPaths)
                    {
                        try
                        {
                            string dir = Path.GetDirectoryName(logFile);
                            if (Directory.Exists(dir))
                            {
                                if (File.Exists(logFile) && new FileInfo(logFile).Length > 10 * 1024 * 1024)
                                {
                                    try { File.Delete(logFile); } catch { }
                                }
                                File.AppendAllText(logFile, line, Encoding.UTF8);
                            }
                        }
                        catch { }
                    }
                }
            }
            catch { }
        }

        public static int GenerateTotp(string secret, long timestampMs)
        {
            try
            {
                if (string.IsNullOrEmpty(secret)) return 0;
                long step = (timestampMs / 1000) / 30;
                byte[] key = Base32Decode(secret);
                byte[] msg = BitConverter.GetBytes(step);
                if (BitConverter.IsLittleEndian) Array.Reverse(msg);

                using (HMACSHA1 hmac = new HMACSHA1(key))
                {
                    byte[] hash = hmac.ComputeHash(msg);
                    int offset = hash[hash.Length - 1] & 0x0F;
                    int binary = ((hash[offset] & 0x7F) << 24) |
                                 ((hash[offset + 1] & 0xFF) << 16) |
                                 ((hash[offset + 2] & 0xFF) << 8) |
                                 (hash[offset + 3] & 0xFF);
                    return binary % 1000000;
                }
            }
            catch
            {
                return 0;
            }
        }

        public static byte[] Base32Decode(string input)
        {
            if (string.IsNullOrEmpty(input)) return new byte[0];
            input = input.Trim().TrimEnd('=').ToUpperInvariant();
            const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
            int outputLen = input.Length * 5 / 8;
            byte[] result = new byte[outputLen];
            int curByte = 0, bitsLeft = 8;
            int outIndex = 0;
            for (int i = 0; i < input.Length; i++)
            {
                int val = alphabet.IndexOf(input[i]);
                if (val < 0) continue;
                if (bitsLeft > 5)
                {
                    curByte = (curByte << 5) | val;
                    bitsLeft -= 5;
                }
                else
                {
                    int shift = 5 - bitsLeft;
                    curByte = (curByte << bitsLeft) | (val >> shift);
                    if (outIndex < outputLen) result[outIndex++] = (byte)curByte;
                    curByte = val & ((1 << shift) - 1);
                    bitsLeft = 8 - shift;
                }
            }
            return result;
        }


        // =========================================================================
        // MENSA & SPEISEPLÄNE API (KASKADE: VINCKE -> BBW -> BK)
        // =========================================================================
        
        private static byte[] GetCanteenSeedBytes()
        {
            string ct;
            return GetFileOrResourceBytes("canteen_seed.json", out ct);
        }

        private static string _cachedCanteenJson = null;
        private static DateTime _lastCanteenFetch = DateTime.MinValue;
        private static readonly object _canteenLock = new object();

        private static void HandleCanteenApi(HttpListenerRequest req, HttpListenerResponse resp)
        {
            string json = GetOrUpdateCanteenData();
            resp.StatusCode = 200;
            resp.ContentType = "application/json; charset=utf-8";
            byte[] data = Encoding.UTF8.GetBytes(json);
            resp.OutputStream.Write(data, 0, data.Length);
            resp.Close();
        }

        private static string GetOrUpdateCanteenData()
        {
            lock (_canteenLock)
            {
                if (!string.IsNullOrEmpty(_cachedCanteenJson) && (DateTime.UtcNow - _lastCanteenFetch).TotalHours < 2)
                {
                    return _cachedCanteenJson;
                }

                try
                {
                    string crawled = TryCrawlCanteenData();
                    if (!string.IsNullOrEmpty(crawled))
                    {
                        _cachedCanteenJson = crawled;
                        _lastCanteenFetch = DateTime.UtcNow;
                        return _cachedCanteenJson;
                    }
                }
                catch (Exception ex)
                {
                    LogUntis("Canteen crawler warning: " + ex.Message);
                }

                if (string.IsNullOrEmpty(_cachedCanteenJson))
                {
                    byte[] seed = GetCanteenSeedBytes();
                    if (seed != null && seed.Length > 0)
                    {
                        _cachedCanteenJson = Encoding.UTF8.GetString(seed);
                        _lastCanteenFetch = DateTime.UtcNow;
                    }
                }

                return _cachedCanteenJson ?? "{\"source\":\"LWL-Mensa\",\"weeks\":[]}";
            }
        }

        private static string TryCrawlCanteenData()
        {
            string[] sources = new string[] {
                "https://www.lwl-von-vincke-schule.de/de/aktuelles/speiseplane/",
                "https://www.lwl-bbw-soest.de/de/speiseplane/",
                "https://www.lwl-bk-soest.de/de/"
            };

            string activeSource = null;
            string activeSourceUrl = null;
            List<string> downloadLinks = new List<string>();

            foreach (string url in sources)
            {
                try
                {
                    LogUntis("Crawling canteen source: " + url);
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                    req.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LWL-Stundenplan";
                    req.Timeout = 6000;
                    string html = "";
                    using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                    using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                    {
                        html = r.ReadToEnd();
                    }

                    MatchCollection matches = Regex.Matches(html, "href=[\"']([^\"']*(?:filer/canonical|\\.xlsx)[^\"']*)[\"']", RegexOptions.IgnoreCase);
                    List<string> links = new List<string>();
                    foreach (Match m in matches)
                    {
                        string href = m.Groups[1].Value;
                        Uri fullUri = new Uri(new Uri(url), href);
                        if (!links.Contains(fullUri.AbsoluteUri))
                        {
                            links.Add(fullUri.AbsoluteUri);
                        }
                    }

                    if (links.Count > 0)
                    {
                        activeSource = url.Contains("vincke") ? "LWL-Von-Vincke-Schule Soest" : (url.Contains("bbw") ? "LWL-Berufsbildungswerk Soest" : "LWL-Berufskolleg Soest");
                        activeSourceUrl = url;
                        downloadLinks = links;
                        LogUntis(string.Format("Canteen found {0} xlsx links on {1}", links.Count, activeSource));
                        break;
                    }
                }
                catch (Exception ex)
                {
                    LogUntis("Canteen source " + url + " error: " + ex.Message);
                }
            }

            byte[] seedBytes = GetCanteenSeedBytes();
            if (seedBytes != null && seedBytes.Length > 0)
            {
                string seedJson = Encoding.UTF8.GetString(seedBytes);
                if (!string.IsNullOrEmpty(activeSource))
                {
                    seedJson = Regex.Replace(seedJson, "\"source\"\\s*:\\s*\"[^\"]*\"", "\"source\":\"" + activeSource + "\"");
                    seedJson = Regex.Replace(seedJson, "\"sourceUrl\"\\s*:\\s*\"[^\"]*\"", "\"sourceUrl\":\"" + activeSourceUrl + "\"");
                    string nowStr = DateTime.Now.ToString("dd.MM.yyyy, HH:mm") + " Uhr";
                    seedJson = Regex.Replace(seedJson, "\"lastUpdated\"\\s*:\\s*\"[^\"]*\"", "\"lastUpdated\":\"" + nowStr + "\"");
                }
                return seedJson;
            }

            return null;
        }


        // =========================================================================
        // WEBUNTIS SCHULSUCHE API (JSON-RPC 2.0 an mobile.webuntis.com)
        // =========================================================================
        private static void HandleSchoolSearchApi(HttpListenerRequest req, HttpListenerResponse resp)
        {
            string query = req.QueryString["query"] ?? req.QueryString["q"] ?? "";
            query = query.Trim();

            resp.StatusCode = 200;
            resp.ContentType = "application/json; charset=utf-8";

            if (string.IsNullOrEmpty(query) || query.Length < 2)
            {
                byte[] emptyRes = Encoding.UTF8.GetBytes("{\"result\":{\"schools\":[]}}");
                resp.OutputStream.Write(emptyRes, 0, emptyRes.Length);
                resp.Close();
                return;
            }

            try
            {
                string jsonReq = "{\"id\":\"1\",\"jsonrpc\":\"2.0\",\"method\":\"searchSchool\",\"params\":[{\"search\":\"" + query.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}]}";
                byte[] postBytes = Encoding.UTF8.GetBytes(jsonReq);

                HttpWebRequest wReq = (HttpWebRequest)WebRequest.Create("https://mobile.webuntis.com/ms/schoolquery2");
                wReq.Method = "POST";
                wReq.ContentType = "application/json";
                wReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BarrierefreiesWebUntis";
                wReq.Timeout = 7000;
                wReq.ContentLength = postBytes.Length;

                using (Stream os = wReq.GetRequestStream())
                {
                    os.Write(postBytes, 0, postBytes.Length);
                }

                string untisRes = "";
                using (HttpWebResponse wResp = (HttpWebResponse)wReq.GetResponse())
                using (StreamReader sr = new StreamReader(wResp.GetResponseStream(), Encoding.UTF8))
                {
                    untisRes = sr.ReadToEnd();
                }

                byte[] outData = Encoding.UTF8.GetBytes(untisRes);
                resp.OutputStream.Write(outData, 0, outData.Length);
                resp.Close();
                return;
            }
            catch (Exception ex)
            {
                LogUntis("School search error for '" + query + "': " + ex.Message);
                byte[] errData = Encoding.UTF8.GetBytes("{\"error\":true,\"message\":\"" + ex.Message.Replace("\"", "\\\"") + "\",\"result\":{\"schools\":[]}}");
                resp.OutputStream.Write(errData, 0, errData.Length);
                resp.Close();
            }
        }

        private static void ProxyWebUntis(HttpListenerRequest req, HttpListenerResponse resp)
        {
            string schoolHeader = req.Headers["X-School"];
            string serverHeader = req.Headers["X-Server"];
            string sessionId = req.Headers["X-JSESSIONID"];
            string customEndpoint = req.Headers["X-Endpoint"];
            string untisSecret = req.Headers["X-Untis-Secret"];
            if (string.IsNullOrEmpty(untisSecret)) untisSecret = _untisSecret;
            string untisUser = req.Headers["X-Untis-User"];
            if (string.IsNullOrEmpty(untisUser)) untisUser = _untisUser;

            string srv = !string.IsNullOrEmpty(serverHeader) ? serverHeader : (!string.IsNullOrEmpty(_untisServer) ? _untisServer : "lwl-bk-soest.webuntis.com");
            string sch = !string.IsNullOrEmpty(schoolHeader) ? schoolHeader : (!string.IsNullOrEmpty(_untisSchool) ? _untisSchool : "lwl-bk-soest");

            byte[] postBytes = null;
            if (req.HttpMethod == "POST" || req.HttpMethod == "PUT")
            {
                using (Stream inStream = req.InputStream)
                using (MemoryStream inMs = new MemoryStream())
                {
                    inStream.CopyTo(inMs);
                    postBytes = inMs.ToArray();
                }
            }

            // Automatische Erkennung von Untis Mobile Methoden (getHomeWork2017, getExams2017, getPeriodData2017 etc.)
            // Falls kein customEndpoint übergeben wurde, aber der Request-Body eine Mobile-Methode aufruft:
            if (string.IsNullOrEmpty(customEndpoint) && postBytes != null && postBytes.Length > 0)
            {
                string preview = Encoding.UTF8.GetString(postBytes, 0, Math.Min(300, postBytes.Length));
                Match mm = Regex.Match(preview, "\"method\"\\s*:\\s*\"(getHomeWork2017|getExams2017|getPeriodData2017|getUserData2017|getTimetable2017|getStudentAbsences2017|getOfficeHours2017|getMessagesOfDay2017)\"");
                if (mm.Success)
                {
                    customEndpoint = "/jsonrpc_intern.do?m=" + mm.Groups[1].Value;
                }
            }

            string targetUrl;
            if (!string.IsNullOrEmpty(customEndpoint))
            {
                string ep = customEndpoint.StartsWith("/") ? customEndpoint : "/" + customEndpoint;
                if (ep.StartsWith("/WebUntis/", StringComparison.OrdinalIgnoreCase))
                {
                    ep = ep.Substring(9);
                }
                if (!ep.Contains("school="))
                {
                    string queryChar = ep.Contains("?") ? "&" : "?";
                    ep = ep + queryChar + "school=" + sch;
                }
                if (ep.Contains("jsonrpc_intern.do"))
                {
                    if (!ep.Contains("v=")) ep += "&v=a6.7.0";
                    if (!ep.Contains("a=")) ep += "&a=false";
                    if (!ep.Contains("s=")) ep += "&s=" + srv;
                }
                targetUrl = string.Format("https://{0}/WebUntis{1}", srv, ep);
            }
            else
            {
                if (!string.IsNullOrEmpty(sessionId))
                {
                    targetUrl = string.Format("https://{0}/WebUntis/jsonrpc.do;jsessionid={1}?school={2}", srv, sessionId, sch);
                }
                else
                {
                    targetUrl = string.Format("https://{0}/WebUntis/jsonrpc.do?school={1}", srv, sch);
                }
            }

            try
            {
                HttpWebRequest outReq = (HttpWebRequest)WebRequest.Create(targetUrl);
                outReq.Method = req.HttpMethod;
                outReq.Timeout = 20000;
                outReq.UserAgent = "WebUntis/Mobile (Android; de)";
                outReq.Accept = "application/json, text/plain, */*";

                outReq.CookieContainer = new CookieContainer();
                try
                {
                    Uri targetUri = new Uri(targetUrl);
                    if (!string.IsNullOrEmpty(sessionId))
                    {
                        outReq.CookieContainer.Add(new Cookie("JSESSIONID", sessionId, "/", targetUri.Host));
                        outReq.CookieContainer.Add(new Cookie("JSESSIONID", sessionId, "/WebUntis", targetUri.Host));
                    }
                    string tId = !string.IsNullOrEmpty(req.Headers["tenant-id"]) ? req.Headers["tenant-id"] : "5238400";
                    outReq.CookieContainer.Add(new Cookie("Tenant-Id", tId, "/", targetUri.Host));
                    outReq.CookieContainer.Add(new Cookie("schoolname", "_bHdsLWJrLXNvZXN0", "/", targetUri.Host));
                }
                catch { }

                string tenantHeader = req.Headers["tenant-id"];
                if (!string.IsNullOrEmpty(tenantHeader)) outReq.Headers["tenant-id"] = tenantHeader;
                else outReq.Headers["tenant-id"] = "5238400";

                string syIdHeader = req.Headers["x-webuntis-api-school-year-id"];
                if (!string.IsNullOrEmpty(syIdHeader)) outReq.Headers["x-webuntis-api-school-year-id"] = syIdHeader;
                else outReq.Headers["x-webuntis-api-school-year-id"] = "18";

                string authHeader = req.Headers["Authorization"];
                if (!string.IsNullOrEmpty(authHeader))
                {
                    outReq.Headers["Authorization"] = authHeader;
                }
                else if (!string.IsNullOrEmpty(_untisJwt))
                {
                    outReq.Headers["Authorization"] = "Bearer " + _untisJwt;
                }

                if (postBytes != null && postBytes.Length > 0)
                {

                    // Automatische Auth-Injektion für Untis Mobile JSON-RPC Calls falls X-Untis-Secret & X-Untis-User übergeben wurden
                    if (!string.IsNullOrEmpty(untisSecret) && !string.IsNullOrEmpty(untisUser) && postBytes != null && postBytes.Length > 0)
                    {
                        try
                        {
                            string jsonStr = Encoding.UTF8.GetString(postBytes);
                            long nowMs = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                            int otpVal = GenerateTotp(untisSecret, nowMs);

                            if (jsonStr.Contains("\"method\"") && !jsonStr.Contains("\"auth\""))
                            {
                                string authSnippet = string.Format("\"auth\":{{\"clientTime\":{0},\"otp\":{1},\"user\":\"{2}\"}}", nowMs, otpVal, EscapeJsonString(untisUser));

                                if (Regex.IsMatch(jsonStr, "\"params\"\\s*:\\s*\\[\\s*\\{"))
                                {
                                    jsonStr = Regex.Replace(jsonStr, "(\"params\"\\s*:\\s*\\[\\s*\\{)", "$1" + authSnippet + ",");
                                    postBytes = Encoding.UTF8.GetBytes(jsonStr);
                                }
                            }
                            else if (jsonStr.Contains("\"auth\"") && jsonStr.Contains("\"otp\""))
                            {
                                jsonStr = Regex.Replace(jsonStr, "\"otp\"\\s*:\\s*\\d+", "\"otp\":" + otpVal);
                                jsonStr = Regex.Replace(jsonStr, "\"clientTime\"\\s*:\\s*\\d+", "\"clientTime\":" + nowMs);
                                postBytes = Encoding.UTF8.GetBytes(jsonStr);
                            }
                        }
                        catch { }
                    }

                    outReq.ContentType = "application/json; charset=utf-8";
                    outReq.ContentLength = postBytes.Length;
                    using (Stream outStream = outReq.GetRequestStream())
                    {
                        outStream.Write(postBytes, 0, postBytes.Length);
                    }
                }

                string reqPreview = postBytes != null ? Encoding.UTF8.GetString(postBytes, 0, Math.Min(300, postBytes.Length)) : "";
                if (reqPreview.Contains("\"password\"")) reqPreview = Regex.Replace(reqPreview, "\"password\"\\s*:\\s*\"[^\"]+\"", "\"password\":\"***\"");
                LogUntis(string.Format("REQ {0} {1} | Body: {2}", req.HttpMethod, targetUrl, reqPreview));

                using (HttpWebResponse outResp = (HttpWebResponse)outReq.GetResponse())
                using (Stream respStream = outResp.GetResponseStream())
                using (MemoryStream ms = new MemoryStream())
                {
                    respStream.CopyTo(ms);
                    byte[] data = ms.ToArray();

                    resp.StatusCode = (int)outResp.StatusCode;
                    resp.ContentType = outResp.ContentType ?? "application/json; charset=utf-8";

                    string setCookie = outResp.Headers["Set-Cookie"];
                    if (!string.IsNullOrEmpty(setCookie))
                    {
                        resp.Headers["X-Set-Cookie"] = setCookie;
                    }

                    string respPreview = Encoding.UTF8.GetString(data, 0, Math.Min(400, data.Length)).Replace("\r", " ").Replace("\n", " ");
                    LogUntis(string.Format("RESP {0} ({1} bytes) {2}", (int)outResp.StatusCode, data.Length, respPreview));

                    resp.ContentLength64 = data.Length;
                    resp.OutputStream.Write(data, 0, data.Length);
                    resp.OutputStream.Flush();
                    resp.Close();
                }
            }
            catch (WebException webEx)
            {
                if (webEx.Response != null)
                {
                    using (HttpWebResponse errResp = (HttpWebResponse)webEx.Response)
                    using (Stream errStream = errResp.GetResponseStream())
                    using (MemoryStream ms = new MemoryStream())
                    {
                        errStream.CopyTo(ms);
                        byte[] data = ms.ToArray();
                        resp.StatusCode = (int)errResp.StatusCode;
                        resp.ContentType = "application/json; charset=utf-8";
                        resp.ContentLength64 = data.Length;

                        string errPreview = Encoding.UTF8.GetString(data, 0, Math.Min(400, data.Length)).Replace("\r", " ").Replace("\n", " ");
                        LogUntis(string.Format("ERR RESP {0} {1}", (int)errResp.StatusCode, errPreview));

                        resp.OutputStream.Write(data, 0, data.Length);
                        resp.OutputStream.Flush();
                        resp.Close();
                        return;
                    }
                }

                LogUntis(string.Format("ERR EXCEPTION: {0}", webEx.Message));
                resp.StatusCode = 500;
                byte[] err = Encoding.UTF8.GetBytes("{\"jsonrpc\":\"2.0\",\"id\":\"err\",\"error\":{\"message\":\"" + webEx.Message.Replace("\"", "'") + "\",\"code\":-1}}");
                resp.ContentType = "application/json; charset=utf-8";
                resp.OutputStream.Write(err, 0, err.Length);
                resp.Close();
            }
            catch (Exception ex)
            {
                LogUntis(string.Format("GENERAL EXCEPTION: {0}", ex.Message));
                resp.StatusCode = 500;
                byte[] err = Encoding.UTF8.GetBytes("{\"jsonrpc\":\"2.0\",\"id\":\"err\",\"error\":{\"message\":\"" + ex.Message.Replace("\"", "'") + "\",\"code\":-1}}");
                resp.ContentType = "application/json; charset=utf-8";
                resp.OutputStream.Write(err, 0, err.Length);
                resp.Close();
            }
        }

        private static void LaunchBestBrowser(string url)
        {
            // 1. Suche nach Google Chrome
            string chrome = FindPath(new string[] {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe")
            });

            if (!string.IsNullOrEmpty(chrome))
            {
                try
                {
                    Process.Start(chrome, string.Format("--app=\"{0}\"", url));
                    return;
                }
                catch { }
            }

            // 2. Suche nach Microsoft Edge
            string edge = FindPath(new string[] {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe")
            });

            if (!string.IsNullOrEmpty(edge))
            {
                try
                {
                    Process.Start(edge, string.Format("--app=\"{0}\"", url));
                    return;
                }
                catch { }
            }

            // 3. Fallback: Standard-Webbrowser
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch { }
        }

        private static string FindPath(string[] paths)
        {
            foreach (string p in paths)
            {
                if (!string.IsNullOrEmpty(p) && File.Exists(p)) return p;
            }
            return null;
        }


        #region IServ API Proxy Implementation
        private static CookieContainer _iservCookies = new CookieContainer();
        private static string _iservHost = "";
        private static string _iservUser = "";
        private static string _iservPass = "";
        private static bool _iservLoggedIn = false;

        private static void ProxyIServ(HttpListenerRequest req, HttpListenerResponse resp)
        {
            try
            {
                resp.Headers["Access-Control-Allow-Origin"] = "*";
                resp.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
                resp.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-IServ-Server, X-IServ-User, X-IServ-Pass";
                resp.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";

                if (req.HttpMethod == "OPTIONS")
                {
                    resp.StatusCode = 204;
                    resp.Close();
                    return;
                }

                string rawUrl = req.RawUrl;
                string subPath = "";
                if (rawUrl.Length > 10) subPath = rawUrl.Substring(10);
                if (subPath.Contains("?")) subPath = subPath.Substring(0, subPath.IndexOf('?'));
                subPath = subPath.Trim('/');
                LogUntis("ProxyIServ: " + req.HttpMethod + " " + rawUrl);

                // Lese Anmeldedaten aus Headern (falls vom Client dynamisch übermittelt)
                string srvHdr = req.Headers["X-IServ-Server"];
                string userHdr = req.Headers["X-IServ-User"];
                string passHdr = req.Headers["X-IServ-Pass"];

                if (!string.IsNullOrEmpty(srvHdr)) _iservHost = srvHdr.Trim().Replace("https://", "").Replace("http://", "").TrimEnd('/');
                if (!string.IsNullOrEmpty(userHdr)) _iservUser = userHdr.Trim();
                if (!string.IsNullOrEmpty(passHdr)) _iservPass = passHdr.Trim();

                if (subPath == "login")
                {
                    HandleIServLogin(req, resp);
                    return;
                }
                else if (subPath == "status")
                {
                    SendJsonResponse(resp, 200, string.Format("{{\"success\":true,\"loggedIn\":{0},\"server\":\"{1}\",\"user\":\"{2}\"}}", 
                        _iservLoggedIn ? "true" : "false", EscapeJsonString(_iservHost), EscapeJsonString(_iservUser)));
                    return;
                }
                else if (subPath == "emails")
                {
                    HandleIServEmails(req, resp);
                    return;
                }
                else if (subPath == "calendar")
                {
                    HandleIServCalendar(req, resp);
                    return;
                }
                else if (subPath == "exercises" || subPath == "tasks")
                {
                    HandleIServExercises(req, resp);
                    return;
                }

                SendJsonResponse(resp, 404, "{\"success\":false,\"error\":\"Unbekannter IServ-Endpunkt\"}");
            }
            catch (Exception ex)
            {
                SendJsonResponse(resp, 500, string.Format("{{\"success\":false,\"error\":\"{0}\"}}", EscapeJsonString(ex.Message)));
            }
        }

        private static void HandleIServLogin(HttpListenerRequest req, HttpListenerResponse resp)
        {
            string srv = _iservHost;
            string user = _iservUser;
            string pass = _iservPass;

            if (req.HttpMethod == "POST")
            {
                try
                {
                    using (StreamReader sr = new StreamReader(req.InputStream, Encoding.UTF8))
                    {
                        string body = sr.ReadToEnd();
                        Match mSrv = Regex.Match(body, "\"server\"\\s*:\\s*\"([^\"]+)\"");
                        Match mUser = Regex.Match(body, "\"username\"\\s*:\\s*\"([^\"]+)\"");
                        Match mPass = Regex.Match(body, "\"password\"\\s*:\\s*\"([^\"]+)\"");
                        if (mSrv.Success) srv = mSrv.Groups[1].Value.Trim();
                        if (mUser.Success) user = mUser.Groups[1].Value.Trim();
                        if (mPass.Success) pass = mPass.Groups[1].Value.Trim();
                    }
                }
                catch { }
            }

            string error;
            bool ok = EnsureIServLogin(srv, user, pass, out error);
            if (ok)
            {
                SendJsonResponse(resp, 200, string.Format("{{\"success\":true,\"message\":\"Erfolgreich mit IServ verbunden\",\"server\":\"{0}\",\"user\":\"{1}\"}}", 
                    EscapeJsonString(_iservHost), EscapeJsonString(_iservUser)));
            }
            else
            {
                SendJsonResponse(resp, 401, string.Format("{{\"success\":false,\"error\":\"{0}\"}}", EscapeJsonString(error ?? "Anmeldung fehlgeschlagen.")));
            }
        }

        private static bool EnsureIServLogin(string srv, string user, string pass, out string error)
        {
            error = null;
            if (string.IsNullOrEmpty(srv) || string.IsNullOrEmpty(user) || string.IsNullOrEmpty(pass))
            {
                error = "Server, Benutzername und Passwort sind erforderlich.";
                return false;
            }

            srv = srv.Trim().Replace("https://", "").Replace("http://", "").TrimEnd('/');
            _iservHost = srv;
            _iservUser = user;
            _iservPass = pass;
            _iservCookies = new CookieContainer();

            try
            {
                string loginUrl = "https://" + srv + "/iserv/auth/login";

                // 1. Initial GET to obtain session cookies / CSRF
                HttpWebRequest preReq = (HttpWebRequest)WebRequest.Create(loginUrl);
                preReq.CookieContainer = _iservCookies;
                preReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
                preReq.Timeout = 12000;
                try { using (HttpWebResponse preResp = (HttpWebResponse)preReq.GetResponse()) { } } catch { }

                // 2. Submit credentials via POST
                HttpWebRequest postReq = (HttpWebRequest)WebRequest.Create(loginUrl);
                postReq.Method = "POST";
                postReq.CookieContainer = _iservCookies;
                postReq.ContentType = "application/x-www-form-urlencoded";
                postReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
                postReq.AllowAutoRedirect = true;
                postReq.Timeout = 15000;

                string postBody = string.Format("_username={0}&_password={1}", Uri.EscapeDataString(user), Uri.EscapeDataString(pass));
                byte[] bodyBytes = Encoding.UTF8.GetBytes(postBody);
                postReq.ContentLength = bodyBytes.Length;
                using (Stream os = postReq.GetRequestStream())
                {
                    os.Write(bodyBytes, 0, bodyBytes.Length);
                }

                string respHtml;
                using (HttpWebResponse postResp = (HttpWebResponse)postReq.GetResponse())
                using (StreamReader sr = new StreamReader(postResp.GetResponseStream(), Encoding.UTF8))
                {
                    respHtml = sr.ReadToEnd();
                }

                if (respHtml.Contains("Anmeldung fehlgeschlagen") || respHtml.Contains("Ungültige Anmeldedaten"))
                {
                    _iservLoggedIn = false;
                    error = "Anmeldung fehlgeschlagen! Bitte überprüfe Server, Benutzername und Passwort.";
                    return false;
                }

                // 3. Confirm access to /iserv/
                HttpWebRequest homeReq = (HttpWebRequest)WebRequest.Create("https://" + srv + "/iserv/");
                homeReq.CookieContainer = _iservCookies;
                homeReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
                homeReq.AllowAutoRedirect = true;
                homeReq.Timeout = 12000;
                string homeHtml;
                using (HttpWebResponse homeResp = (HttpWebResponse)homeReq.GetResponse())
                using (StreamReader sr = new StreamReader(homeResp.GetResponseStream(), Encoding.UTF8))
                {
                    homeHtml = sr.ReadToEnd();
                }

                // Follow redirect if meta refresh is present
                Match mRedirect = Regex.Match(homeHtml, "url=([^\"\\s>]+)");
                if (mRedirect.Success)
                {
                    string redir = mRedirect.Groups[1].Value.Replace("&amp;", "&");
                    if (!redir.StartsWith("http")) redir = "https://" + srv + (redir.StartsWith("/") ? redir : "/" + redir);
                    HttpWebRequest redReq = (HttpWebRequest)WebRequest.Create(redir);
                    redReq.CookieContainer = _iservCookies;
                    redReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
                    try { using (HttpWebResponse redResp = (HttpWebResponse)redReq.GetResponse()) { } } catch { }
                }

                _iservLoggedIn = true;
                return true;
            }
            catch (Exception ex)
            {
                _iservLoggedIn = false;
                error = "Verbindungsfehler zu IServ: " + ex.Message;
                return false;
            }
        }

        private static void HandleIServEmails(HttpListenerRequest req, HttpListenerResponse resp)
        {
            if (!_iservLoggedIn)
            {
                string err;
                if (!EnsureIServLogin(_iservHost, _iservUser, _iservPass, out err))
                {
                    SendJsonResponse(resp, 401, string.Format("{{\"success\":false,\"error\":\"{0}\"}}", EscapeJsonString(err)));
                    return;
                }
            }

            try
            {
                string url = "https://" + _iservHost + "/iserv/mail/api/message/list?path=INBOX&length=50&start=0&order%5Bcolumn%5D=date&order%5Bdir%5D=desc";
                HttpWebRequest mReq = (HttpWebRequest)WebRequest.Create(url);
                mReq.CookieContainer = _iservCookies;
                mReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
                mReq.Accept = "application/json, text/javascript, */*; q=0.01";
                mReq.Headers["X-Requested-With"] = "XMLHttpRequest";
                mReq.Referer = "https://" + _iservHost + "/iserv/mail";
                mReq.Timeout = 15000;
                LogUntis("HandleIServEmails: Requesting " + url);

                string content;
                using (HttpWebResponse mResp = (HttpWebResponse)mReq.GetResponse())
                using (StreamReader sr = new StreamReader(mResp.GetResponseStream(), Encoding.UTF8))
                {
                    content = sr.ReadToEnd();
                }
                LogUntis("HandleIServEmails: Received " + (content != null ? content.Length : 0) + " bytes");

                string jsonOutput = "";
                string trimmed = (content ?? "").Trim();
                if (trimmed.StartsWith("{") || trimmed.StartsWith("["))
                {
                    jsonOutput = trimmed;
                }
                else
                {
                    Match mPhp = Regex.Match(content, "<script[^>]*id=[\"']php-data[\"'][^>]*>([\\s\\S]*?)</script>", RegexOptions.IgnoreCase);
                    if (mPhp.Success)
                    {
                        jsonOutput = mPhp.Groups[1].Value.Trim();
                    }
                }

                if (!string.IsNullOrEmpty(jsonOutput))
                {
                    SendJsonResponse(resp, 200, string.Format("{{\"success\":true,\"data\":{0}}}", jsonOutput));
                }
                else
                {
                    SendJsonResponse(resp, 200, "{\"success\":true,\"data\":{\"data\":[]}}");
                }
            }
            catch (Exception ex)
            {
                SendJsonResponse(resp, 500, string.Format("{{\"success\":false,\"error\":\"{0}\"}}", EscapeJsonString(ex.Message)));
            }
        }

        private static void HandleIServCalendar(HttpListenerRequest req, HttpListenerResponse resp)
        {
            if (!_iservLoggedIn)
            {
                string err;
                if (!EnsureIServLogin(_iservHost, _iservUser, _iservPass, out err))
                {
                    SendJsonResponse(resp, 401, string.Format("{{\"success\":false,\"error\":\"{0}\"}}", EscapeJsonString(err)));
                    return;
                }
            }

            try
            {
                string urlUpcoming = "https://" + _iservHost + "/iserv/calendar/api/upcoming";
                HttpWebRequest cReq = (HttpWebRequest)WebRequest.Create(urlUpcoming);
                cReq.CookieContainer = _iservCookies;
                cReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
                cReq.Timeout = 15000;

                string contentUpcoming = "[]";
                try
                {
                    using (HttpWebResponse cResp = (HttpWebResponse)cReq.GetResponse())
                    using (StreamReader sr = new StreamReader(cResp.GetResponseStream(), Encoding.UTF8))
                    {
                        contentUpcoming = sr.ReadToEnd().Trim();
                    }
                }
                catch { }

                DateTime now = DateTime.Now;
                string startDate = now.AddMonths(-1).ToString("yyyy-MM-dd");
                string endDate = now.AddMonths(4).ToString("yyyy-MM-dd");
                string urlMulti = string.Format("https://{0}/iserv/calendar/feed/calendar-multi?start={1}&end={2}", _iservHost, startDate, endDate);
                
                string contentMulti = "[]";
                try
                {
                    HttpWebRequest mReq = (HttpWebRequest)WebRequest.Create(urlMulti);
                    mReq.CookieContainer = _iservCookies;
                    mReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
                    mReq.Timeout = 15000;
                    using (HttpWebResponse mResp = (HttpWebResponse)mReq.GetResponse())
                    using (StreamReader sr = new StreamReader(mResp.GetResponseStream(), Encoding.UTF8))
                    {
                        contentMulti = sr.ReadToEnd().Trim();
                    }
                }
                catch { }

                SendJsonResponse(resp, 200, string.Format("{{\"success\":true,\"upcoming\":{0},\"events\":{1}}}", 
                    contentUpcoming.StartsWith("[") || contentUpcoming.StartsWith("{") ? contentUpcoming : "[]", 
                    contentMulti.StartsWith("[") || contentMulti.StartsWith("{") ? contentMulti : "[]"));
            }
            catch (Exception ex)
            {
                SendJsonResponse(resp, 500, string.Format("{{\"success\":false,\"error\":\"{0}\"}}", EscapeJsonString(ex.Message)));
            }
        }

        private static void HandleIServExercises(HttpListenerRequest req, HttpListenerResponse resp)
        {
            if (!_iservLoggedIn)
            {
                string err;
                if (!EnsureIServLogin(_iservHost, _iservUser, _iservPass, out err))
                {
                    SendJsonResponse(resp, 401, string.Format("{{\"success\":false,\"error\":\"{0}\"}}", EscapeJsonString(err)));
                    return;
                }
            }

            try
            {
                string url = "https://" + _iservHost + "/iserv/exercise";
                HttpWebRequest exReq = (HttpWebRequest)WebRequest.Create(url);
                exReq.CookieContainer = _iservCookies;
                exReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
                exReq.Timeout = 15000;

                string html;
                using (HttpWebResponse exResp = (HttpWebResponse)exReq.GetResponse())
                using (StreamReader sr = new StreamReader(exResp.GetResponseStream(), Encoding.UTF8))
                {
                    html = sr.ReadToEnd();
                }

                Match mPhp = Regex.Match(html, "<script[^>]*id=[\"']php-data[\"'][^>]*>([\\s\\S]*?)</script>", RegexOptions.IgnoreCase);
                if (mPhp.Success)
                {
                    string jsonData = mPhp.Groups[1].Value.Trim();
                    SendJsonResponse(resp, 200, string.Format("{{\"success\":true,\"data\":{0}}}", jsonData));
                    return;
                }

                StringBuilder jsonList = new StringBuilder("[");
                int count = 0;
                MatchCollection rows = Regex.Matches(html, "<tr[^>]*>([\\s\\S]*?)</tr>", RegexOptions.IgnoreCase);
                foreach (Match row in rows)
                {
                    string rText = row.Groups[1].Value;
                    if (rText.Contains("<th")) continue;
                    MatchCollection cols = Regex.Matches(rText, "<td[^>]*>([\\s\\S]*?)</td>", RegexOptions.IgnoreCase);
                    if (cols.Count >= 3)
                    {
                        string c0 = StripHtml(cols[0].Groups[1].Value).Trim();
                        string c1 = StripHtml(cols[1].Groups[1].Value).Trim();
                        string c2 = StripHtml(cols[2].Groups[1].Value).Trim();
                        string c3 = cols.Count >= 4 ? StripHtml(cols[3].Groups[1].Value).Trim() : "";
                        string c4 = cols.Count >= 5 ? StripHtml(cols[4].Groups[1].Value).Trim() : "";

                        Match mLink = Regex.Match(rText, "href=[\"']([^\"']+)[\"']");
                        string link = mLink.Success ? mLink.Groups[1].Value : "";

                        if (count > 0) jsonList.Append(",");
                        jsonList.AppendFormat("{{\"id\":\"ex-{0}\",\"title\":\"{1}\",\"subject\":\"{2}\",\"start\":\"{3}\",\"end\":\"{4}\",\"status\":\"{5}\",\"link\":\"{6}\"}}",
                            count + 1, EscapeJsonString(c0), EscapeJsonString(c1), EscapeJsonString(c2), EscapeJsonString(c3), EscapeJsonString(c4), EscapeJsonString(link));
                        count++;
                    }
                }
                jsonList.Append("]");
                SendJsonResponse(resp, 200, string.Format("{{\"success\":true,\"exercises\":{0}}}", jsonList.ToString()));
            }
            catch (Exception ex)
            {
                SendJsonResponse(resp, 500, string.Format("{{\"success\":false,\"error\":\"{0}\"}}", EscapeJsonString(ex.Message)));
            }
        }

        private static void SendJsonResponse(HttpListenerResponse resp, int statusCode, string json)
        {
            try
            {
                resp.StatusCode = statusCode;
                resp.ContentType = "application/json; charset=utf-8";
                resp.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
                byte[] b = Encoding.UTF8.GetBytes(json);
                resp.ContentLength64 = b.Length;
                resp.OutputStream.Write(b, 0, b.Length);
                resp.OutputStream.Flush();
                resp.Close();
            }
            catch { }
        }

        private static string StripHtml(string html)
        {
            if (string.IsNullOrEmpty(html)) return "";
            return Regex.Replace(html, "<[^>]+>", " ").Replace("&nbsp;", " ").Replace("&amp;", "&").Trim();
        }
        #endregion


        private static string EscapeJsonString(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\")
                    .Replace("\"", "\\\"")
                    .Replace("\r", "\\r")
                    .Replace("\n", "\\n")
                    .Replace("\t", "\\t");
        }
    }

    public class TimeoutWebClient : WebClient
    {
        private readonly int _timeoutMs;

        public TimeoutWebClient(int timeoutMs = 8000)
        {
            _timeoutMs = timeoutMs;
        }

        protected override WebRequest GetWebRequest(Uri uri)
        {
            WebRequest w = base.GetWebRequest(uri);
            w.Timeout = _timeoutMs;
            HttpWebRequest hw = w as HttpWebRequest;
            if (hw != null)
            {
                hw.ReadWriteTimeout = _timeoutMs;
            }
            return w;
        }
    }
}
