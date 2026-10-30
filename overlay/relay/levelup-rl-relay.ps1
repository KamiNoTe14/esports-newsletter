<#
  LevelUP Rocket League relay
  ---------------------------
  Rocket League's official Stats API sends live match data over a plain TCP socket (port 49123 by default).
  OBS browser sources can't open plain TCP sockets, only WebSockets, so this small script sits in the middle:
  it reads the game's data and passes it, unchanged, to the score bug on ws://localhost:49124.

  Run it on the PC that runs Rocket League (double-click "Start LevelUP Relay.bat" next to this file).
  Leave the window open while streaming. Nothing leaves this PC: it only listens on localhost.

  It also checks the Stats API setting file and offers to create it if it's missing.

  Highlight clips (optional): with OBS's Replay Buffer on and OBS's WebSocket server turned on, every goal and epic
  save is saved as a clip a few seconds after it happens, into "LevelUP Highlights" on the desktop, named after the
  play ("7-14 PM Goal - TRE4TY.mkv"). The OBS password is asked once and kept encrypted for this Windows user in
  levelup-obs.dat next to this script. "Set up highlight clips.bat" asks again.
#>
param(
  [int]$GamePort = 49123,      # Port= in TAStatsAPI.ini
  [int]$WebPort  = 49124,      # what the score bug connects to (?feed=localhost:49124)
  [int]$SendRate = 30,         # PacketSendRate written to the ini if we create it
  [int]$ObsPort  = 4455,       # OBS: Tools > WebSocket Server Settings
  [string]$ObsPassword = "",   # normally asked once and saved (encrypted) in levelup-obs.dat
  [double]$ClipDelay = 4,      # seconds after the play before the clip is saved (keeps the celebration in)
  [string]$ClipEvents = "Goal,EpicSave",   # also possible: Save, Demolish, Assist, AerialGoal, BicycleGoal, LongGoal ...
  [string]$ClipFolder = "",    # default: Desktop\LevelUP Highlights
  [switch]$SetupClips          # ask for the OBS password again
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

function SendText($r, [string]$text, [string]$type){ $b = [System.Text.Encoding]::UTF8.GetBytes($text); $r.ContentType = $type; $r.ContentLength64 = $b.Length; $r.OutputStream.Write($b, 0, $b.Length) }
function ServeHttp($ctx){
  $r = $ctx.Response; $path = $ctx.Request.Url.AbsolutePath
  if ($path -eq "/clips"){
    $list = @($clips | ForEach-Object { [ordered]@{id = $_.id; label = $_.label; game = $_.game; at = $_.at; url = "/clip/$($_.id)$([IO.Path]::GetExtension($_.path))"} })
    $r.AddHeader("Cache-Control", "no-store"); SendText $r (ConvertTo-Json -Compress -Depth 4 @{game = $gameNo; clips = $list}) "application/json"; return
  }
  if ($path -match "^/clip/([0-9a-f]{12})"){
    $c = $clips | Where-Object { $_.id -eq $Matches[1] } | Select-Object -First 1
    if (-not $c -or -not (Test-Path -LiteralPath $c.path)){ $r.StatusCode = 404; return }
    $ext = [IO.Path]::GetExtension($c.path).ToLower()
    $r.ContentType = @{".mp4" = "video/mp4"; ".mov" = "video/quicktime"; ".mkv" = "video/x-matroska"; ".webm" = "video/webm"}[$ext]; if (-not $r.ContentType){ $r.ContentType = "application/octet-stream" }
    $fs = [IO.File]::Open($c.path, "Open", "Read", "ReadWrite")
    try {
      $len = $fs.Length; $from = 0; $to = $len - 1
      $r.AddHeader("Accept-Ranges", "bytes")
      if ($ctx.Request.Headers["Range"] -match "bytes=(\d*)-(\d*)"){
        if ($Matches[1]){ $from = [long]$Matches[1] }; if ($Matches[2]){ $to = [Math]::Min([long]$Matches[2], $len - 1) }
        $r.StatusCode = 206; $r.AddHeader("Content-Range", "bytes $from-$to/$len")
      }
      $r.ContentLength64 = $to - $from + 1; [void]$fs.Seek($from, "Begin")
      $buf = New-Object byte[] 262144; $left = $to - $from + 1
      while ($left -gt 0){ $n = $fs.Read($buf, 0, [Math]::Min($buf.Length, $left)); if ($n -le 0){ break }; $r.OutputStream.Write($buf, 0, $n); $left -= $n }
    } finally { $fs.Close() }
    return
  }
  # Instant replay from the scorekeeper (through the overlays on this PC): save OBS's replay buffer now.
  if ($path -eq "/save"){
    $r.AddHeader("Cache-Control", "no-store"); $id = [string]$ctx.Request.QueryString["id"]; $label = [string]$ctx.Request.QueryString["label"]
    if (-not $label){ $label = "Replay" }; $label = $label.Substring(0, [Math]::Min(60, $label.Length))
    if (-not $clipsOn -or -not $obsReady){ SendText $r '{"ok":false,"why":"OBS clips are not set up or OBS is not connected"}' "application/json"; return }
    if ($id -and $id -eq $script:lastSaveId){ SendText $r '{"ok":true,"repeat":true}' "application/json"; return }
    $script:lastSaveId = $id
    # optional: cut to the replay scene once the clip is saved, and back to the game after a few seconds
    $script:rpScene = [string]$ctx.Request.QueryString["scene"]; $script:rpBack = 0; [void][int]::TryParse([string]$ctx.Request.QueryString["back"], [ref]$script:rpBack)
    $script:rpFrom = ""; $script:rpReturn = $null
    if ($script:rpScene){ ObsRequest "GetCurrentProgramScene" $null }
    $clipNames.Enqueue(@{label = $label; game = $gameNo}); ObsRequest "SaveReplayBuffer" $null; Say "Instant replay: saving the last few seconds." "Cyan"
    SendText $r '{"ok":true}' "application/json"; return
  }
  # POV picker from the scorekeeper: show one player's camera (an OBS source, usually an NDI source per gaming PC).
  # In every scene that has these sources, the one picked is shown and the rest are hidden. A source drawn small
  # (a split-screen window) counts as the left or right window by where it sits; a full-screen one is the main POV.
  if ($path -eq "/pov"){
    $r.AddHeader("Cache-Control", "no-store"); $qs = $ctx.Request.QueryString; $id = [string]$qs["id"]
    if (-not $clipsOn -or -not $obsReady){ SendText $r '{"ok":false,"why":"OBS is not connected (set up highlight clips first)"}' "application/json"; return }
    if ($id -and $id -eq $script:lastPovId){ SendText $r '{"ok":true,"repeat":true}' "application/json"; return }
    $script:lastPovId = $id
    $script:povWant = @{main = [string]$qs["main"]; left = [string]$qs["left"]; right = [string]$qs["right"]; seats = @(([string]$qs["seats"]).Split(",") | Where-Object { $_ })}
    $script:povReqs = @{}; ObsRequest "GetSceneList" $null; $script:povListId = $obsLastId
    Say ("POV: " + ((@("main", "left", "right") | Where-Object { $povWant[$_] } | ForEach-Object { "$_ = $($povWant[$_])" }) -join ", ")) "Cyan"
    SendText $r '{"ok":true}' "application/json"; return
  }
  SendText $r "LevelUP relay is running." "text/plain"
}
function Broadcast([string]$text){
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $seg = New-Object System.ArraySegment[byte] -ArgumentList (,$bytes)
  foreach ($ws in @($clients)){
    if ($ws.State -ne [System.Net.WebSockets.WebSocketState]::Open){ [void]$clients.Remove($ws); Say "Score bug disconnected ($($clients.Count) connected)."; continue }
    try { $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).Wait(2000) | Out-Null }
    catch { [void]$clients.Remove($ws); Say "Score bug disconnected ($($clients.Count) connected)." }
  }
}

