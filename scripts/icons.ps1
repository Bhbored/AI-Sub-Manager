Add-Type -AssemblyName System.Drawing
$root = (Get-Location).Path
$assets = Join-Path $root 'assets'
function New-Image([int]$size, [bool]$tray) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = 'AntiAlias'
  $g.ScaleTransform($size / 256.0, $size / 256.0)
  if (!$tray) {
    $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
    foreach ($xy in @(@(8,8),@(148,8),@(148,148),@(8,148))) {
      $angle = @(180,270,0,90)[[array]::IndexOf(@('8,8','148,8','148,148','8,148'), ($xy -join ','))]
      $shape.AddArc($xy[0],$xy[1],100,100,$angle,90)
    }
    $shape.CloseFigure()
    $g.FillPath([System.Drawing.Brushes]::Black, $shape)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#101d27'))
    $g.FillPath($brush, $shape)
    $brush.Dispose()
    $shape.Dispose()
  }
  $pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#36d1ca')), $(if ($tray) {24} else {15})
  $pen.StartCap = $pen.EndCap = 'Round'
  $pen.LineJoin = 'Round'
  $points = [System.Drawing.Point[]]@( @('50,130','85,130','103,90','131,170','154,116','167,130','206,130') | ForEach-Object {
    $xy = $_.Split(',')
    New-Object System.Drawing.Point ([int]$xy[0]), ([int]$xy[1])
  })
  $g.DrawLines($pen, $points)
  $pen.Dispose()
  $g.Dispose()
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  ,$stream.ToArray()
  $stream.Dispose()
}
$sizes = @(16,24,32,48,128,256)
$images = @($sizes | ForEach-Object { ,(New-Image $_ $false) })
[IO.File]::WriteAllBytes((Join-Path $assets 'icon.png'), $images[-1])
[IO.File]::WriteAllBytes((Join-Path $assets 'tray-icon.png'), (New-Image 32 $true))
$stream = [IO.File]::Create((Join-Path $assets 'icon.ico'))
$writer = New-Object IO.BinaryWriter $stream
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $n = [byte]($sizes[$i] % 256)
  $writer.Write([byte[]]@($n,$n,0,0))
  $writer.Write([uint16]1)
  $writer.Write([uint16]32)
  $writer.Write([uint32]$images[$i].Length)
  $writer.Write([uint32]$offset)
  $offset += $images[$i].Length
}
foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
$writer.Dispose()

