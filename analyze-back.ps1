$raw = [System.IO.File]::ReadAllText("$env:TEMP\cover-inspect\unzipped\word\document.xml")
$i1 = $raw.IndexOf('<w:sectPr')
$i1End = $raw.IndexOf('</w:sectPr>', $i1) + 12
$i2 = $raw.IndexOf('<w:sectPr', $i1End)
$back = $raw.Substring($i1End, $i2 - $i1End)
[System.IO.File]::WriteAllText("$env:TEMP\backcover_orig.xml", $back)
Write-Host "back cover length: $($back.Length)"

# Count elements
$counts = @{
    anchor = ([regex]::Matches($back, '<wp:anchor')).Count
    drawing = ([regex]::Matches($back, '<w:drawing')).Count
    pict = ([regex]::Matches($back, '<w:pict')).Count
    vshape = ([regex]::Matches($back, '<v:shape')).Count
    wpsshape = ([regex]::Matches($back, '<wps:shape')).Count
    wpgwgp = ([regex]::Matches($back, '<wpg:wgp')).Count
    picpic = ([regex]::Matches($back, '<pic:pic')).Count
    blip = ([regex]::Matches($back, 'blip')).Count
    fill = ([regex]::Matches($back, 'solidFill|gradientFill|blipFill')).Count
}
$counts.GetEnumerator() | ForEach-Object { Write-Host "$($_.Key): $($_.Value)" }

# Show all v:shape styles
$shapes = [regex]::Matches($back, '<v:shape[^>]*>')
Write-Host "`nv:shape count: $($shapes.Count)"
$i = 0
foreach ($s in $shapes) {
    $style = if ($s.Value -match 'style="([^"]*)"') { $Matches[1] } else { 'no-style' }
    $id = if ($s.Value -match 'id="([^"]*)"') { $Matches[1] } else { '?' }
    Write-Host "  [$i] id=$id style=$style"
    $i++
}
