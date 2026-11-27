# scripts/backup-setup.ps1 — registra la Tarea Programada de Windows que corre el backup.
#
# Corre el backup cada LUNES a las 08:00 (configurable) y conserva los ultimos 7 zips.
# Se ejecuta solo cuando el usuario esta logueado (no guarda contrasena).
# Si el equipo estaba apagado el lunes, corre apenas se puede (StartWhenAvailable).
#
# Uso (una sola vez):
#   powershell -ExecutionPolicy Bypass -File scripts/backup-setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/backup-setup.ps1 -OutDir "D:\Carpeta" -Hora "07:30"
#
# Para sacarla:  Unregister-ScheduledTask -TaskName "Backup Sierras de Aigua" -Confirm:$false

param(
  [string]$OutDir = "C:\Backups\Sierras",
  [string]$Hora   = "08:00"
)

$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "backup-local.ps1"
if (-not (Test-Path $script)) { Write-Host "ERROR: no encuentro backup-local.ps1" -ForegroundColor Red; exit 1 }

$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -OutDir `"$OutDir`""
$action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg
$trigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At $Hora
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName "Backup Sierras de Aigua" `
  -Action $action -Trigger $trigger -Settings $settings `
  -Description "Backup semanal (lunes $Hora) de la base a $OutDir; conserva 7 zips." -Force | Out-Null

Write-Host "Tarea registrada: 'Backup Sierras de Aigua' - lunes $Hora -> $OutDir" -ForegroundColor Green
