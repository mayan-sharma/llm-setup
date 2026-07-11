[CmdletBinding()]
param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$payload = Join-Path $repo 'home'
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $repo ".bootstrap-backups\$stamp"
$changed = 0
$backedUp = 0

function Install-TrackedFile([string]$source, [string]$relative) {
    $destination = Join-Path $codexHome $relative
    if (Test-Path -LiteralPath $destination -PathType Leaf) {
        $same = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash -eq (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash
        if ($same) { Write-Host "ok       $relative"; return }
        $backup = Join-Path $backupRoot $relative
        Write-Host "backup   $relative"
        if (-not $DryRun) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
            Copy-Item -LiteralPath $destination -Destination $backup
        }
        $script:backedUp++
    }
    Write-Host "install  $relative"
    if (-not $DryRun) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Force
    }
    $script:changed++
}

Write-Host "CODEX_HOME: $codexHome"
Get-ChildItem -LiteralPath $payload -File -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($payload.Length).TrimStart('\','/')
    Install-TrackedFile $_.FullName $relative
}

foreach ($tool in @('checkpoint.mjs','local-llm.mjs','route-task.mjs','codex-sync.mjs')) {
    Install-TrackedFile (Join-Path $PSScriptRoot $tool) (Join-Path 'bootstrap-tools' $tool)
}

if (-not $DryRun) {
    $metadata = @{ repository = $repo; installed_at = (Get-Date).ToString('o'); version = 1 } | ConvertTo-Json
    $metadataPath = Join-Path $codexHome 'bootstrap-source.json'
    Set-Content -LiteralPath $metadataPath -Value $metadata -Encoding UTF8
}
Write-Host "Done: $changed installed, $backedUp backed up. Restart Codex to reload the environment."
