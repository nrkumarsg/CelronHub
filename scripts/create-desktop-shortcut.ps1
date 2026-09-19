# Create CelronHub Desktop Launchpad Windows Shortcut
param(
    [string]$TargetUrl = "https://celronhub.vercel.app/launchpad"
)

$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "CelronHub Launchpad.lnk"

# Project root and icon location
$projectRoot = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $projectRoot "public\celronhub.ico"

# If celronhub.ico does not exist yet, generate it
if (-not (Test-Path $iconPath)) {
    & (Join-Path $PSScriptRoot "generate-ico.ps1")
}

# Look for Chrome or Edge to run in sleek standalone app mode
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$edgePaths = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)

$browserExe = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $browserExe = $path
        break
    }
}

if (-not $browserExe) {
    foreach ($path in $edgePaths) {
        if (Test-Path $path) {
            $browserExe = $path
            break
        }
    }
}

$wscriptShell = New-Object -ComObject WScript.Shell
$shortcut = $wscriptShell.CreateShortcut($shortcutPath)

if ($browserExe) {
    $shortcut.TargetPath = $browserExe
    $shortcut.Arguments = "--app=""$TargetUrl"""
} else {
    # Fallback to direct URL
    $shortcut.TargetPath = $TargetUrl
}

$shortcut.Description = "CelronHub Executive Desktop Launchpad"
$shortcut.WorkingDirectory = $projectRoot
if (Test-Path $iconPath) {
    $shortcut.IconLocation = "$iconPath,0"
}

$shortcut.Save()

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  SUCCESS: CelronHub Desktop Shortcut Created!" -ForegroundColor Green
Write-Host "  Path: $shortcutPath" -ForegroundColor Yellow
Write-Host "  Target: $TargetUrl" -ForegroundColor Gray
Write-Host "  Icon: $iconPath" -ForegroundColor Gray
Write-Host "====================================================" -ForegroundColor Cyan
