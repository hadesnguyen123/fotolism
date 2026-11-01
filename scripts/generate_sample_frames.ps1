Add-Type -AssemblyName System.Drawing

function Create-PartySparkle2x6 {
    param([string]$outputPath)
    $w = 600
    $h = 1800
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Transparent background
    $g.Clear([System.Drawing.Color]::Transparent)

    # Decorative outer border
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 245, 166, 35), 4)
    $innerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 255, 215, 0), 2)
    $g.DrawRectangle($borderPen, 10, 10, $w - 20, $h - 20)
    $g.DrawRectangle($innerPen, 16, 16, $w - 32, $h - 32)

    # 4 Photo Slots: 36, 40 -> W=528, H=388, Gap=20
    $slotPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 230, 180, 50), 3)
    $slotInnerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(100, 255, 255, 255), 1)

    $yPositions = @(40, 448, 855, 1263)
    foreach ($y in $yPositions) {
        $g.DrawRectangle($slotPen, 35, $y - 1, 530, 390)
        $g.DrawRectangle($slotInnerPen, 33, $y - 3, 534, 394)
    }

    # Cute Sparkles / Stars near corners & between slots
    $starBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 215, 0))
    $fontStar = New-Object System.Drawing.Font("Arial", 18, [System.Drawing.FontStyle]::Bold)
    $fontSmall = New-Object System.Drawing.Font("Arial", 14, [System.Drawing.FontStyle]::Bold)

    $g.DrawString([char]0x2728, $fontStar, $starBrush, 24, 18)
    $g.DrawString([char]0x2728, $fontStar, $starBrush, $w - 48, 18)
    $g.DrawString([char]0x2605, $fontSmall, $starBrush, 18, 432)
    $g.DrawString([char]0x2605, $fontSmall, $starBrush, $w - 38, 432)
    $g.DrawString([char]0x2605, $fontSmall, $starBrush, 18, 839)
    $g.DrawString([char]0x2605, $fontSmall, $starBrush, $w - 38, 839)
    $g.DrawString([char]0x2605, $fontSmall, $starBrush, 18, 1247)
    $g.DrawString([char]0x2605, $fontSmall, $starBrush, $w - 38, 1247)

    # Footer Graphics
    $footerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 180, 100, 20))
    $footerFont = New-Object System.Drawing.Font("Verdana", 14, [System.Drawing.FontStyle]::Bold)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center

    $g.DrawString([char]0x2728 + " SPECIAL MOMENTS " + [char]0x2728, $footerFont, $footerBrush, ($w / 2), 1700, $format)

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Created: $outputPath"
}

function Create-VintageFilm2x6 {
    param([string]$outputPath)
    $w = 600
    $h = 1800
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $g.Clear([System.Drawing.Color]::Transparent)

    # Film perforation side strips (Dark border with sprocket holes)
    $filmDark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(250, 20, 20, 20))
    $sprocketBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 255, 255, 255))

    # Left & Right film rails (width 32px)
    $g.FillRectangle($filmDark, 0, 0, 32, $h)
    $g.FillRectangle($filmDark, $w - 32, 0, 32, $h)

    # Top & bottom film header
    $g.FillRectangle($filmDark, 0, 0, $w, 36)
    $g.FillRectangle($filmDark, 0, 1660, $w, 140)

    # Sprocket holes along the sides
    for ($y = 20; $y -lt $h; $y += 60) {
        $g.FillRectangle($sprocketBrush, 8, $y, 16, 28)
        $g.FillRectangle($sprocketBrush, $w - 24, $y, 16, 28)
    }

    # Vintage frame text in footer
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 240, 240, 240))
    $textFont = New-Object System.Drawing.Font("Consolas", 15, [System.Drawing.FontStyle]::Bold)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center

    $g.DrawString("KODAK PORTRA 400", $textFont, $textBrush, ($w / 2), 1710, $format)
    $subFont = New-Object System.Drawing.Font("Consolas", 11, [System.Drawing.FontStyle]::Regular)
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 200, 200, 200))
    $g.DrawString("35MM FILM . FOTOLISM BOOTH", $subFont, $subBrush, ($w / 2), 1740, $format)

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Created: $outputPath"
}

Create-PartySparkle2x6 "desktop/public/frames/frame_party_sparkle_2x6.png"
Create-VintageFilm2x6 "desktop/public/frames/frame_vintage_film_2x6.png"

