Add-Type -AssemblyName System.Drawing
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = 'DS-RX1'
$doc.DefaultPageSettings.Landscape = $false
Write-Host "Landscape:" $doc.DefaultPageSettings.Landscape
Write-Host "Bounds:" $doc.DefaultPageSettings.Bounds