# ---------- 2b. highlight clips through OBS ----------
$clipsOn = $false
$obsFile = Join-Path $PSScriptRoot "levelup-obs.dat"
try {
  if ($SetupClips -and (Test-Path $obsFile)){ Remove-Item $obsFile -Force }
  if (-not $ObsPassword -and (Test-Path $obsFile)){
    $raw = (Get-Content $obsFile -Raw).Trim()
    if ($raw -eq "off"){ $ObsPassword = "" } elseif ($raw -eq "nopassword"){ $ObsPassword = ""; $clipsOn = $true }
    else { $ObsPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $raw))); $clipsOn = $true }
  } elseif ($ObsPassword){ $clipsOn = $true }
  elseif (-not (Test-Path $obsFile)){
    Write-Host ""
    Say "Highlight clips: this can save every goal and epic save as a video clip on your desktop." "Cyan"
    Say "  In OBS: Tools > WebSocket Server Settings > Show Connect Info, and copy the Server Password." "Cyan"
    $sec = Read-Host "Paste the OBS WebSocket password here (or type N to skip clips)" -AsSecureString
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    if ($plain -match "^\s*[Nn]\s*$"){ Set-Content $obsFile "off"; Say "Clips skipped. Double-click 'Set up highlight clips.bat' any time to turn them on." "Gray" }
    elseif (-not $plain){ Set-Content $obsFile "nopassword"; $clipsOn = $true }
    else { Set-Content $obsFile (ConvertFrom-SecureString $sec); $ObsPassword = $plain; $clipsOn = $true; Say "Saved. You won't be asked again on this PC." "Green" }
  }
} catch { Say "Couldn't set up highlight clips: $($_.Exception.Message)" "Yellow"; $clipsOn = $false }
if (-not $ClipFolder){ $desk = [Environment]::GetFolderPath("Desktop"); if (-not $desk){ $desk = Join-Path ([string]$env:USERPROFILE + [string]$env:HOME) "Desktop" }; $ClipFolder = Join-Path $desk "LevelUP Highlights" }
$clipKinds = @($ClipEvents -split "," | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ })
$obs = $null; $obsReady = $false; $obsNext = [datetime]::MinValue; $obsRecv = $null; $obsBuf = New-Object byte[] 65536; $obsMsg = New-Object System.Text.StringBuilder
$clips = New-Object System.Collections.ArrayList; $lastSaveId = ""; $lastPovId = ""; $povWant = $null; $povReqs = @{}; $povListId = ""; $obsLastId = ""; $rpScene = ""; $rpBack = 0; $rpFrom = ""; $rpReturn = $null; $gameNo = 1; $lastEnd = [datetime]::MinValue   # clips saved this session, by game (for the Highlights scene)
$obsReq = 0; $pendingClip = $null; $clipNames = New-Object System.Collections.Queue; $obsSaid = $false; $rbWarned = $false
function ObsSend($obj){
  $b = [System.Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress -Depth 6))
  $obs.SendAsync((New-Object System.ArraySegment[byte] -ArgumentList (,$b)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).Wait(3000) | Out-Null
}
function ObsRequest($type, $data){ $script:obsReq++; $script:obsLastId = "lu$($script:obsReq)"; $m = @{op = 6; d = @{requestType = $type; requestId = $script:obsLastId}}; if ($data){ $m.d.requestData = $data }; ObsSend $m }
# one whole message, or $null if none has arrived yet (never waits unless $wait is set)
function ObsPoll([int]$wait = 0){
  $until = (Get-Date).AddMilliseconds($wait)
  while ($true){
    if (-not $script:obsRecv){ $script:obsRecv = $obs.ReceiveAsync((New-Object System.ArraySegment[byte] -ArgumentList (,$obsBuf)), [System.Threading.CancellationToken]::None) }
    if (-not $script:obsRecv.IsCompleted){ if ((Get-Date) -ge $until){ return $null }; Start-Sleep -Milliseconds 10; continue }
    $r = $script:obsRecv.Result; $script:obsRecv = $null
    if ($r.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close){ throw "OBS closed the connection" }
    [void]$obsMsg.Append([System.Text.Encoding]::UTF8.GetString($obsBuf, 0, $r.Count))
    if ($r.EndOfMessage){ $t = $obsMsg.ToString(); [void]$obsMsg.Clear(); return ($t | ConvertFrom-Json) }
  }
}
function ObsConnect {
  $script:obsReady = $false; $script:obsRecv = $null; [void]$obsMsg.Clear()
  try {
    $script:obs = New-Object System.Net.WebSockets.ClientWebSocket
    if (-not $obs.ConnectAsync([Uri]"ws://127.0.0.1:$ObsPort", [System.Threading.CancellationToken]::None).Wait(3000)){ throw "no answer" }
    $hello = ObsPoll 3000; if (-not $hello -or $hello.op -ne 0){ throw "no hello" }
    $ident = @{op = 1; d = @{rpcVersion = 1; eventSubscriptions = 64}}   # 64 = output events (ReplayBufferSaved)
    if ($hello.d.authentication){
      if (-not $ObsPassword){ throw "OBS wants a password. Double-click 'Set up highlight clips.bat' and paste it." }
      $sha = [System.Security.Cryptography.SHA256]::Create()
      $secret = [Convert]::ToBase64String($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($ObsPassword + $hello.d.authentication.salt)))
      $ident.d.authentication = [Convert]::ToBase64String($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($secret + $hello.d.authentication.challenge)))
    }
    ObsSend $ident
    $ok = $null; try { $ok = ObsPoll 3000 } catch {}
    if (-not $ok -or $ok.op -ne 2){ throw "OBS didn't accept the password. Double-click 'Set up highlight clips.bat' and paste it again." }
    $script:obsReady = $true; $script:obsSaid = $false
    Say "Connected to OBS. Highlight clips go to $ClipFolder" "Green"
    ObsRequest "StartReplayBuffer" $null    # already running is fine
  } catch {
    $script:obsReady = $false; try { $obs.Dispose() } catch {}
    if (-not $script:obsSaid){
      if ("$($_.Exception.Message)" -match "password"){ Say "Highlight clips: $($_.Exception.Message)" "Yellow" }
      else { Say "Highlight clips: waiting for OBS (open OBS, and turn on Tools > WebSocket Server Settings > Enable WebSocket server)..." "DarkGray" }
      $script:obsSaid = $true }
    $script:obsNext = (Get-Date).AddSeconds(10)
  }
}
function ObsTick {
  if (-not $clipsOn){ return }
  if (-not $obsReady){ if ((Get-Date) -ge $obsNext){ ObsConnect }; return }
  try {
    while ($m = ObsPoll 0){
      if ($m.op -eq 7 -and $m.d.requestType -eq "StartReplayBuffer" -and -not $m.d.requestStatus.result -and $m.d.requestStatus.code -ne 500 -and -not $rbWarned){
        Say "OBS's Replay Buffer is off, so no clips can be saved. In OBS: Settings > Output > Replay Buffer > tick 'Enable Replay Buffer', then restart this window." "Yellow"; $script:rbWarned = $true }
      if ($m.op -eq 7 -and $m.d.requestType -eq "GetSceneList" -and $m.d.requestId -eq $povListId -and $m.d.requestStatus.result){
        foreach ($sc in @($m.d.responseData.scenes)){ ObsRequest "GetSceneItemList" @{sceneName = $sc.sceneName}; $povReqs[$obsLastId] = [string]$sc.sceneName } }
      if ($m.op -eq 7 -and $m.d.requestType -eq "GetSceneItemList" -and $povWant -and $povReqs.ContainsKey([string]$m.d.requestId)){
        $scene = $povReqs[[string]$m.d.requestId]; $povReqs.Remove([string]$m.d.requestId)
        foreach ($it in @($m.d.responseData.sceneItems)){
          if ($povWant.seats -notcontains [string]$it.sourceName){ continue }
          $t = $it.sceneItemTransform; $w = [double]$t.width; if ($w -le 0){ $w = [double]$t.boundsWidth }
          $side = if ($w -gt 0 -and $w -lt 1300){ if ([double]$t.positionX -lt 900){ "left" } else { "right" } } else { "main" }
          $want = $povWant[$side]; if (-not $want){ continue }
          $on = ([string]$it.sourceName -eq $want)
          if ([bool]$it.sceneItemEnabled -ne $on){ ObsRequest "SetSceneItemEnabled" @{sceneName = $scene; sceneItemId = [int]$it.sceneItemId; sceneItemEnabled = $on} }
        } }
      if ($m.op -eq 7 -and $m.d.requestType -eq "SetSceneItemEnabled" -and -not $m.d.requestStatus.result){ Say "Couldn't switch a POV: $($m.d.requestStatus.comment)" "Yellow" }
      if ($m.op -eq 7 -and $m.d.requestType -eq "GetCurrentProgramScene" -and $m.d.requestStatus.result){ $script:rpFrom = [string]$(if ($m.d.responseData.sceneName){ $m.d.responseData.sceneName } else { $m.d.responseData.currentProgramSceneName }) }
      if ($m.op -eq 7 -and $m.d.requestType -eq "SetCurrentProgramScene" -and -not $m.d.requestStatus.result){ Say "Couldn't switch OBS scenes: $($m.d.requestStatus.comment). Check the scene name in the scorekeeper (On stream) matches OBS exactly." "Yellow" }
      if ($m.op -eq 7 -and $m.d.requestType -eq "SaveReplayBuffer" -and -not $m.d.requestStatus.result){ $script:rpScene = "";  Say "OBS couldn't save the clip: $($m.d.requestStatus.comment)" "Yellow"; if ($clipNames.Count){ [void]$clipNames.Dequeue() } }
      if ($m.op -eq 5 -and $m.d.eventType -eq "ReplayBufferSaved"){
        $src = $m.d.eventData.savedReplayPath; $info = if ($clipNames.Count){ $clipNames.Dequeue() } else { @{label = "Replay"; game = $gameNo} }; $label = $info.label
        try {
          $day = Join-Path $ClipFolder (Get-Date).ToString("yyyy-MM-dd"); New-Item -ItemType Directory -Force -Path $day | Out-Null
          $name = ((Get-Date).ToString("h-mm-ss tt") + " " + $label) -replace '[\\/:*?"<>|]', "_"
          $dest = Join-Path $day ($name + [IO.Path]::GetExtension($src))
          Start-Sleep -Milliseconds 300; Move-Item -LiteralPath $src -Destination $dest -Force
          [void]$clips.Add(@{id = [guid]::NewGuid().ToString("N").Substring(0, 12); path = $dest; label = $label; game = $info.game; at = (Get-Date).ToString("o")})
          Say "Saved clip: $label" "Green"
          RpSwitch
        } catch { Say "Clip saved by OBS at $src (couldn't move it: $($_.Exception.Message))" "Yellow"
          if (Test-Path -LiteralPath $src){ [void]$clips.Add(@{id = [guid]::NewGuid().ToString("N").Substring(0, 12); path = $src; label = $label; game = $info.game; at = (Get-Date).ToString("o")}) }; RpSwitch }
      }
    }
    if ($rpReturn -and (Get-Date) -ge $rpReturn.at){ ObsRequest "SetCurrentProgramScene" @{sceneName = $rpReturn.scene}; Say "Back to $($rpReturn.scene)." "Cyan"; $script:rpReturn = $null }
    if ($pendingClip -and (Get-Date) -ge $pendingClip.due){
      $clipNames.Enqueue(@{label = ($pendingClip.labels -join ", "); game = $pendingClip.game}); $script:pendingClip = $null
      ObsRequest "SaveReplayBuffer" $null
    }
  } catch { Say "Lost the connection to OBS. Retrying..." "Yellow"; $script:obsReady = $false; $script:obsSaid = $false; $script:obsNext = (Get-Date).AddSeconds(5) }
}
# Instant replay asked for a scene: cut to it now that the clip exists, and come back after rpBack seconds.
function RpSwitch {
  if (-not $rpScene){ return }
  ObsRequest "SetCurrentProgramScene" @{sceneName = $rpScene}; Say "Cut to $rpScene." "Cyan"
  if ($rpBack -gt 0 -and $rpFrom -and $rpFrom -ne $rpScene){ $script:rpReturn = @{at = (Get-Date).AddSeconds($rpBack); scene = $rpFrom} }
  $script:rpScene = ""
}
# A play worth clipping. Plays within a few seconds of each other share one clip ("Goal - TRE4TY, Epic Save - Nova").
function QueueClip([string]$label){
  if (-not $clipsOn){ return }
  if ($pendingClip){ if ($pendingClip.labels -notcontains $label){ $pendingClip.labels += $label }; $pendingClip.due = (Get-Date).AddSeconds($ClipDelay); return }
  $script:pendingClip = @{labels = @($label); due = (Get-Date).AddSeconds($ClipDelay); game = $gameNo}
}
# Pull goals and stat-feed plays out of the game's data stream. Each message starts with {"Event"; the last piece may
# still be arriving, so it's kept for next time.
$scan = ""
function ScanPlays([string]$text){
  $script:scan += $text
  $last = $scan.LastIndexOf('{"Event"'); if ($last -le 0){ if ($scan.Length -gt 2000000){ $script:scan = "" }; return }
  $done = $scan.Substring(0, $last); $script:scan = $scan.Substring($last)
  if ($done.IndexOf("GoalScored") -lt 0 -and $done.IndexOf("StatfeedEvent") -lt 0 -and $done.IndexOf("MatchEnded") -lt 0){ return }
  foreach ($seg in ($done -split '(?=\{"Event")')){
    if ($seg -match '^\{"Event"\s*:\s*"MatchEnded"'){   # the next game's clips go in a new group
      if (((Get-Date) - $script:lastEnd).TotalSeconds -gt 30){ $script:gameNo++; $script:lastEnd = Get-Date }
    } elseif ($seg -match '^\{"Event"\s*:\s*"GoalScored"'){
      $who = if ($seg -match 'Scorer\\?"\s*:\s*\{\\?"Name\\?"\s*:\s*\\?"((?:[^"\\]|\\[^"])*)\\?"'){ $Matches[1] } else { "" }
      if ($clipKinds -contains "goal"){ QueueClip ("Goal" + $(if ($who){ " - $who" } else { "" })) }
    } elseif ($seg -match '^\{"Event"\s*:\s*"StatfeedEvent"'){
      $kind = if ($seg -match 'EventName\\?"\s*:\s*\\?"([A-Za-z]+)'){ $Matches[1] } else { "" }
      $who = if ($seg -match 'MainTarget\\?"\s*:\s*\{\\?"Name\\?"\s*:\s*\\?"((?:[^"\\]|\\[^"])*)\\?"'){ $Matches[1] } else { "" }
      if ($kind -and $kind -ne "Goal" -and $clipKinds -contains $kind.ToLower()){ QueueClip (($kind -creplace '([a-z])([A-Z])', '$1 $2') + $(if ($who){ " - $who" } else { "" })) }
    }
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
        # plain requests: the score bug's permission check, and the Highlights scene's clip list and videos
        $r = $ctx.Response
        $r.AddHeader("Access-Control-Allow-Origin", "*")
        $r.AddHeader("Access-Control-Allow-Private-Network", "true")
        $r.AddHeader("Access-Control-Allow-Headers", "*")
        try { ServeHttp $ctx } catch { try { $r.StatusCode = 500 } catch {} }
        try { $r.Close() } catch {}
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
          if ($c -gt 0){ $txt = New-Object string -ArgumentList $chars, 0, $c; Broadcast $txt; $chunks++; if ($clipsOn){ ScanPlays $txt } }
        }
      } elseif ($tcp.Client.Poll(0, [System.Net.Sockets.SelectMode]::SelectRead) -and $tcp.Client.Available -eq 0){ $closed = $true }
      else { Start-Sleep -Milliseconds 4 }
    } catch { $closed = $true }
    if ($closed){ try { $tcp.Close() } catch {}; $tcp = $null; Say "Rocket League closed the connection (match over or game closed). Waiting..." "Yellow"; $nextTry = (Get-Date).AddSeconds(2) }
  }
  if (-not $tcp){ Start-Sleep -Milliseconds 20 }
  ObsTick

  # a short heartbeat line every 30 seconds so it's obvious it's alive
  if (((Get-Date) - $lastBeat).TotalSeconds -ge 30){
    $lastBeat = Get-Date
    Say ("Game: {0} | score bugs connected: {1} | data packets passed on: {2}" -f $(if ($tcp){"connected"}else{"waiting"}), $clients.Count, $chunks) "DarkGray"
  }
}
