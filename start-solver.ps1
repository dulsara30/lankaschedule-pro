# TIMETABLE SOLVER - QUICK START SCRIPT
# This script starts both the Python solver and Next.js development server

Write-Host "`n" -NoNewline
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🚀 STARTING TIMETABLE SOLVER SERVICES" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if a port is in use
function Test-Port {
    param($Port)
    $connection = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue
    return $connection.TcpTestSucceeded
}

# Check Python installation
Write-Host "🔍 Checking Python installation..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✅ Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Python not found. Please install Python 3.9+ first." -ForegroundColor Red
    Write-Host "   Download from: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# Check if requirements are installed
Write-Host "`n🔍 Checking Python dependencies..." -ForegroundColor Yellow
try {
    python -c "from ortools.sat.python import cp_model; import fastapi; import uvicorn" 2>&1 | Out-Null
    Write-Host "✅ All Python dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Missing dependencies. Installing from requirements.txt..." -ForegroundColor Yellow
    pip install -r requirements.txt
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}

# Check if ports are available
Write-Host "`n🔍 Checking ports..." -ForegroundColor Yellow

if (Test-Port 8000) {
    Write-Host "⚠️  Port 8000 is already in use" -ForegroundColor Yellow
    Write-Host "   Attempting to stop existing Python solver..." -ForegroundColor Yellow
    Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*solver.py*" } | Stop-Process -Force
    Start-Sleep -Seconds 2
}

if (Test-Port 3000) {
    Write-Host "⚠️  Port 3000 is already in use" -ForegroundColor Yellow
    Write-Host "   Attempting to stop existing Next.js server..." -ForegroundColor Yellow
    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
}

Write-Host "✅ Ports 8000 and 3000 are available" -ForegroundColor Green

# Start Python solver in background
Write-Host "`n🚀 Starting Python CP-SAT Solver (Port 8000)..." -ForegroundColor Cyan
$solverJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    python solver.py
}

Write-Host "   Job ID: $($solverJob.Id)" -ForegroundColor Gray
Write-Host "   Waiting for solver to start..." -ForegroundColor Yellow

# Wait for solver to be ready (max 10 seconds)
$attempts = 0
$maxAttempts = 20
$solverReady = $false

while ($attempts -lt $maxAttempts) {
    Start-Sleep -Milliseconds 500
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 1 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $solverReady = $true
            break
        }
    } catch {
        # Still starting...
    }
    $attempts++
}

if ($solverReady) {
    Write-Host "✅ Python solver is running on http://localhost:8000" -ForegroundColor Green
    Write-Host "   API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
} else {
    Write-Host "❌ Python solver failed to start within 10 seconds" -ForegroundColor Red
    Write-Host "   Check job output:" -ForegroundColor Yellow
    Receive-Job -Job $solverJob
    Stop-Job -Job $solverJob
    Remove-Job -Job $solverJob
    exit 1
}

# Start Next.js in foreground
Write-Host "`n🚀 Starting Next.js Development Server (Port 3000)..." -ForegroundColor Cyan
Write-Host "   This will run in the foreground. Press Ctrl+C to stop both services." -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "✅ SERVICES RUNNING" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "📍 Python Solver:  http://localhost:8000" -ForegroundColor White
Write-Host "📖 Solver API Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host "📍 Next.js App:     http://localhost:3000" -ForegroundColor White
Write-Host "📊 Dashboard:       http://localhost:3000/dashboard/lessons" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Register cleanup on exit
Register-EngineEvent PowerShell.Exiting -Action {
    Write-Host "`n🛑 Stopping services..." -ForegroundColor Yellow
    Get-Job | Stop-Job
    Get-Job | Remove-Job
    Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*solver.py*" } | Stop-Process -Force
    Write-Host "✅ All services stopped" -ForegroundColor Green
}

# Start Next.js (this blocks)
try {
    npm run dev
} finally {
    # Cleanup on exit
    Write-Host "`n🛑 Stopping Python solver..." -ForegroundColor Yellow
    Stop-Job -Job $solverJob -ErrorAction SilentlyContinue
    Remove-Job -Job $solverJob -ErrorAction SilentlyContinue
    Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*solver.py*" } | Stop-Process -Force
    Write-Host "✅ All services stopped" -ForegroundColor Green
}
