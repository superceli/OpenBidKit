$ErrorActionPreference = 'Continue'
$outDir = Join-Path $env:TEMP 'inspect-out'
Remove-Item -Recurse -Force $outDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Copy-Item "$env:USERPROFILE\Desktop\第三方编制信息及签章页.docx" "$outDir\out.zip" -Force
Expand-Archive -Path "$outDir\out.zip" -DestinationPath "$outDir\unzipped" -Force

[xml]$x = Get-Content "$outDir\unzipped\word\document.xml"
$ns = New-Object System.Xml.XmlNamespaceManager($x.NameTable)
$ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')

$tables = $x.SelectNodes('//w:tbl', $ns)
Write-Host "Total tables: $($tables.Count)"

$i = 0
foreach ($t in $tables) {
    $tblPr = $t.SelectSingleNode('./w:tblPr', $ns)
    $tblStyle = if ($tblPr) { $tblPr.SelectSingleNode('./w:tblStyle', $ns) } else { $null }
    $tblBorders = if ($tblPr) { $tblPr.SelectSingleNode('./w:tblBorders', $ns) } else { $null }
    $tblPrEx = $t.SelectSingleNode('./w:tblPrEx', $ns)
    
    Write-Host "`n=== Table $i ==="
    Write-Host "  tblStyle: $(if($tblStyle){$tblStyle.OuterXml}else{'(none)'})"
    Write-Host "  tblBorders: $(if($tblBorders){$tblBorders.OuterXml}else{'(none)'})"
    Write-Host "  tblPrEx: $(if($tblPrEx){$tblPrEx.OuterXml}else{'(none)'})"
    
    # First row cells
    $firstRow = $t.SelectSingleNode('./w:tr[1]', $ns)
    if ($firstRow) {
        $cells = $firstRow.SelectNodes('./w:tc', $ns)
        $j = 0
        foreach ($c in $cells) {
            $tcPr = $c.SelectSingleNode('./w:tcPr', $ns)
            $tcBorders = if ($tcPr) { $tcPr.SelectSingleNode('./w:tcBorders', $ns) } else { $null }
            $shd = if ($tcPr) { $tcPr.SelectSingleNode('./w:shd', $ns) } else { $null }
            $texts = $c.SelectNodes('.//w:t', $ns) | ForEach-Object { $_.'#text' }
            Write-Host "  header cell[$j] text='$(($texts -join '') -replace '\s+', ' ')' tcBorders=$(if($tcBorders){$tcBorders.OuterXml}else{'(none)'}) shd=$(if($shd){$shd.OuterXml}else{'(none)'})"
            $j++
        }
    }
    
    # Second row for body tcBorders check
    $secondRow = $t.SelectSingleNode('./w:tr[2]', $ns)
    if ($secondRow) {
        $cells = $secondRow.SelectNodes('./w:tc', $ns)
        $j = 0
        foreach ($c in $cells) {
            $tcPr = $c.SelectSingleNode('./w:tcPr', $ns)
            $tcBorders = if ($tcPr) { $tcPr.SelectSingleNode('./w:tcBorders', $ns) } else { $null }
            Write-Host "  row2 cell[$j] tcBorders=$(if($tcBorders){$tcBorders.OuterXml}else{'(none)'})"
            $j++
        }
    }
    
    $i++
}
