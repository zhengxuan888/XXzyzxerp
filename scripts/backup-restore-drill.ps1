[CmdletBinding()]
param(
  [string]$ComposeService = "postgres",
  [string]$DatabaseUser = "erp",
  [string]$SourceDatabase = "erp_v2"
)

$ErrorActionPreference = "Stop"
$startedAt = Get-Date
$stamp = $startedAt.ToUniversalTime().ToString("yyyyMMddHHmmss")
$drillDatabase = "erp_v2_restore_drill_$stamp"
$containerDump = "/tmp/$drillDatabase.dump"
$artifactRoot = Join-Path $PSScriptRoot "..\.backup-drill"
$hostDump = Join-Path $artifactRoot "$drillDatabase.dump"
$createdDrillDatabase = $false
$containerReady = $false

function Invoke-Compose {
  param([string[]]$Arguments)

  $output = & docker compose @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
  }
  return @($output)
}

function Invoke-DatabaseScalar {
  param(
    [string]$Database,
    [string]$Sql
  )

  $result = Invoke-Compose @(
    "exec", "-T", $ComposeService,
    "psql", "-U", $DatabaseUser, "-d", $Database,
    "-v", "ON_ERROR_STOP=1", "-At", "-c", $Sql
  )
  return ($result | Select-Object -Last 1).Trim()
}

