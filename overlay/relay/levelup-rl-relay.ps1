<#
  LevelUP Rocket League relay
  ---------------------------
  Rocket League's official Stats API sends live match data over a plain TCP socket (port 49123 by default).
  OBS browser sources can't open plain TCP sockets, only WebSockets, so this small script sits in the middle:
  it reads the game's data and passes it, unchanged, to the score bug on ws://localhost:49124.

  Run it on the PC that runs Rocket League (double-click "Start LevelUP Relay.bat" next to this file).
  Leave the window open while streaming. Nothing leaves this PC: it only listens on localhost.

  It also checks the Stats API setting file and offers to create it if it's missing.
#>
param(
  [int]$GamePort = 49123,      # Port= in TAStatsAPI.ini
  [int]$WebPort  = 49124,      # what the score bug connects to (?feed=localhost:49124)
  [int]$SendRate = 30          # PacketSendRate written to the ini if we create it
)
$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "LevelUP Rocket League relay"
function Say($msg, $color = "Gray"){ Write-Host ("[{0}] {1}" -f (Get-Date).ToString("HH:mm:ss"), $msg) -ForegroundColor $color }

# ---------- 1. the Stats API setting file ----------
$docs = [Environment]::GetFolderPath("MyDocuments")
if (-not $docs){ $docs = Join-Path ([string]$env:USERPROFILE + [string]$env:HOME) "Documents" }
try {
$cfgDir = Join-Path $docs "My Games\Rocket League\TAGame\Config"
$cfg = Join-Path $cfgDir "TAStatsAPI.ini"
if (Test-Path $cfg){
  $text = Get-Content $cfg -Raw
  $rate = if ($text -match "(?im)^\s*PacketSendRate\s*=\s*([\d.]+)") { [double]$Matches[1] } else { 0 }
  $port = if ($text -match "(?im)^\s*Port\s*=\s*(\d+)") { [int]$Matches[1] } else { 49123 }
  if ($rate -le 0){ Say "TAStatsAPI.ini has PacketSendRate=0, so the Stats API is OFF. Set it to $SendRate and restart Rocket League." "Yellow" }
  else { Say "Stats API is on ($rate updates/sec, port $port)." "Green" }
  if ($port -ne $GamePort){ Say "Using port $port from TAStatsAPI.ini." "Gray"; $GamePort = $port }
} elseif (Test-Path (Split-Path $cfgDir)) {
  Say "No TAStatsAPI.ini found, so the Stats API is probably off." "Yellow"
  $ans = Read-Host "Create it now at $cfg ? (Y/N)"
  if ($ans -match "^[Yy]"){
    New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
    Set-Content -Path $cfg -Encoding ASCII -Value "[TAGame.MatchStatsExporter_TA]`r`nPort=$GamePort`r`nPacketSendRate=$SendRate"
    Say "Created. RESTART Rocket League so it reads the new setting." "Green"
  }
} else {
  Say "Couldn't find $cfgDir. If Rocket League keeps its settings somewhere else, put TAStatsAPI.ini there:" "Yellow"
  Say "  [TAGame.MatchStatsExporter_TA]  /  Port=$GamePort  /  PacketSendRate=$SendRate" "Yellow"
}
} catch { Say "Couldn't check the Stats API setting file: $($_.Exception.Message)" "Yellow" }

