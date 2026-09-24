$plannerPidFile = Join-Path $PSScriptRoot 'data\server.pid'
if (Test-Path -LiteralPath $plannerPidFile) {
    $plannerPid = [int](Get-Content -LiteralPath $plannerPidFile)
    $plannerProcessInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$plannerPid" -ErrorAction SilentlyContinue
    if ($plannerProcessInfo -and $plannerProcessInfo.Name -eq 'node.exe' -and $plannerProcessInfo.CommandLine -like '*server.cjs*') {
        Stop-Process -Id $plannerPid -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $plannerPidFile
}
