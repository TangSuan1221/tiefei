$ErrorActionPreference = 'Continue'
$log = 'qa/run-creature-checks.log'
"run $(Get-Date -Format o)" | Out-File $log -Encoding utf8
foreach ($f in 'living-shade-warning-check','living-creatures-check','living-survey-encounters-check') {
  "== $f" | Out-File $log -Append -Encoding utf8
  npx tsx "tools/$f.ts" 2>&1 | Out-File $log -Append -Encoding utf8
  "exit $LASTEXITCODE" | Out-File $log -Append -Encoding utf8
}
"== tsc" | Out-File $log -Append -Encoding utf8
npx tsc --noEmit -p . 2>&1 | Out-File $log -Append -Encoding utf8
"exit $LASTEXITCODE" | Out-File $log -Append -Encoding utf8
"== level-rag check" | Out-File $log -Append -Encoding utf8
node tools/level-rag.mjs check 2>&1 | Out-File $log -Append -Encoding utf8
"exit $LASTEXITCODE" | Out-File $log -Append -Encoding utf8
"DONE" | Out-File $log -Append -Encoding utf8
