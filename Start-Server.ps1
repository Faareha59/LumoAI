# Set execution policy for this session
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

# Load environment variables from .env.local
$envFile = Join-Path $PSScriptRoot ".env.local"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#\s][^=]*)\s*=\s*(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
            Write-Host "Loaded: $name" -ForegroundColor Green
        }
    }
    Write-Host "`nEnvironment variables loaded successfully!" -ForegroundColor Cyan
} else {
    Write-Host "Warning: .env.local file not found!" -ForegroundColor Red
}

# Show loaded keys (masked for security)
Write-Host "`nAPI Status:" -ForegroundColor Yellow

if ([string]::IsNullOrEmpty($env:GEMINI_API_KEY)) {
    Write-Host "GEMINI_API_KEY: MISSING" -ForegroundColor Red
} else {
    Write-Host "GEMINI_API_KEY: OK" -ForegroundColor Green
}

if ([string]::IsNullOrEmpty($env:GROQ_API_KEY)) {
    Write-Host "GROQ_API_KEY: MISSING" -ForegroundColor Red
} else {
    Write-Host "GROQ_API_KEY: OK" -ForegroundColor Green
}

if ([string]::IsNullOrEmpty($env:ADMIN_SECRET)) {
    Write-Host "ADMIN_SECRET: MISSING" -ForegroundColor Red
} else {
    Write-Host "ADMIN_SECRET: OK" -ForegroundColor Green
}

# Start the server
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Starting LumoAI Server on port 8765..." -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$serverPath = Join-Path $PSScriptRoot "server\index.js"
node $serverPath

Write-Host "`nServer stopped!" -ForegroundColor Yellow
pause