# ---------- 1b. the copy in Rocket League's install folder (Psyonix's instructions name this one) ----------
try {
  $roots = New-Object System.Collections.ArrayList
  # the running game tells us exactly where it lives: <install>\Binaries\Win64\RocketLeague.exe
  Get-Process -Name RocketLeague -ErrorAction SilentlyContinue | ForEach-Object { if ($_.Path){ [void]$roots.Add((Split-Path (Split-Path (Split-Path $_.Path)))) } }
  # Epic Games launcher records each game's install folder in its manifests (Rocket League's Epic name is "Sugar")
  $man = Join-Path $env:ProgramData "Epic\EpicGamesLauncher\Data\Manifests"
  if ($env:ProgramData -and (Test-Path $man)){
    Get-ChildItem $man -Filter *.item -ErrorAction SilentlyContinue | ForEach-Object {
      try { $j = Get-Content $_.FullName -Raw | ConvertFrom-Json; if ($j.DisplayName -match "Rocket League" -or $j.AppName -eq "Sugar"){ [void]$roots.Add($j.InstallLocation) } } catch {} }
  }
  foreach ($p in @("C:\Program Files\Epic Games\rocketleague", "C:\Program Files (x86)\Steam\steamapps\common\rocketleague")){ if (Test-Path $p){ [void]$roots.Add($p) } }
  $seen = @{}
  foreach ($root in $roots){
    if (-not $root -or $seen[$root]){ continue }; $seen[$root] = $true
    $ini = Join-Path $root "TAGame\Config\DefaultStatsAPI.ini"
    if (-not (Test-Path $ini)){ continue }
    Say "Found Rocket League at $root" "Gray"
    $text = Get-Content $ini -Raw
    $rate = if ($text -match "(?im)^\s*PacketSendRate\s*=\s*([\d.]+)") { [double]$Matches[1] } else { 0 }
    if ($text -match "(?im)^\s*Port\s*=\s*(\d+)"){ $GamePort = [int]$Matches[1] }
    if ($rate -gt 0){ Say "DefaultStatsAPI.ini: Stats API is ON ($rate updates/sec, port $GamePort)." "Green"; continue }
    Say "DefaultStatsAPI.ini: Stats API is OFF (PacketSendRate=0)." "Yellow"
    $ans = Read-Host "Turn it on now (PacketSendRate=$SendRate)? (Y/N)"
    if ($ans -notmatch "^[Yy]"){ continue }
    if ($text -match "(?im)^\s*PacketSendRate\s*="){ $new = [regex]::Replace($text, "(?im)^(\s*PacketSendRate\s*=\s*)[\d.]+", "`${1}$SendRate") }
    elseif ($text -match "(?im)^\[TAGame\.MatchStatsExporter_TA\]"){ $new = [regex]::Replace($text, "(?im)^(\[TAGame\.MatchStatsExporter_TA\]\s*)", "`${1}PacketSendRate=$SendRate`r`n") }
    else { $new = $text.TrimEnd() + "`r`n`r`n[TAGame.MatchStatsExporter_TA]`r`nPort=$GamePort`r`nPacketSendRate=$SendRate`r`n" }
    try { Copy-Item $ini "$ini.levelup-backup" -Force -ErrorAction SilentlyContinue; Set-Content -Path $ini -Value $new -NoNewline -Encoding ASCII; Say "Turned on. Now CLOSE Rocket League completely and open it again." "Green" }
    catch { Say "Windows wouldn't let me change that file. Close this window, right-click 'Start LevelUP Relay.bat' and choose 'Run as administrator', then answer Y again." "Red" }
  }
  if (-not $seen.Count){ Say "Couldn't find Rocket League's install folder. Start Rocket League first, then reopen this window, and it will find it." "Yellow" }
} catch { Say "Couldn't check the install folder: $($_.Exception.Message)" "Yellow" }

# ---------- 2. the WebSocket side (what the score bug connects to) ----------
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$WebPort/")
$listener.Prefixes.Add("http://127.0.0.1:$WebPort/")
try { $listener.Start() } catch {
  Say "Couldn't open port $WebPort. Is another copy of this relay (or the old SOS relay) already running? $($_.Exception.Message)" "Red"
  Read-Host "Press Enter to close"; exit 1
}
Say "Score bug can connect at ws://localhost:$WebPort" "Cyan"
$clients = New-Object System.Collections.ArrayList
$ctxTask = $listener.GetContextAsync()

