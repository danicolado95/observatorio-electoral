param([string]$WikipediaHtml,[string]$Python='python',[string]$ElectograficaFixtureDirectory,[string]$AsOf=([datetime]::UtcNow.ToString('yyyy-MM-dd')))
$ErrorActionPreference='Stop'
$root=if($env:ELECTOGRAFICA_TEST_ROOT){$env:ELECTOGRAFICA_TEST_ROOT}else{Join-Path $PSScriptRoot '..'}
$names=@('wikipedia/staging.json','wikipedia/report.json','wikipedia/radar.json','electografica/snapshot.json','electografica/radar.json','electografica/report.json','electografica/audit.json','electografica/quarantine.json','electografica/manifest.json','electografica/before.json')
$saved=@{}
foreach($name in $names){$path=Join-Path $root "data/pipeline-test/$name";if(Test-Path -LiteralPath $path){$saved[$path]=[IO.File]::ReadAllBytes($path)}else{$saved[$path]=$null}}
$fallback=Join-Path $root 'data/pipeline-test/wikipedia/fallback.json'
if(Test-Path -LiteralPath $fallback){Remove-Item -LiteralPath $fallback}
try{
 try {
  $wikiArgs=@('--as-of',$AsOf)
  if($WikipediaHtml){$wikiArgs+=@('--html',$WikipediaHtml)}
  & $Python (Join-Path $PSScriptRoot 'actualizar-wikipedia.py') @wikiArgs
  if($LASTEXITCODE){throw 'Falló Wikipedia'}
 }catch{
  $wikiNames=@($saved.Keys | Where-Object { $_ -match 'wikipedia[/\\]' })
  if($wikiNames | Where-Object { $_ -match '(radar|staging)\.json$' -and $null -eq $saved[$_] }){throw}
  foreach($path in $wikiNames){
   if($null -ne $saved[$path]){[IO.File]::WriteAllBytes($path,$saved[$path])}
   elseif(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path}
  }
  @{estado='restaurado';motivo=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $fallback -Encoding utf8
  Write-Warning 'Wikipedia no actualizada. Se continúa con su último histórico validado.'
 }
 & (Join-Path $PSScriptRoot 'descargar-electografica.ps1') -FixtureDirectory $ElectograficaFixtureDirectory -AsOf $AsOf
}catch{
 foreach($path in $saved.Keys){if($null -ne $saved[$path]){[IO.File]::WriteAllBytes("$path.restore",$saved[$path]);Move-Item -LiteralPath "$path.restore" -Destination $path -Force}elseif(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path}}
 throw
}
