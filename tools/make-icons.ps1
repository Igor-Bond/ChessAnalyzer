# Генерация значков приложения.
#
# Запуск: powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
#
# Рисуется программно, System.Drawing из состава Windows: повторить
# результат можно в любой момент, без графических редакторов.
#
# Знак — конь на клетках доски. Конь набран шрифтом Segoe UI Symbol, и здесь
# это можно: шрифт нужен только на машине, где рисуется значок, а в PNG он
# уже картинка. В самом приложении фигуры шрифтом не рисуются (Р-7).
#
# Maskable-значки — с фоном на весь холст и рисунком в безопасной зоне
# (круг в 80% ширины): Android обрезает значок под форму системы.

param(
    [string]$Out = (Join-Path (Split-Path -Parent $PSScriptRoot) 'assets')
)

Add-Type -AssemblyName System.Drawing

$bg     = [System.Drawing.ColorTranslator]::FromHtml('#16181d')
$light  = [System.Drawing.ColorTranslator]::FromHtml('#f0d9b5')
$dark   = [System.Drawing.ColorTranslator]::FromHtml('#b58863')
$ink    = [System.Drawing.ColorTranslator]::FromHtml('#16181d')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#7fa650')

function New-RoundedPath {
    param($X, $Y, $W, $H, $R)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $R * 2
    $path.AddArc($X, $Y, $d, $d, 180, 90)
    $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
    $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
    $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-Icon {
    param([int]$Size, [switch]$Maskable)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Плитка 2×2 клетки — сама по себе читается как «доска»
    $pad = if ($Maskable) { 0 } else { $Size * 0.06 }
    $w = $Size - $pad * 2

    $clip = if ($Maskable) {
        $p = New-Object System.Drawing.Drawing2D.GraphicsPath
        $p.AddRectangle((New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)))
        $p
    } else {
        New-RoundedPath -X $pad -Y $pad -W $w -H $w -R ($Size * 0.2)
    }

    $g.SetClip($clip)

    $half = $w / 2
    $lb = New-Object System.Drawing.SolidBrush($light)
    $db = New-Object System.Drawing.SolidBrush($dark)
    $g.FillRectangle($lb, [float]$pad, [float]$pad, [float]$half, [float]$half)
    $g.FillRectangle($db, [float]($pad + $half), [float]$pad, [float]$half, [float]$half)
    $g.FillRectangle($db, [float]$pad, [float]($pad + $half), [float]$half, [float]$half)
    $g.FillRectangle($lb, [float]($pad + $half), [float]($pad + $half), [float]$half, [float]$half)
    $g.ResetClip()

    # Конь: белый с тёмной обводкой, как фигура на доске
    $scale = if ($Maskable) { 0.56 } else { 0.7 }
    $font = New-Object System.Drawing.Font('Segoe UI Symbol', [float]($Size * $scale), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $rect = New-Object System.Drawing.RectangleF(0, [float]($Size * 0.02), $Size, $Size)
    $path.AddString([string][char]0x265E, $font.FontFamily, 0, [float]($Size * $scale), $rect, $fmt)

    $pen = New-Object System.Drawing.Pen($ink, [float]($Size * 0.035))
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($pen, $path)
    $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)), $path)

    # Зелёная отметка «лучший ход» в углу — то, ради чего приложение
    $r = $Size * 0.13
    $cx = if ($Maskable) { $Size * 0.72 } else { $Size * 0.78 }
    $cy = if ($Maskable) { $Size * 0.28 } else { $Size * 0.22 }
    $g.FillEllipse((New-Object System.Drawing.SolidBrush($accent)), [float]($cx - $r), [float]($cy - $r), [float]($r * 2), [float]($r * 2))

    $check = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [float]($Size * 0.03))
    $check.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $check.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $check.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $pts = @(
        (New-Object System.Drawing.PointF([float]($cx - $r * 0.45), [float]($cy + $r * 0.02))),
        (New-Object System.Drawing.PointF([float]($cx - $r * 0.1), [float]($cy + $r * 0.38))),
        (New-Object System.Drawing.PointF([float]($cx + $r * 0.5), [float]($cy - $r * 0.35)))
    )
    $g.DrawLines($check, $pts)

    $g.Dispose()
    return $bmp
}

if (-not (Test-Path $Out)) { New-Item -ItemType Directory -Force $Out | Out-Null }

foreach ($s in 192, 512) {
    (New-Icon -Size $s).Save((Join-Path $Out "icon-$s.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    (New-Icon -Size $s -Maskable).Save((Join-Path $Out "icon-maskable-$s.png"), [System.Drawing.Imaging.ImageFormat]::Png)
}

Write-Host "Значки записаны в $Out" -ForegroundColor Green
