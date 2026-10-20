$root = $PSScriptRoot
$out  = Join-Path $root "frontend_code.txt"

# find orbyteflow\src anywhere under Vyte (skips node_modules)
$src = Get-ChildItem -Path $root -Directory -Recurse -Filter src -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match 'orbyteflow\\src$' -and $_.FullName -notmatch 'node_modules' } |
    Select-Object -First 1

if (-not $src) { Write-Host "Can't find orbyteflow\src under $root" -ForegroundColor Red; return }

Get-ChildItem -Path $src.FullName -Recurse -Include *.ts,*.tsx,*.css | ForEach-Object {
    "`n========== FILE: $($_.FullName) ==========`n"
    Get-Content $_.FullName -Raw
} | Set-Content $out -Encoding UTF8

Write-Host "Done -> $out" -ForegroundColor Green