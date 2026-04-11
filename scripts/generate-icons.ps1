$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2

  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  return $path
}

function Fill-Circle {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Brush]$Brush,
    [float]$CenterX,
    [float]$CenterY,
    [float]$Radius
  )

  $Graphics.FillEllipse($Brush, $CenterX - $Radius, $CenterY - $Radius, $Radius * 2, $Radius * 2)
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $projectRoot "assets"
$sizes = @(16, 32, 48, 64, 128)

$bgTop = [System.Drawing.ColorTranslator]::FromHtml("#2C6BFF")
$bgBottom = [System.Drawing.ColorTranslator]::FromHtml("#173D9B")
$accent = [System.Drawing.ColorTranslator]::FromHtml("#14CBA8")
$shadowColor = [System.Drawing.Color]::FromArgb(56, 12, 30, 89)

foreach ($size in $sizes + 512) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $padding = [math]::Round($size * 0.0625, 2)
  $corner = [math]::Max(3, [math]::Round($size * 0.235, 2))
  $bgPath = New-RoundedRectanglePath -X $padding -Y $padding -Width ($size - $padding * 2) -Height ($size - $padding * 2) -Radius $corner
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    ([System.Drawing.PointF]::new($padding, $padding)),
    ([System.Drawing.PointF]::new($size - $padding, $size - $padding)),
    $bgTop,
    $bgBottom
  )
  $graphics.FillPath($bgBrush, $bgPath)

  $bookmarkLeft = $size * 0.31
  $bookmarkTop = $size * 0.16
  $bookmarkWidth = $size * 0.38
  $bookmarkHeight = $size * 0.56
  $notchDepth = $size * 0.11
  $bookmarkBottom = $bookmarkTop + $bookmarkHeight
  $bookmarkRight = $bookmarkLeft + $bookmarkWidth
  $bookmarkCenter = $bookmarkLeft + ($bookmarkWidth / 2)

  $shadowOffset = [math]::Max(1, [math]::Round($size * 0.02, 2))
  $shadowPoints = [System.Drawing.PointF[]]@(
    ([System.Drawing.PointF]::new($bookmarkLeft, $bookmarkTop + $shadowOffset)),
    ([System.Drawing.PointF]::new($bookmarkRight, $bookmarkTop + $shadowOffset)),
    ([System.Drawing.PointF]::new($bookmarkRight, $bookmarkBottom + $shadowOffset)),
    ([System.Drawing.PointF]::new($bookmarkCenter, $bookmarkBottom - $notchDepth + $shadowOffset)),
    ([System.Drawing.PointF]::new($bookmarkLeft, $bookmarkBottom + $shadowOffset))
  )
  $shadowBrush = New-Object System.Drawing.SolidBrush($shadowColor)
  $graphics.FillPolygon($shadowBrush, $shadowPoints)

  $bookmarkPoints = [System.Drawing.PointF[]]@(
    ([System.Drawing.PointF]::new($bookmarkLeft, $bookmarkTop)),
    ([System.Drawing.PointF]::new($bookmarkRight, $bookmarkTop)),
    ([System.Drawing.PointF]::new($bookmarkRight, $bookmarkBottom)),
    ([System.Drawing.PointF]::new($bookmarkCenter, $bookmarkBottom - $notchDepth)),
    ([System.Drawing.PointF]::new($bookmarkLeft, $bookmarkBottom))
  )
  $bookmarkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $graphics.FillPolygon($bookmarkBrush, $bookmarkPoints)

  $penWidth = [math]::Max(1.6, $size * 0.055)
  $nodeRadius = [math]::Max(1.8, $size * 0.038)
  $centerX = $size * 0.5
  $topNodeY = $size * 0.33
  $midNodeY = $size * 0.43
  $bottomNodeY = $size * 0.53
  $leftNodeX = $size * 0.395
  $rightNodeX = $size * 0.605

  $accentPen = New-Object System.Drawing.Pen($accent, $penWidth)
  $accentPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $accentPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $accentPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $accentBrush = New-Object System.Drawing.SolidBrush($accent)

  $graphics.DrawLine($accentPen, $centerX, $topNodeY, $centerX, $bottomNodeY)
  $graphics.DrawLine($accentPen, $centerX, $midNodeY, $leftNodeX, $midNodeY)
  $graphics.DrawLine($accentPen, $centerX, $midNodeY, $rightNodeX, $midNodeY)

  Fill-Circle -Graphics $graphics -Brush $accentBrush -CenterX $centerX -CenterY $topNodeY -Radius $nodeRadius
  Fill-Circle -Graphics $graphics -Brush $accentBrush -CenterX $leftNodeX -CenterY $midNodeY -Radius $nodeRadius
  Fill-Circle -Graphics $graphics -Brush $accentBrush -CenterX $rightNodeX -CenterY $midNodeY -Radius $nodeRadius
  Fill-Circle -Graphics $graphics -Brush $accentBrush -CenterX $centerX -CenterY $bottomNodeY -Radius $nodeRadius

  $output = if ($size -eq 512) {
    Join-Path $assetsDir "icon.png"
  } else {
    Join-Path $assetsDir ("icon{0}.png" -f $size)
  }

  $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)

  $accentPen.Dispose()
  $accentBrush.Dispose()
  $bookmarkBrush.Dispose()
  $shadowBrush.Dispose()
  $bgBrush.Dispose()
  $bgPath.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Host "Generated icon.png and icon16/icon32/icon48/icon64/icon128.png"