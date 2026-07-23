$ErrorActionPreference = "Stop"

function Invoke-Gate {
    param(
        [string]$Name,
        [scriptblock]$Command
    )
    Write-Output "==> $Name"
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

Invoke-Gate "Local configuration validation" { node scripts/validate-config.mjs --mode=local --file=.env }
Invoke-Gate "Docker Compose configuration" { docker compose config --quiet }
Invoke-Gate "Docker service status" { docker compose ps }
Invoke-Gate "Prisma schema validation" { pnpm run prisma:validate }
Invoke-Gate "Migration status" { pnpm exec prisma migrate status }
Invoke-Gate "TypeScript, lint and tests" { pnpm run validate }
Invoke-Gate "Production build" { pnpm run build }

Write-Output "==> Health check"
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 10
    if (-not $health.ok) {
        throw "Health endpoint did not return ok=true"
    }
    Write-Output "Health check passed: service=$($health.service)"
}
catch {
    throw "Health check failed. Start pnpm dev or pnpm start first. $($_.Exception.Message)"
}

Write-Output "DRY_RUN_OK"