function Broadcast([string]$text){
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $seg = New-Object System.ArraySegment[byte] -ArgumentList (,$bytes)
  foreach ($ws in @($clients)){
    if ($ws.State -ne [System.Net.WebSockets.WebSocketState]::Open){ [void]$clients.Remove($ws); Say "Score bug disconnected ($($clients.Count) connected)."; continue }
    try { $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).Wait(2000) | Out-Null }
    catch { [void]$clients.Remove($ws); Say "Score bug disconnected ($($clients.Count) connected)." }
  }
}

# ---------- 3. the game side ----------
$tcp = $null; $stream = $null; $nextTry = [datetime]::MinValue; $waitingSaid = $false
$buf = New-Object byte[] 65536; $chars = New-Object char[] 131072
$decoder = [System.Text.Encoding]::UTF8.GetDecoder()
$lastBeat = Get-Date; $chunks = 0

Say "Waiting for Rocket League (start a match, or spectate one)..." "Gray"
while ($true){
  # new browser connections
  if ($ctxTask.IsCompleted){
    $ctx = $null
    try { $ctx = $ctxTask.Result } catch {}
    $ctxTask = $listener.GetContextAsync()
    if ($ctx){
      if ($ctx.Request.IsWebSocketRequest){
        try { $wsc = $ctx.AcceptWebSocketAsync([NullString]::Value).GetAwaiter().GetResult(); [void]$clients.Add($wsc.WebSocket); Say "Score bug connected ($($clients.Count) connected)." "Green" }
        catch { Say "A browser tried to connect but the WebSocket failed: $($_.Exception.Message)" "Yellow" }
      } else {
        # plain request (the score bug's permission check): answer politely so Chrome/OBS allow the connection
        $r = $ctx.Response
        $r.AddHeader("Access-Control-Allow-Origin", "*")
        $r.AddHeader("Access-Control-Allow-Private-Network", "true")
        $r.AddHeader("Access-Control-Allow-Headers", "*")
        $msg = [System.Text.Encoding]::UTF8.GetBytes("LevelUP Rocket League relay is running.")
        $r.ContentType = "text/plain"; $r.OutputStream.Write($msg, 0, $msg.Length); $r.Close()
      }
    }
  }

  # connect to the game (Rocket League only opens the socket while it's running with the Stats API on)
  if (-not $tcp){
    if ((Get-Date) -ge $nextTry){
      try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", $GamePort); $stream = $tcp.GetStream(); $decoder.Reset()
        Say "Connected to Rocket League on port $GamePort." "Green"; $waitingSaid = $false
      } catch {
        $tcp = $null; $nextTry = (Get-Date).AddSeconds(2)
        if (-not $waitingSaid){ Say "Rocket League isn't sending yet (game closed, or Stats API off). Retrying every 2 seconds..." "DarkGray"; $waitingSaid = $true }
      }
    }
  } else {
    $closed = $false
    try {
      if ($stream.DataAvailable){
        $n = $stream.Read($buf, 0, $buf.Length)
        if ($n -le 0){ $closed = $true }
        else {
          $c = $decoder.GetChars($buf, 0, $n, $chars, 0)
          if ($c -gt 0){ Broadcast (New-Object string -ArgumentList $chars, 0, $c); $chunks++ }
        }
      } elseif ($tcp.Client.Poll(0, [System.Net.Sockets.SelectMode]::SelectRead) -and $tcp.Client.Available -eq 0){ $closed = $true }
      else { Start-Sleep -Milliseconds 4 }
    } catch { $closed = $true }
    if ($closed){ try { $tcp.Close() } catch {}; $tcp = $null; Say "Rocket League closed the connection (match over or game closed). Waiting..." "Yellow"; $nextTry = (Get-Date).AddSeconds(2) }
  }
  if (-not $tcp){ Start-Sleep -Milliseconds 20 }

  # a short heartbeat line every 30 seconds so it's obvious it's alive
  if (((Get-Date) - $lastBeat).TotalSeconds -ge 30){
    $lastBeat = Get-Date
    Say ("Game: {0} | score bugs connected: {1} | data packets passed on: {2}" -f $(if ($tcp){"connected"}else{"waiting"}), $clients.Count, $chunks) "DarkGray"
  }
}
