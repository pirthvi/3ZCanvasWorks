# Build a file://-friendly JavaScript bundle from editable JSON sources.
$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $PSScriptRoot).Path
$rootPrefix = $rootPath.TrimEnd('\') + '\'

function Read-JsonFile([string]$relativePath) {
  $path = Join-Path $rootPath $relativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing JSON source: $relativePath" }
  return ([System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json)
}

function Resolve-ProjectImage([string]$candidatePath, [string]$sourceLabel) {
  $candidatePath = [System.IO.Path]::GetFullPath($candidatePath)
  if (-not $candidatePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Image path must stay inside the project ($sourceLabel): $candidatePath"
  }
  $imageDirectory = Split-Path -Parent $candidatePath
  $imageStem = [System.IO.Path]::GetFileNameWithoutExtension($candidatePath)
  $formatPriority = @('.webp', '.avif', '.jpg', '.jpeg', '.png', '.apng', '.gif', '.bmp', '.ico', '.svg')
  $matches = @()
  if (Test-Path -LiteralPath $imageDirectory -PathType Container) {
    $matches = @(Get-ChildItem -LiteralPath $imageDirectory -File | Where-Object {
      $_.BaseName -ieq $imageStem -and $formatPriority -contains $_.Extension.ToLowerInvariant()
    })
  }
  if ($matches.Count -gt 0) {
    $path = ($matches | Sort-Object { [array]::IndexOf($formatPriority, $_.Extension.ToLowerInvariant()) } | Select-Object -First 1).FullName
  } elseif (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
    $path = $candidatePath
  } else {
    throw "Missing image for $sourceLabel. Add a browser image with this filename: $imageStem (.webp, .avif, .jpg, .jpeg, .png, .apng, .gif, .bmp, .ico, or .svg)."
  }
  $path = (Resolve-Path -LiteralPath $path).Path
  if (-not $path.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Image path must stay inside the project ($sourceLabel): $candidatePath"
  }
  return $path
}

function Get-ProjectImage([string]$relativePath, [string]$sourceLabel) {
  return Resolve-ProjectImage (Join-Path $rootPath $relativePath) $sourceLabel
}

function Get-ProjectImageUrl([string]$relativePath, [string]$sourceLabel) {
  $path = Get-ProjectImage $relativePath $sourceLabel
  return $path.Substring($rootPrefix.Length).Replace('\', '/')
}

$config = Read-JsonFile 'content/site.json'
$pages = [ordered]@{}
Get-ChildItem -LiteralPath (Join-Path $rootPath 'content/pages') -Filter '*.json' -File | Sort-Object Name | ForEach-Object {
  $pages[$_.BaseName] = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
}

$categoryFiles = Read-JsonFile 'content/categories/index.json'
$categories = @(
  foreach ($relativePath in $categoryFiles) {
    $category = Read-JsonFile ("content/categories/{0}" -f [string]$relativePath)
    $category.home.image = Get-ProjectImageUrl ([string]$category.home.image) "$($category.name) carousel image"
    $category.bannerImage = Get-ProjectImageUrl ([string]$category.bannerImage) "$($category.name) category banner"
    $category
  }
)
$config.logoImage = Get-ProjectImageUrl ([string]$config.logoImage) 'site logo'
$config.footerLogoImage = Get-ProjectImageUrl ([string]$config.footerLogoImage) 'footer logo'
$config.faviconImage = Get-ProjectImageUrl ([string]$config.faviconImage) 'site favicon'

$productFiles = Read-JsonFile 'products/index.json'
$products = @(
  foreach ($relativePath in $productFiles) {
    $productPath = (Resolve-Path -LiteralPath (Join-Path $rootPath ([string]$relativePath))).Path
    if (-not $productPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Product JSON must stay inside the project: $relativePath"
    }
    $product = [System.IO.File]::ReadAllText($productPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    $imagePath = Resolve-ProjectImage (Join-Path (Split-Path -Parent $productPath) ([string]$product.image)) "product $($product.name)"
    $product | Add-Member -NotePropertyName imageUrl -NotePropertyValue ($imagePath.Substring($rootPrefix.Length).Replace('\', '/')) -Force
    $product
  }
)

$configJson = ConvertTo-Json -InputObject $config -Depth 50 -Compress
$pagesJson = ConvertTo-Json -InputObject $pages -Depth 50 -Compress
$categoriesJson = ConvertTo-Json -InputObject @($categories) -Depth 50 -Compress
$productsJson = ConvertTo-Json -InputObject @($products) -Depth 50 -Compress
$source = @"
// Generated from content/*.json and products/**/*.json. Edit the JSON sources, then rebuild this file.
window.SHOP_CONFIG = $configJson;
window.SITE_CONTENT = $pagesJson;
window.SITE_CATEGORIES = $categoriesJson;
window.STORE_PRODUCTS = $productsJson;
"@
[System.IO.File]::WriteAllText((Join-Path $rootPath 'site-data.js'), $source, [System.Text.UTF8Encoding]::new($false))
Write-Host "Generated site-data.js from $($pages.Count) page files, $($categories.Count) categories, and $($products.Count) products."
