param([string]$ElectronDist = $env:ELECTRON_DIST, [switch]$Launch)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Renderer build failed.' }
    $exe = [IO.Path]::GetFullPath((Join-Path $projectRoot 'release/win-unpacked/续作.exe'))
    $running = @(Get-Process -Name '续作' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })
    $reopen = $Launch -or $running.Count -gt 0
    if ($running.Count -gt 0) {
        $exitRequest = Start-Process -FilePath $exe -ArgumentList '--quit-for-update' -WindowStyle Hidden -PassThru
        $null = $exitRequest.WaitForExit(3000)
        $running = @(Get-Process -Name '续作' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })
    }
    foreach ($process in $running | Where-Object { $_.MainWindowHandle -ne 0 }) {
        if (-not $process.CloseMainWindow()) { throw 'Could not close the running 续作 window.' }
    }
    for ($i = 0; $i -lt 60; $i++) {
        $remaining = @(Get-Process -Name '续作' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })
        if ($remaining.Count -eq 0) { break }
        Start-Sleep -Milliseconds 150
    }
    if ($remaining.Count -gt 0) { throw 'The previous app is still running.' }
    $builderArguments = @('--win', 'nsis', '--x64')
    if ($ElectronDist) {
        $runtime = (Resolve-Path -LiteralPath $ElectronDist).Path
        if (-not (Test-Path -LiteralPath (Join-Path $runtime 'electron.exe'))) { throw 'Electron runtime is missing electron.exe.' }
        $builderArguments += "--config.electronDist=$runtime"
    }
    & ./node_modules/.bin/electron-builder.cmd @builderArguments
    if ($LASTEXITCODE -ne 0) { throw 'Windows packaging failed.' }
    node -e "const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),asar=require('@electron/asar'),a='release/win-unpacked/resources/app.asar';assert.equal(JSON.parse(asar.extractFile(a,'package.json')).version,JSON.parse(fs.readFileSync('package.json')).version);for(const f of fs.readdirSync('dist/assets')){const p=path.join('dist','assets',f);assert.deepEqual(asar.extractFile(a,p),fs.readFileSync(p));}console.log('Verified release package.');"
    if ($LASTEXITCODE -ne 0) { throw 'Packaged files did not match the current build.' }
    if ($reopen) {
        $app = Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) -PassThru
        $null = $app.WaitForInputIdle(8000)
        if ($app.HasExited) { throw 'The packaged app did not stay open.' }
    }
} finally { Pop-Location }
