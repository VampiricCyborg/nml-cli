$ErrorActionPreference = 'Stop'
$demoRoot = Join-Path ([System.IO.Path]::GetTempPath()) "plumb-demo-$([guid]::NewGuid())"
$cli = (Resolve-Path (Join-Path $PSScriptRoot '..\dist\cli.js')).Path

try {
  New-Item -ItemType Directory -Path $demoRoot | Out-Null
  Set-Content -LiteralPath (Join-Path $demoRoot 'package.json') -Value '{"scripts":{"test":"node test.js"}}'
  Set-Content -LiteralPath (Join-Path $demoRoot 'test.js') -Value 'process.exit(1)'
  git init -q $demoRoot
  git -C $demoRoot config user.email demo@example.com
  git -C $demoRoot config user.name 'plumb demo'
  git -C $demoRoot add .
  git -C $demoRoot commit -qm 'agent: implementation complete; tests pass'

  Write-Host '--- Before: agent-authored commit message ---'
  git -C $demoRoot log -1 --format=%B
  Write-Host '--- After: independent plumb check ---'
  & node $cli check --cwd $demoRoot
  if ($LASTEXITCODE -ne 1) { throw "Expected plumb to return exit code 1, got $LASTEXITCODE" }
} finally {
  Remove-Item -LiteralPath $demoRoot -Recurse -Force -ErrorAction SilentlyContinue
}
