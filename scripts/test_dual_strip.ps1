Add-Type -AssemblyName System.Drawing

# Create a sample 600x1800 strip with 4 photo slots
$stripW = 600
$stripH = 1800
$stripBmp = New-Object System.Drawing.Bitmap($stripW, $stripH)
$g1 = [System.Drawing.Graphics]::FromImage($stripBmp)
$g1.Clear([System.Drawing.Color]::White)

$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(230, 217, 207), 3)
$photoBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 220, 240))
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(53, 28, 21))
$font = New-Object System.Drawing.Font("Arial", 24, [System.Drawing.FontStyle]::Bold)
$footerFont = New-Object System.Drawing.Font("Arial", 16, [System.Drawing.FontStyle]::Bold)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center

# 4 photo slots
$slots = @(40, 448, 855, 1263)
for ($i = 0; $i -lt 4; $i++) {
    $y = $slots[$i]
    $g1.FillRectangle($photoBrush, 36, $y, 528, 388)
    $g1.DrawRectangle($pen, 36, $y, 528, 388)
    $g1.DrawString("Photo $($i + 1)", $font, $textBrush, ($stripW / 2), ($y + 194), $format)
}

$g1.DrawString("FOTOLISM PHOTOBOOTH", $footerFont, $textBrush, ($stripW / 2), 1720, $format)
$g1.Dispose()

# Now combine into 4x6 (1200 x 1800 px) - 2 strips side-by-side
$finalW = 1200
$finalH = 1800
$finalBmp = New-Object System.Drawing.Bitmap($finalW, $finalH)
$g2 = [System.Drawing.Graphics]::FromImage($finalBmp)
$g2.Clear([System.Drawing.Color]::White)

# Strip 1: Left (0 to 600)
$g2.DrawImage($stripBmp, 0, 0, 600, 1800)

# Strip 2: Right (600 to 1200)
$g2.DrawImage($stripBmp, 600, 0, 600, 1800)

# Center cutting guideline (subtle dashed line or separator)
$cutPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 180, 180, 180), 1)
$cutPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
$g2.DrawLine($cutPen, 600, 0, 600, 1800)

$outPath = "C:\Users\ADMIN\.gemini\antigravity\brain\b2b8665b-ac83-4256-ac38-a098a30c7e1a\dual_strip_test.jpg"
$finalBmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)

$g2.Dispose()
$stripBmp.Dispose()
$finalBmp.Dispose()
Write-Host "Created:" $outPath

