$target = ".\orbyteflow\src"

if (-not (Test-Path $target)) {
    Write-Host "找不到 $target，正在搜索 orbyteflow 下的文件..." -ForegroundColor Red
    Get-ChildItem -Path ".\orbyteflow" -Directory | Select-Object -ExpandProperty Name
    return
}

$files = Get-ChildItem -Path "$target\*" -Recurse -File | Where-Object {
    $_.Extension -match '^\.(ts|tsx|css)$' -and$_.FullName -notmatch '[\\/](node_modules|\.next|dist|build|\.cache|coverage|out)[\\/]'
}

Write-Host "在 $target 下找到前端代码文件数: $($files.Count)" -ForegroundColor Yellow

if ($files.Count -gt 0) {$files | ForEach-Object {
        "`n========== FILE: $($_.FullName) ==========`n"
        Get-Content -LiteralPath $_.FullName -Raw
    } | Set-Content -LiteralPath ".\frontend_code.txt" -Encoding UTF8

    $sizeKb = [math]::Round((Get-Item ".\frontend_code.txt").Length / 1KB, 2)
    Write-Host "导出成功 -> .\frontend_code.txt (共 $sizeKb KB)" -ForegroundColor Green
} else {
    Write-Host "该目录下未找到符合条件的 .ts/.tsx/.css 文件。" -ForegroundColor Red
}