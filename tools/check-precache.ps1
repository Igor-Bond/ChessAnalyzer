# Сверка списка предварительного кэша с деревом проекта.
#
# Запуск: powershell -ExecutionPolicy Bypass -File tools/check-precache.ps1
# Возвращает 1 при расхождении — годится для проверки перед выкладкой.
#
# Зачем. Список ФАЙЛЫ в sw.js ведётся руками, и забытый там файл ломает
# офлайн МОЛЧА: в сети всё работает, а без сети приложение не открывается.
# Узнаётся это в самый неподходящий момент — в турнирном зале без связи.
#
# Обратное расхождение тоже важно: путь, оставшийся в списке после
# переименования файла, при установке воркера даёт 404. Кэш соберётся
# частично, и приложение офлайн откажет наполовину.

param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$swPath = Join-Path $Root 'sw.js'

if (-not (Test-Path $swPath)) {
    Write-Host "Не найден $swPath" -ForegroundColor Red
    exit 1
}

# --- что перечислено в sw.js
$sw = Get-Content $swPath -Raw -Encoding UTF8

$block = [regex]::Match($sw, 'ФАЙЛЫ\s*=\s*\[(.*?)\]', 'Singleline')
if (-not $block.Success) {
    Write-Host 'В sw.js не найден список ФАЙЛЫ' -ForegroundColor Red
    exit 1
}

$listed = [regex]::Matches($block.Groups[1].Value, "'([^']+)'") |
    ForEach-Object { $_.Groups[1].Value } |
    Where-Object { $_ -ne './' }

# --- что есть в проекте и должно кэшироваться
$roots = @('js', 'css', 'assets', 'vendor')
$extra = @('index.html', 'manifest.json')

$actual = @()

foreach ($dir in $roots) {
    $path = Join-Path $Root $dir
    if (-not (Test-Path $path)) { continue }

    Get-ChildItem $path -Recurse -File | Where-Object { $_.Extension -in '.js', '.css', '.png', '.svg', '.wasm' } | ForEach-Object {
        $rel = $_.FullName.Substring($Root.Length + 1) -replace '\\', '/'
        $actual += $rel
    }
}

foreach ($file in $extra) {
    if (Test-Path (Join-Path $Root $file)) { $actual += $file }
}

# --- сверка в обе стороны
$missing = $actual | Where-Object { $listed -notcontains $_ } | Sort-Object
$stale   = $listed | Where-Object { $actual -notcontains $_ } | Sort-Object

Write-Host "В проекте: $($actual.Count), в списке: $($listed.Count)"

if ($missing.Count -eq 0 -and $stale.Count -eq 0) {
    Write-Host 'Список полон и точен.' -ForegroundColor Green
    exit 0
}

if ($missing.Count -gt 0) {
    Write-Host ''
    Write-Host 'Нет в sw.js — офлайн сломается на этих файлах:' -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "    '$_'," }
}

if ($stale.Count -gt 0) {
    Write-Host ''
    Write-Host 'Есть в sw.js, но нет в проекте — при установке воркера дадут 404:' -ForegroundColor Yellow
    $stale | ForEach-Object { Write-Host "    $_" }
}

Write-Host ''
Write-Host 'Поправьте список ФАЙЛЫ и поднимите APP_VERSION в sw.js.' -ForegroundColor Yellow
exit 1
