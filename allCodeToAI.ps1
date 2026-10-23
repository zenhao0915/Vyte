$root = $PSScriptRoot
$out  = Join-Path $root "all_code.txt"

$include = '*.kt','*.kts','*.java','*.sq','*.ts','*.tsx','*.js','*.jsx','*.css','*.html','*.json','*.properties','*.md'
$skipDirs = 'node_modules|\\build\\|\\dist\\|\\\.gradle\\|\\\.git\\|\\\.idea\\|\\out\\'
$skipFiles = 'package-lock.json','all_code.txt','frontend_code.txt'

Get-ChildItem -Path $root -Recurse -File -Include $include |
    Where-Object { $_.FullName -notmatch $skipDirs -and $skipFiles -notcontains $_.Name } |
    ForEach-Object {
        "`n========== FILE: $($_.FullName) ==========`n"
        Get-Content $_.FullName -Raw
    } | Set-Content $out -Encoding UTF8

Write-Host "Done -> $out" -ForegroundColor Green