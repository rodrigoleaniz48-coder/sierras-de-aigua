# scripts/sql.ps1 — helper para consultar la Management API de Supabase
#
# Uso:
#   powershell -File scripts/sql.ps1 "select count(*) from ventas;"
#   powershell -File scripts/sql.ps1 -File "path/to/migracion.sql"
#
# El token se lee de (en orden de precedencia):
#   1. $env:SUPABASE_MGMT_TOKEN
#   2. .claude/supabase.token  (archivo gitignored)
#
# El project ref y URL están hardcodeados abajo.

param(
  [Parameter(Position = 0)]
  [string]$Query,
  [string]$File
)

$ErrorActionPreference = "Stop"

$projectRef = "ogtssmliiftxaieectny"
$apiUrl = "https://api.supabase.com/v1/projects/$projectRef/database/query"

# Cargar token
$token = $env:SUPABASE_MGMT_TOKEN
if (-not $token) {
  $tokenFile = Join-Path $PSScriptRoot "..\.claude\supabase.token"
  if (Test-Path $tokenFile) {
    $token = (Get-Content -Raw -Path $tokenFile).Trim()
  }
}
if (-not $token) {
  Write-Host "ERROR: token de Supabase no encontrado." -ForegroundColor Red
  Write-Host "Setealo con una de estas dos opciones:"
  Write-Host "  1. `$env:SUPABASE_MGMT_TOKEN = 'sbp_xxx'"
  Write-Host "  2. Guardarlo en .claude/supabase.token (una linea)"
  exit 1
}

# Determinar el SQL a mandar
if ($File) {
  if (-not (Test-Path $File)) { Write-Host "ERROR: archivo '$File' no existe." -ForegroundColor Red; exit 1 }
  $sql = [System.IO.File]::ReadAllText((Resolve-Path $File))
} elseif ($Query) {
  $sql = $Query
} else {
  Write-Host "Uso: scripts/sql.ps1 `"<query>`"  |  scripts/sql.ps1 -File path.sql" -ForegroundColor Yellow
  exit 1
}

# Preparar body JSON (UTF-8 sin BOM para que Supabase no reciba mojibake)
$obj = New-Object PSObject
$obj | Add-Member -MemberType NoteProperty -Name "query" -Value $sql
$body = $obj | ConvertTo-Json -Compress

$tmp = Join-Path $env:TEMP ("supabase-sql-" + [guid]::NewGuid().ToString() + ".json")
try {
  [System.IO.File]::WriteAllText($tmp, $body, [System.Text.UTF8Encoding]::new($false))
  curl.exe -s -X POST $apiUrl `
    -H "Authorization: Bearer $token" `
    -H "Content-Type: application/json" `
    --data-binary "@$tmp"
  Write-Host ""
} finally {
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
}