try {
  $containerId = (& docker compose ps -q $ComposeService).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $containerId) {
    throw "Local Docker service '$ComposeService' is not running."
  }

  $health = (& docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $containerId).Trim()
  if ($LASTEXITCODE -ne 0 -or $health -ne "healthy") {
    throw "Local Docker service '$ComposeService' is not healthy (status: $health)."
  }
  $containerReady = $true

  New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null

  Invoke-Compose @(
    "exec", "-T", $ComposeService,
    "pg_dump", "-U", $DatabaseUser, "-d", $SourceDatabase,
    "--format=custom", "--no-owner", "--no-acl",
    "--file=$containerDump"
  ) | Out-Null

  & docker cp "${containerId}:$containerDump" $hostDump | Out-Null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $hostDump)) {
    throw "Failed to copy the local backup out of the PostgreSQL container."
  }

  $dumpHash = (Get-FileHash -LiteralPath $hostDump -Algorithm SHA256).Hash
  $dumpSize = (Get-Item -LiteralPath $hostDump).Length

  Invoke-Compose @(
    "exec", "-T", $ComposeService,
    "createdb", "-U", $DatabaseUser, $drillDatabase
  ) | Out-Null
  $createdDrillDatabase = $true

  Invoke-Compose @(
    "exec", "-T", $ComposeService,
    "pg_restore", "-U", $DatabaseUser, "-d", $drillDatabase,
    "--exit-on-error", "--no-owner", "--no-acl", $containerDump
  ) | Out-Null

  $tables = Invoke-Compose @(
    "exec", "-T", $ComposeService,
    "psql", "-U", $DatabaseUser, "-d", $SourceDatabase,
    "-v", "ON_ERROR_STOP=1", "-At", "-c",
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
  )

  $tableCounts = [ordered]@{}
  $mismatches = @()
  foreach ($table in $tables) {
    $name = $table.Trim()
    if (-not $name) { continue }
    $quotedName = '\"' + $name.Replace('"', '""') + '\"'
    $sourceCount = [int64](Invoke-DatabaseScalar -Database $SourceDatabase -Sql "SELECT COUNT(*) FROM $quotedName;")
    $restoreCount = [int64](Invoke-DatabaseScalar -Database $drillDatabase -Sql "SELECT COUNT(*) FROM $quotedName;")
    $tableCounts[$name] = [ordered]@{ source = $sourceCount; restored = $restoreCount }
    if ($sourceCount -ne $restoreCount) {
      $mismatches += "$name ($sourceCount != $restoreCount)"
    }
  }

  $migrationSource = [int64](Invoke-DatabaseScalar -Database $SourceDatabase -Sql 'SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;')
  $migrationRestored = [int64](Invoke-DatabaseScalar -Database $drillDatabase -Sql 'SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;')
  if ($migrationSource -ne $migrationRestored) {
    $mismatches += "_prisma_migrations ($migrationSource != $migrationRestored)"
  }

  $activeAttachmentRows = Invoke-Compose @(
    "exec", "-T", $ComposeService,
    "psql", "-U", $DatabaseUser, "-d", $SourceDatabase,
    "-v", "ON_ERROR_STOP=1", "-At", "-c",
    'SELECT \"storageKey\" || E''\t'' || \"sha256\" || E''\t'' || \"sizeBytes\"::text FROM \"Attachment\" WHERE \"deletedAt\" IS NULL ORDER BY \"storageKey\";'
  )
  $storageRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.local-storage"))
  $missingObjects = @()
  $corruptObjects = @()
  $activeAttachmentCount = 0
  foreach ($row in $activeAttachmentRows) {
    if (-not $row.Trim()) { continue }
    $fields = $row.Split("`t")
    if ($fields.Count -ne 3) {
      $corruptObjects += "$($row.Trim()) (invalid metadata row)"
      continue
    }
    $key = $fields[0]
    $expectedHash = $fields[1].ToUpperInvariant()
    $expectedSize = [int64]$fields[2]
    $activeAttachmentCount++
    $objectPath = [System.IO.Path]::GetFullPath((Join-Path $storageRoot $key))
    if (-not $objectPath.StartsWith($storageRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
      $missingObjects += "$key (unsafe path)"
      continue
    }
    if (-not (Test-Path -LiteralPath $objectPath -PathType Leaf)) {
      $missingObjects += $key
      continue
    }
    $actualFile = Get-Item -LiteralPath $objectPath
    $actualHash = (Get-FileHash -LiteralPath $objectPath -Algorithm SHA256).Hash
    if ($actualFile.Length -ne $expectedSize -or $actualHash -ne $expectedHash) {
      $corruptObjects += "$key (expected $expectedSize/$expectedHash, got $($actualFile.Length)/$actualHash)"
    }
  }

  if ($mismatches.Count -gt 0) {
    throw "Restore reconciliation failed: $($mismatches -join ', ')"
  }
  if ($missingObjects.Count -gt 0) {
    throw "Attachment reconciliation failed; missing objects: $($missingObjects -join ', ')"
  }
  if ($corruptObjects.Count -gt 0) {
    throw "Attachment reconciliation failed; corrupt objects: $($corruptObjects -join ', ')"
  }

  $finishedAt = Get-Date
  [ordered]@{
    ok = $true
    sourceDatabase = $SourceDatabase
    drillDatabase = $drillDatabase
    postgresHealth = $health
    backupBytes = $dumpSize
    backupSha256 = $dumpHash
    tableCount = $tableCounts.Count
    migrationCount = $migrationSource
    activeAttachmentCount = $activeAttachmentCount
    missingAttachmentCount = 0
    corruptAttachmentCount = 0
    rowCountMismatches = 0
    startedAt = $startedAt.ToUniversalTime().ToString("o")
    finishedAt = $finishedAt.ToUniversalTime().ToString("o")
    durationSeconds = [math]::Round(($finishedAt - $startedAt).TotalSeconds, 2)
  } | ConvertTo-Json
}
finally {
  if ($createdDrillDatabase -and $containerReady) {
    Invoke-Compose @(
      "exec", "-T", $ComposeService,
      "dropdb", "-U", $DatabaseUser, "--if-exists", $drillDatabase
    ) | Out-Null
  }
  if ($containerReady) {
    Invoke-Compose @(
      "exec", "-T", $ComposeService,
      "rm", "-f", $containerDump
    ) | Out-Null
  }
  if (Test-Path -LiteralPath $hostDump) {
    Remove-Item -LiteralPath $hostDump -Force
  }
}
