$raw = [System.IO.File]::ReadAllText("$env:TEMP\merged-latest\unzipped\word\document.xml")
$allSectPr = [regex]::Matches($raw, '<w:sectPr')
$start = $raw.IndexOf('</w:sectPr>', $allSectPr[$allSectPr.Count-2].Index) + 12
$end = $allSectPr[$allSectPr.Count-1].Index
$back = $raw.Substring($start, $end - $start)

# Find inline images
$inlines = [regex]::Matches($back, '<wp:inline[\s\S]*?</wp:inline>')
Write-Host "inline count: $($inlines.Count)"
$i = 0
foreach ($m in $inlines) {
    $a = $m.Value
    $cx = if ($a -match 'extent[^>]*cx="(\d+)"') { $Matches[1] } else { '?' }
    $cy = if ($a -match 'extent[^>]*cy="(\d+)"') { $Matches[1] } else { '?' }
    $name = if ($a -match 'docPr[^>]*name="([^"]*)"') { $Matches[1] } else { '?' }
    Write-Host "  inline[$i] name=$name cx=$cx cy=$cy"
    $i++
}

# Find anchors
$anchors = [regex]::Matches($back, '<wp:anchor[\s\S]*?</wp:anchor>')
Write-Host "`nanchor count: $($anchors.Count)"
$i = 0
foreach ($m in $anchors) {
    $a = $m.Value
    $cx = if ($a -match 'extent[^>]*cx="(\d+)"') { $Matches[1] } else { '?' }
    $cy = if ($a -match 'extent[^>]*cy="(\d+)"') { $Matches[1] } else { '?' }
    $hOff = if ($a -match 'positionH[\s\S]*?posOffset>(\d+)') { $Matches[1] } else { '?' }
    $vOff = if ($a -match 'positionV[\s\S]*?posOffset>(\d+)') { $Matches[1] } else { '?' }
    $hRel = if ($a -match 'positionH[^>]*relativeFrom="(\w+)"') { $Matches[1] } else { '?' }
    $vRel = if ($a -match 'positionV[^>]*relativeFrom="(\w+)"') { $Matches[1] } else { '?' }
    $name = if ($a -match 'docPr[^>]*name="([^"]*)"') { $Matches[1] } else { '?' }
    Write-Host "  anchor[$i] name=$name cx=$cx cy=$cy posH=$hOff($hRel) posV=$vOff($vRel)"
    $i++
}
