param (
    [string]$DevIcon = ".\icon-dev.png",
    [string]$PreviewIcon = ".\icon-preview.png",
    [string]$ProjectRoot = ".\android\app\src"
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-AbsolutePath([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) {
        throw "Empty path received."
    }
    if ([System.IO.Path]::IsPathRooted($p)) {
        return $p
    }
    return [System.IO.Path]::GetFullPath((Join-Path $ScriptDir $p))
}

function Ensure-Folder([string]$path) {
    if (!(Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}

$DevIcon = Resolve-AbsolutePath $DevIcon
$PreviewIcon = Resolve-AbsolutePath $PreviewIcon
$ProjectRoot = Resolve-AbsolutePath $ProjectRoot

Write-Host "Dev icon: $DevIcon"
Write-Host "Preview icon: $PreviewIcon"
Write-Host "Project root: $ProjectRoot"

if (!(Test-Path $DevIcon)) { throw "Dev icon not found: $DevIcon" }
if (!(Test-Path $PreviewIcon)) { throw "Preview icon not found: $PreviewIcon" }
if (!(Test-Path $ProjectRoot)) { throw "Project root not found: $ProjectRoot" }

$densities = @("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")

function Copy-VariantIcons([string]$variant, [string]$iconPath, [string]$bgColor) {
    $base = Join-Path $ProjectRoot $variant
    Write-Host "Copying icons for $variant from $iconPath"

    foreach ($density in $densities) {
        $dir = Join-Path $base "res\mipmap-$density"
        Ensure-Folder $dir
        Copy-Item $iconPath (Join-Path $dir "ic_launcher.png") -Force
        Copy-Item $iconPath (Join-Path $dir "ic_launcher_round.png") -Force
    }

    $drawable = Join-Path $base "res\drawable"
    $values = Join-Path $base "res\values"
    $anydpi = Join-Path $base "res\mipmap-anydpi-v26"

    Ensure-Folder $drawable
    Ensure-Folder $values
    Ensure-Folder $anydpi

    Copy-Item $iconPath (Join-Path $drawable "ic_launcher_foreground.png") -Force

@"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$bgColor</color>
</resources>
"@ | Set-Content (Join-Path $values "ic_launcher_background.xml") -Encoding UTF8

$adaptive = @"
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
"@

    $adaptive | Set-Content (Join-Path $anydpi "ic_launcher.xml") -Encoding UTF8
    $adaptive | Set-Content (Join-Path $anydpi "ic_launcher_round.xml") -Encoding UTF8
}

Copy-VariantIcons -variant "dev" -iconPath $DevIcon -bgColor "#FF0000"
Copy-VariantIcons -variant "preview" -iconPath $PreviewIcon -bgColor "#FFFF00"

Write-Host "Done."