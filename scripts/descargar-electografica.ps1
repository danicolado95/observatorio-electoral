param([string]$AsOf='2026-11-02',[string]$FixtureDirectory,[switch]$DownloadOnly)
$ErrorActionPreference='Stop'
$root=if($env:ELECTOGRAFICA_TEST_ROOT){$env:ELECTOGRAFICA_TEST_ROOT}else{Join-Path $PSScriptRoot '..'}
$dest=Join-Path $root 'data/pipeline-test/electografica'
New-Item -ItemType Directory -Force $dest | Out-Null
$run=Join-Path $dest ('downloads/'+[guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force $run | Out-Null
$entries=@{}
$manifest=@()
$until=([datetime]::ParseExact($AsOf,'yyyy-MM-dd',$null)).AddDays(1).ToString('yyyy-MM-dd')
foreach($category in @('Generales','Generales_CCAA')){
 $start=1;$total=$null;$ids=@{}
 do {
  $name="$category-$start.json";$file=Join-Path $run $name
  $url="https://www.electografica.com/feeds/posts/default/-/${category}?alt=json&max-results=20&start-index=$start&published-min=2023-07-23T00:00:00%2B02:00&published-max=${until}T00:00:00%2B01:00"
  if($FixtureDirectory){Copy-Item -LiteralPath (Join-Path $FixtureDirectory $name) -Destination $file}
  else{Invoke-WebRequest $url -OutFile $file -TimeoutSec 45}
  $f=Get-Content $file -Raw | ConvertFrom-Json
  if(!$f.feed.'openSearch$totalResults'){throw 'Feed sin total: histórico conservado'}
  $reported=[int]$f.feed.'openSearch$totalResults'.'$t'
  if($null -eq $total){$total=$reported}elseif($total -ne $reported){throw 'Total variable durante paginación: reintentar'}
  $page=@($f.feed.entry | Where-Object {$null -ne $_})
  if(!$page.Count){throw 'Página vacía: histórico conservado'}
  foreach($e in $page){if(!$e.id.'$t' -or $ids.ContainsKey($e.id.'$t')){throw 'Página repetida o identidad ausente'};$ids[$e.id.'$t']=$true;$entries[$e.id.'$t']=$e}
  $manifest+=@{file=$name;url=$url;count=$page.Count;total=$total;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower()}
  $start+=$page.Count
  if(!$FixtureDirectory){Start-Sleep -Milliseconds 300}
 }while($start -le $total)
 if($ids.Count -ne $total){throw 'Inventario incompleto: histórico conservado'}
}
$snapshot=@{complete=$true;expected=$entries.Count;period=@('2023-07-23',$AsOf);pages=$manifest;feed=@{entry=@($entries.Values | Sort-Object {$_.id.'$t'})}}
$temp=Join-Path $run 'snapshot.json'
$snapshot | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $temp -Encoding utf8
Move-Item -LiteralPath $temp -Destination (Join-Path $dest 'snapshot.json') -Force
if(!$DownloadOnly){node (Join-Path $PSScriptRoot 'importar-electografica.mjs');if($LASTEXITCODE){throw 'Falló la normalización'}}
