Add-Type -AssemblyName System.Drawing
$file = Join-Path $env:TEMP "fotolism_print_1793448078291.jpg"
$img = [System.Drawing.Image]::FromFile($file)
Write-Host "Width:" $img.Width "Height:" $img.Height
$img.Dispose()

