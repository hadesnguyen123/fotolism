Add-Type -AssemblyName System.Drawing
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = 'DS-RX1'
Write-Host "DefaultPageSettings.Landscape:" $doc.DefaultPageSettings.Landscape
Write-Host "PrinterSettings.DefaultPageSettings.Landscape:" $doc.PrinterSettings.DefaultPageSettings.Landscape

