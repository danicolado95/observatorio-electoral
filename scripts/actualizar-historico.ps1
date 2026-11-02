param([string]$WikipediaHtml,[string]$Python='python',[string]$ElectograficaFixtureDirectory,[string]$AsOf=([datetime]::UtcNow.ToString('yyyy-MM-dd')))
$ErrorActionPreference='Stop'
$root=if($env:ELECTOGRAFICA_TEST_ROOT){$env:ELECTOGRAFICA_TEST_ROOT}else{Join-Path $PSScriptRoot '..'}
$names=@('wikipedia/staging.json','wikipedia/report.json','wikipedia/radar.json','electografica/snapshot.json','electografica/radar.json','electografica/report.json','electografica/audit.json','electografica/quarantine.json','electografica/manifest.json','electografica/before.json')
$saved=@{}
foreach($name in $names){$path=Join-Path $root "data/pipeline-test/$name";if(Test-Path -LiteralPath $path){$saved[$path]=[IO.File]::ReadAllBytes($path)}else{$saved[$path]=$null}}
try{
 if($WikipediaHtml){& $Python (Join-Path $PSScriptRoot 'actualizar-wikipedia.py') --html $WikipediaHtml}
 else{& $Python (Join-Path $PSScriptRoot 'actualizar-wikipedia.py')}
 if($LASTEXITCODE){throw 'Falló Wikipedia'}
 & (Join-Path $PSScriptRoot 'descargar-electografica.ps1') -FixtureDirectory $ElectograficaFixtureDirectory -AsOf $AsOf
}catch{
 foreach($path in $saved.Keys){if($null -ne $saved[$path]){[IO.File]::WriteAllBytes("$path.restore",$saved[$path]);Move-Item -LiteralPath "$path.restore" -Destination $path -Force}elseif(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path}}
 throw
}
