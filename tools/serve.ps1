# Локальный сервер для разработки.
#
# Модули ES и сервис-воркер не работают через file:// — нужен http.
# Node в проекте не используется, поэтому сервер здесь: обычный HttpListener
# из состава Windows, без установки чего-либо.
#
# Запуск:   powershell -ExecutionPolicy Bypass -File tools/serve.ps1
# Останов:  Ctrl+C
#
# Ключевое место — таблица типов ниже. Браузер отказывается исполнять модуль,
# отданный не как JavaScript, и приложение молча не запускается.

param(
    [int]$Port = 4190,
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$types = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.md'   = 'text/markdown; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.woff2'= 'font/woff2'
    '.wasm' = 'application/wasm'
    '.pgn'  = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try {
    $listener.Start()
} catch {
    Write-Host "Не удалось занять порт $Port. Запустите с другим: -Port 4191" -ForegroundColor Red
    exit 1
}

Write-Host "Разбор партий: http://localhost:$Port/" -ForegroundColor Green
Write-Host "Каталог: $Root"
Write-Host "Остановить: Ctrl+C"

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response

    $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)

    # Каталог отдаётся своим index.html — так же, как это делает GitHub
    # Pages. Без этого проверить работу приложения из подкаталога
    # (/имя-репозитория/) на локальном сервере невозможно.
    if ($path.EndsWith('/')) { $path = $path + 'index.html' }

    $file = Join-Path $Root ($path.TrimStart('/') -replace '/', '\')

    # Выход за пределы каталога проекта запрещён
    $full = [System.IO.Path]::GetFullPath($file)
    if (-not $full.StartsWith([System.IO.Path]::GetFullPath($Root))) {
        $res.StatusCode = 403
        $res.Close()
        continue
    }

    if (Test-Path $full -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }

        # Разработка: кэш браузера только мешает видеть правки
        $res.Headers.Add('Cache-Control', 'no-store')

        $bytes = [System.IO.File]::ReadAllBytes($full)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        Write-Host "200 $path"
    } else {
        $res.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('404')
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        Write-Host "404 $path" -ForegroundColor DarkYellow
    }

    $res.Close()
}
