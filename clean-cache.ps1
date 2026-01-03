#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Clean Next.js and Turbopack cache to resolve Turbopack StaticSortedFile panic

.DESCRIPTION
    This script removes the .next and .turbo directories which can become corrupted
    when using Next.js 16 with Turbopack, especially after adding Web Workers.
    
    Known Issue: Turbopack can panic with StaticSortedFile errors when caching
    Web Workers or other dynamic imports.

.EXAMPLE
    .\clean-cache.ps1
    
.NOTES
    Run this script if you encounter:
    - Turbopack panic errors
    - StaticSortedFile errors
    - Build cache corruption
    - Worker loading issues
#>

Write-Host "`n🧹 Cleaning Next.js Cache..." -ForegroundColor Cyan

# Remove .next directory
if (Test-Path ".next") {
    Write-Host "  Removing .next directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force ".next" -ErrorAction SilentlyContinue
    Write-Host "  ✓ .next removed" -ForegroundColor Green
} else {
    Write-Host "  ℹ .next directory not found" -ForegroundColor Gray
}

# Remove .turbo directory
if (Test-Path ".turbo") {
    Write-Host "  Removing .turbo directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force ".turbo" -ErrorAction SilentlyContinue
    Write-Host "  ✓ .turbo removed" -ForegroundColor Green
} else {
    Write-Host "  ℹ .turbo directory not found" -ForegroundColor Gray
}

# Remove node_modules/.cache if exists
if (Test-Path "node_modules\.cache") {
    Write-Host "  Removing node_modules\.cache directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force "node_modules\.cache" -ErrorAction SilentlyContinue
    Write-Host "  ✓ node_modules\.cache removed" -ForegroundColor Green
}

Write-Host "`n✅ Cache cleaned successfully!" -ForegroundColor Green
Write-Host "`nYou can now run:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White
Write-Host "  (or npm run dev:turbo to re-enable Turbopack)" -ForegroundColor Gray
Write-Host ""
