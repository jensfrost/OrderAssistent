param(
  [ValidateSet('dev','preview')] [string]$Env = 'dev'
)

$ErrorActionPreference = 'Stop'
$artifactPrefix = 'orderassistent'

function _Str($x) { if ($null -eq $x) { return '' } return [string]$x }
function _AsInt($x) { try { return [int]$x } catch { return 0 } }

# Repo root is expected to be C:\OrderAssistent\app\raw-reorder-app
$repoRoot   = Resolve-Path (Join-Path $PSScriptRoot '..')
$androidApp = Join-Path $repoRoot 'android\app'
$buildDir   = Join-Path $androidApp "build\outputs\apk\$Env\release"
$metaPath   = Join-Path $buildDir 'output-metadata.json'

if (-not (Test-Path $buildDir)) {
  throw "Build folder not found: $buildDir. Run :app:assemble${Env}Release first."
}

$meta = $null
$elements = @()
if (Test-Path $metaPath) {
  try {
    $meta = Get-Content -Raw $metaPath | ConvertFrom-Json
    if ($meta -and $meta.elements) {
      $elements = @($meta.elements)
    }
  } catch {
    Write-Warning ("Could not read/parse {0}: {1}" -f $metaPath, $_.Exception.Message)
  }
} else {
  Write-Warning ("Did not find {0}, using fallback to newest APK." -f $metaPath)
}

$el = $null
if ($elements.Count -gt 0) {
  $preferred = $elements | Where-Object {
    $filters = $_.filters
    $noFilters = ($null -eq $filters) -or ($filters.Count -eq 0)

    $ot = $null; if ($_.PSObject.Properties['outputType']) { $ot = $_.outputType }
    $otType = ''; if ($ot -and $ot.PSObject.Properties['type']) { $otType = _Str $ot.type }

    $typeStr = (_Str $_.type) + ' ' + $otType
    $fileStr = _Str $_.outputFile

    $typeStrLow = $typeStr.ToLower()
    $fileStrLow = $fileStr.ToLower()

    $isUniversal = ($typeStrLow -match 'universal') -or ($fileStrLow -match 'universal')
    $matchesEnv  = ($fileStrLow -match [regex]::Escape($Env.ToLower()))

    $noFilters -or $isUniversal -or $matchesEnv
  }

  if (-not $preferred -or $preferred.Count -eq 0) { $preferred = $elements }

  $el = $preferred |
    Sort-Object `
      -Property @{Expression={ _AsInt($_.versionCode) }; Descending=$true},
                @{Expression={
                    $ot2 = $null; if ($_.PSObject.Properties['outputType']) { $ot2 = $_.outputType }
                    $ot2Type = ''; if ($ot2 -and $ot2.PSObject.Properties['type']) { $ot2Type = _Str $ot2.type }
                    $mix = (_Str $_.type) + ' ' + $ot2Type + ' ' + (_Str $_.outputFile)
                    if ($mix.ToLower() -match 'universal'){1}else{0}
                  }; Descending=$true},
                @{Expression={
                    $f = _Str $_.outputFile
                    if ($f.ToLower() -match [regex]::Escape($Env.ToLower())){1}else{0}
                  }; Descending=$true} |
    Select-Object -First 1
}

$apkSrc = $null
$versionName = ''
$versionCode = 0

if ($el) {
  Write-Host ("Selected element: versionName={0}, versionCode={1}, outputFile={2}" -f $el.versionName, $el.versionCode, $el.outputFile)
  $versionName = _Str $el.versionName
  $versionCode = _AsInt $el.versionCode
  if ($el.outputFile) {
    $apkSrc = Join-Path $buildDir (_Str $el.outputFile)
  }
}

if (-not $apkSrc -or -not (Test-Path $apkSrc)) {
  $apkCand = Get-ChildItem -Path $buildDir -Recurse -Filter *.apk -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $apkCand) { throw "No APK found in $buildDir" }
  $apkSrc = $apkCand.FullName

  $name = $apkCand.Name
  if ($name -match "-([0-9\.]+)-vc(\d+)\.apk$") {
    $versionName = $Matches[1]
    $versionCode = [int]$Matches[2]
  } elseif ($versionCode -eq 0) {
    $versionCode = 1
  }

  if (-not $versionName) { $versionName = '1.0.0' }
  Write-Warning ("Metadata missing/invalid; using fallback: {0} (versionName={1}, versionCode={2})" -f $name, $versionName, $versionCode)
}

# Expected repo layout:
# C:\OrderAssistent\app\raw-reorder-app
# C:\OrderAssistent\web-preview\dist
$orderAssistRoot = Split-Path (Split-Path $repoRoot -Parent) -Parent

$webRootMap = @{
  dev     = (Join-Path $repoRoot 'public')
  preview = (Join-Path $orderAssistRoot 'web-preview\dist')
}

if (-not $webRootMap.ContainsKey($Env)) {
  throw "No web root mapping defined for env '$Env'."
}

$webRoot = $webRootMap[$Env]

if (-not (Test-Path $webRoot)) {
  Write-Host "Creating web root for env '$Env': $webRoot"
  New-Item -ItemType Directory -Path $webRoot -Force | Out-Null
}

$dstDir = Join-Path $webRoot "downloads\$Env"
New-Item -ItemType Directory -Path $dstDir -Force | Out-Null

Write-Host "Cleaning old APK/manifest in: $dstDir"
Get-ChildItem $dstDir -File -ErrorAction SilentlyContinue | Remove-Item -Force

$baseVers = "$artifactPrefix-$Env-$versionName-vc$versionCode.apk"
$dstVers  = Join-Path $dstDir $baseVers
$dstLatest= Join-Path $dstDir "$artifactPrefix-$Env-latest.apk"

Copy-Item $apkSrc $dstVers   -Force
Copy-Item $apkSrc $dstLatest -Force

$sha = (Get-FileHash -Path $dstVers -Algorithm SHA256).Hash.ToLower()
($sha + "  " + (Split-Path $dstVers -Leaf)) |
  Set-Content -Encoding ASCII ($dstVers + ".sha256")

$androidJsonPath = Join-Path $dstDir 'android.json'
$manifest = [ordered]@{
  env         = $Env
  versionName = $versionName
  versionCode = $versionCode
  apkUrl      = "/downloads/$Env/$artifactPrefix-$Env-latest.apk"
  file        = "/downloads/$Env/$baseVers"
  sha256      = $sha
  notes       = "Automatic post-build $Env"
  date        = (Get-Date).ToString("s")
}

($manifest | ConvertTo-Json -Depth 6) |
  Set-Content -Path $androidJsonPath -Encoding UTF8 -NoNewline

Write-Host "OK: APK and manifest ready in web root"
Write-Host "  APK:    $dstVers"
Write-Host "  LATEST: $dstLatest"
Write-Host "  JSON:   $androidJsonPath"
