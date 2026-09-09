$srcDoc = "D:\develop\OpenBidKit\client\assets\signing-page-template.docx"
$dstDir = Join-Path $env:TEMP 'signing-orig'
Remove-Item -Recurse -Force $dstDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
Copy-Item $srcDoc "$dstDir\signing.zip" -Force
Expand-Archive -Path "$dstDir\signing.zip" -DestinationPath "$dstDir\unzipped" -Force

[xml]$x = Get-Content "$dstDir\unzipped\word\document.xml"
$ns = New-Object System.Xml.XmlNamespaceManager($x.NameTable)
$ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')

$tables = $x.SelectNodes('//w:tbl', $ns)
Write-Host "Tables in template: $($tables.Count)"

$i = 0
foreach ($t in $tables) {
    Write-Host "`n=== Table $i ==="
    $tblPr = $t.SelectSingleNode('./w:tblPr', $ns)
    Write-Host "tblPr full: $($tblPr.OuterXml)"
    
    # dump ALL children including any unexpected ones
    Write-Host "tbl direct children count: $($t.ChildNodes.Count)"
    foreach ($c in $t.ChildNodes) {
        Write-Host "  child: name=$($c.Name)"
    }
    
    # check all tblPrEx under any namespace
    foreach ($c in $t.ChildNodes) {
        if ($c.LocalName -eq 'tblPrEx') {
            Write-Host "tblPrEx found: $($c.OuterXml)"
        }
    }
    
    # also check any w:tc inside for tcBorders
    $firstRow = $t.SelectSingleNode('./w:tr[1]', $ns)
    if ($firstRow) {
        $firstCell = $firstRow.SelectSingleNode('./w:tc[1]', $ns)
        if ($firstCell) {
            $tcPr = $firstCell.SelectSingleNode('./w:tcPr', $ns)
            if ($tcPr) {
                Write-Host "first cell tcPr: $($tcPr.OuterXml)"
            }
        }
    }
    
    # check second row
    $secondRow = $t.SelectSingleNode('./w:tr[2]', $ns)
    if ($secondRow) {
        $firstCell = $secondRow.SelectSingleNode('./w:tc[1]', $ns)
        if ($firstCell) {
            $tcPr = $firstCell.SelectSingleNode('./w:tcPr', $ns)
            if ($tcPr) {
                Write-Host "secondRow[0] cell tcPr: $($tcPr.OuterXml)"
            }
        }
    }
    
    $i++
}
