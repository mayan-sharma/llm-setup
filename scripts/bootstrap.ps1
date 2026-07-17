# Thin wrapper: the real multi-harness installer is scripts/install.mjs (Node,
# cross-platform). This preserves the historical `bootstrap.ps1 [-DryRun]` entry point.
[CmdletBinding()]
param([switch]$DryRun, [switch]$All)

$ErrorActionPreference = 'Stop'
$installer = Join-Path $PSScriptRoot 'install.mjs'

$passArgs = @()
if ($DryRun) { $passArgs += '--dry-run' }
if ($All) { $passArgs += '--all' }

& node $installer @passArgs
exit $LASTEXITCODE
