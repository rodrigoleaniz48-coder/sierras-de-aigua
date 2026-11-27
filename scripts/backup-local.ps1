# scripts/backup-local.ps1 — backup local de toda la base a CSV (una por tabla), comprimido.
#
# Vuelca cada tabla de la base a un .csv, los mete en un .zip con la fecha, y
# deja solo los ULTIMOS 7 zips en la carpeta destino (los mas viejos se borran solos).
#
# Reusa el mismo token de la Management API que scripts/sql.ps1 (no agrega claves nuevas):
#   1. $env:SUPABASE_MGMT_TOKEN   2. .claude/supabase.token
#
# Uso manual:
#   powershell -ExecutionPolicy Bypass -File scripts/backup-local.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/backup-local.ps1 -OutDir "D:\OtraCarpeta"
#
# Se corre solo cada lunes via Tarea Programada (ver scripts/backup-setup.ps1).

param(
  [string]$OutDir = "C:\Backups\Sierras",
  [int]$Conservar = 7
)

$ErrorActionPreference = "Stop"
$projectRef = "ogtssmliiftxaieectny"
$apiUrl = "https://api.supabase.com/v1/projects/$projectRef/database/query"

# --- Token (mismo esquema que sql.ps1) ---
$token = $env:SUPABASE_MGMT_TOKEN
if (-not $token) {
  $tokenFile = Join-Path $PSScriptRoot "..\.claude\supabase.token"
  if (Test-Path $tokenFile) { $token = (Get-Content -Raw -Path $tokenFile).Trim() }
}
if (-not $token) {
  Write-Host "ERROR: token de Supabase no encontrado (.claude/supabase.token o `$env:SUPABASE_MGMT_TOKEN)." -ForegroundColor Red
  exit 1
}
$headers = @{ Authorization = "Bearer $token" }

function Invoke-Sql([string]$sql) {
  $json = (@{ query = $sql } | ConvertTo-Json -Compress)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Method Post -Uri $apiUrl -Headers $headers -ContentType 'application/json' -Body $bytes
}

# --- Lista de tablas ---
Write-Host "Listando tablas..." -ForegroundColor Cyan
$tablas = (Invoke-Sql "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name") |
  ForEach-Object { $_.table_name }
if (-not $tablas -or $tablas.Count -eq 0) { Write-Host "ERROR: no se obtuvieron tablas." -ForegroundColor Red; exit 1 }

# --- Carpeta temporal para los CSV ---
$fecha = Get-Date -Format "yyyy-MM-dd"
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$tmpDir = Join-Path $env:TEMP ("sierras-backup-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

$resumen = @("Backup Sierras de Aigua", "Generado: $stamp", "Tablas: $($tablas.Count)", "")
$totalFilas = 0

foreach ($t in $tablas) {
  try {
    $rows = Invoke-Sql ("select * from public.""" + $t + """")
  } catch {
    Write-Host ("  ! " + $t + " (error: " + $_.Exception.Message + ")") -ForegroundColor Yellow
    $resumen += ("{0,-34} ERROR" -f $t)
    continue
  }
  $csvPath = Join-Path $tmpDir ($t + ".csv")
  if (-not $rows) {
    Set-Content -Path $csvPath -Value "(sin filas)" -Encoding UTF8
    $resumen += ("{0,-34} {1,8}" -f $t, 0)
    continue
  }
  # Normalizar: nulos -> "", objetos/arrays -> JSON compacto, escalares tal cual.
  $clean = $rows | ForEach-Object {
    $o = [ordered]@{}
    foreach ($p in $_.PSObject.Properties) {
      $v = $p.Value
      if ($null -eq $v) { $o[$p.Name] = '' }
      elseif ($v -is [string] -or $v -is [bool] -or $v -is [int] -or $v -is [long] -or $v -is [double] -or $v -is [decimal]) { $o[$p.Name] = $v }
      else { $o[$p.Name] = ($v | ConvertTo-Json -Compress -Depth 10) }
    }
    [pscustomobject]$o
  }
  $clean | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
  $n = @($rows).Count
  $totalFilas += $n
  $resumen += ("{0,-34} {1,8}" -f $t, $n)
}

$resumen += @("", "Total filas: $totalFilas")
Set-Content -Path (Join-Path $tmpDir "_resumen.txt") -Value $resumen -Encoding UTF8

# --- Comprimir a OutDir ---
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$zipPath = Join-Path $OutDir ("sierras-" + $fecha + ".zip")
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tmpDir, $zipPath)
Remove-Item $tmpDir -Recurse -Force

# --- Rotacion: dejar solo los ultimos N ---
$viejos = Get-ChildItem -Path $OutDir -Filter 'sierras-*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Conservar
foreach ($f in $viejos) { Remove-Item $f.FullName -Force }

$sizeKb = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Host ("OK: " + $zipPath + "  (" + $totalFilas + " filas, " + $sizeKb + " KB)") -ForegroundColor Green
Write-Host ("Conservados: " + (@(Get-ChildItem -Path $OutDir -Filter 'sierras-*.zip').Count) + " de " + $Conservar) -ForegroundColor Cyan
