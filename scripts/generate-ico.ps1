Add-Type -AssemblyName System.Drawing

$sourcePng = Join-Path $PSScriptRoot "..\public\icon-512.png"
$targetIco = Join-Path $PSScriptRoot "..\public\celronhub.ico"

if (-not (Test-Path $sourcePng)) {
    Write-Error "Source PNG not found at $sourcePng"
    exit 1
}

$bmp = [System.Drawing.Bitmap]::FromFile($sourcePng)
$thumb = New-Object System.Drawing.Bitmap $bmp, 256, 256
$iconHandle = $thumb.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$fs = New-Object System.IO.FileStream($targetIco, [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$thumb.Dispose()
$bmp.Dispose()

Write-Host "Generated $targetIco successfully!"
