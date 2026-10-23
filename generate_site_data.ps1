# Build the file://-friendly data bundle, indexable static routes, and sitemap from JSON sources.
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

$siteUrl = ([string]$config.siteUrl).TrimEnd('/')
if (-not $siteUrl.StartsWith('https://', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Set content/site.json siteUrl to the public HTTPS website address before generating SEO pages.'
}

function Html([object]$value) {
  return [System.Net.WebUtility]::HtmlEncode([string]$value)
}

function Absolute-SiteUrl([string]$path) {
  return "$siteUrl/$($path.TrimStart('/'))"
}

function Json-Ld([object]$data) {
  $json = ConvertTo-Json -InputObject $data -Depth 50 -Compress
  return $json.Replace('</script', '<\/script')
}

function Write-SearchPage([string]$relativePath, [string]$page, [string]$title, [string]$description, [string]$canonical, [string]$image, [string]$bodyAttributes, [string]$mainHtml, [object]$schema) {
  $safeTitle = Html $title
  $safeDescription = Html $description
  $safeCanonical = Html $canonical
  $safeImage = Html $image
  $safeLanguage = Html ([string]$config.htmlLanguage)
  $safeTheme = Html ([string]$config.themeColor)
  $safeIcon = Html ([string]$config.faviconImage)
  $safeVerification = Html ([string]$config.googleSiteVerification)
  $verificationMeta = if ($safeVerification) { "    <meta name=`"google-site-verification`" content=`"$safeVerification`" />`n" } else { '' }
  $safeIconType = switch ([System.IO.Path]::GetExtension([string]$config.faviconImage).ToLowerInvariant()) {
    '.png' { 'image/png'; break }
    '.jpg' { 'image/jpeg'; break }
    '.jpeg' { 'image/jpeg'; break }
    '.webp' { 'image/webp'; break }
    default { 'image/svg+xml' }
  }
  $schemaJson = Json-Ld $schema
  $html = @"
<!doctype html>
<html lang="$safeLanguage">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="$safeTheme" />
    <meta name="description" content="$safeDescription" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    $verificationMeta<link rel="canonical" href="$safeCanonical" />
    <meta property="og:site_name" content="$(Html ([string]$config.shopName))" />
    <meta property="og:title" content="$safeTitle" />
    <meta property="og:description" content="$safeDescription" />
    <meta property="og:type" content="$(if ($page -eq 'product') { 'product' } else { 'website' })" />
    <meta property="og:url" content="$safeCanonical" />
    <meta property="og:image" content="$safeImage" />
    <meta name="twitter:card" content="summary_large_image" />
    <title>$safeTitle</title>
    <link rel="icon" type="$safeIconType" href="$safeIcon" />
    <link rel="stylesheet" href="store.css" />
    <script type="application/ld+json">$schemaJson</script>
  </head>
  <body $bodyAttributes>
    <div id="site-header"></div>
    <main id="page-main">$mainHtml</main>
    <div id="site-footer"></div>
    <div class="toast" role="status" aria-live="polite"></div>
    <script src="site-data.js"></script>
    <script src="store.js" defer></script>
  </body>
</html>
"@
  $targetPath = Join-Path $rootPath $relativePath
  [System.IO.File]::WriteAllText($targetPath, $html, [System.Text.UTF8Encoding]::new($false))
}

$homePageData = $pages.home
$homeUrl = "$siteUrl/"
$homeImage = Absolute-SiteUrl ([string]$categories[0].home.image)
$homeCategories = @(
  foreach ($category in $categories) {
    $categoryHref = "category-$($category.slug).html"
    "<a class=`"category-tile`" href=`"$(Html $categoryHref)`"><img src=`"$(Html $category.home.image)`" alt=`"$(Html $category.home.imageAlt)`" /><span class=`"category-tile-copy`"><strong>$(Html $category.name)</strong><span>$(Html $homePageData.collections.tileAction)</span></span></a>"
  }
) -join "`n"
$featuredProducts = @($products | Where-Object { $_.featured } | Select-Object -First 4)
$homeProducts = @(
  foreach ($product in $featuredProducts) {
    $productHref = "product-$($product.id).html"
    $priceText = ([decimal]$product.price).ToString('N0', [System.Globalization.CultureInfo]::GetCultureInfo('en-US'))
    "<article class=`"product-card`"><a class=`"product-card-image`" href=`"$(Html $productHref)`"><img src=`"$(Html $product.imageUrl)`" alt=`"$(Html $product.imageAlt)`" /></a><div class=`"product-card-content`"><a class=`"product-card-title`" href=`"$(Html $productHref)`">$(Html $product.name)</a><p class=`"product-card-desc`">$(Html $product.description)</p><strong>$(Html $config.currency) $priceText</strong></div></article>"
  }
) -join "`n"
$homeFallback = @"
<section class="home-hero"><div class="hero-copy"><p class="kicker">$(Html $config.shopName)</p><h1>$(Html $homePageData.meta.title)</h1><p>$(Html $homePageData.meta.description)</p><a class="button button-brown" href="#collections">$(Html $homePageData.collections.kicker)</a></div></section>
<section class="collections section-wrap" id="collections"><div class="section-heading"><h2>$(Html $homePageData.collections.heading) $(Html $homePageData.collections.headingAccent)</h2></div><div class="category-grid">$homeCategories</div></section>
<section class="home-products section-wrap"><div class="section-heading"><h2>$(Html $homePageData.popular.title)</h2></div><div class="product-grid">$homeProducts</div></section>
"@
$organization = [ordered]@{
  '@type' = 'Organization'
  '@id' = "$siteUrl/#organization"
  name = [string]$config.shopName
  url = $homeUrl
  logo = Absolute-SiteUrl ([string]$config.logoImage)
  areaServed = 'Pakistan'
  contactPoint = @{ '@type' = 'ContactPoint'; telephone = [string]$config.whatsappNumber; contactType = 'sales'; areaServed = 'PK' }
}
$website = [ordered]@{ '@type' = 'WebSite'; '@id' = "$siteUrl/#website"; name = [string]$config.shopName; url = $homeUrl; publisher = @{ '@id' = "$siteUrl/#organization" }; inLanguage = [string]$config.htmlLanguage }
$homeSchema = @{ '@context' = 'https://schema.org'; '@graph' = @($organization, $website) }
Write-SearchPage 'index.html' 'home' ([string]$homePageData.meta.title) ([string]$homePageData.meta.description) $homeUrl $homeImage 'data-page="home"' $homeFallback $homeSchema

$sitemapUrls = [System.Collections.Generic.List[string]]::new()
$sitemapUrls.Add($homeUrl)
foreach ($category in $categories) {
  $categoryUrl = Absolute-SiteUrl "category-$($category.slug).html"
  $categoryProducts = @($products | Where-Object { $_.category -eq $category.name })
  $categoryCards = @(
    foreach ($product in $categoryProducts) {
      $productHref = "product-$($product.id).html"
      $priceText = ([decimal]$product.price).ToString('N0', [System.Globalization.CultureInfo]::GetCultureInfo('en-US'))
      "<article class=`"product-card`"><a class=`"product-card-image`" href=`"$(Html $productHref)`"><img src=`"$(Html $product.imageUrl)`" alt=`"$(Html $product.imageAlt)`" /></a><div class=`"product-card-content`"><a class=`"product-card-title`" href=`"$(Html $productHref)`">$(Html $product.name)</a><p class=`"product-card-desc`">$(Html $product.description)</p><strong>$(Html $config.currency) $priceText</strong></div></article>"
    }
  ) -join "`n"
  $categoryPage = $pages.category
  $categoryFallback = "<section class=`"category-hero`" style=`"--category-banner-image:url('$(Html $category.bannerImage)')`"><div class=`"breadcrumbs`"><a href=`"index.html`">$(Html $categoryPage.homeBreadcrumb)</a><span>&gt;</span>$(Html $category.name)</div><h1>$(Html $category.name)</h1><p>$(Html $category.description)</p></section><section class=`"category-products section-wrap`"><div class=`"product-grid`">$categoryCards</div></section>"
  $categoryTitle = ([string]$categoryPage.metaTitle).Replace('{category}', [string]$category.name).Replace('{shopName}', [string]$config.shopName)
  $categoryDescription = ([string]$categoryPage.metaDescription).Replace('{category}', [string]$category.name).Replace('{shopName}', [string]$config.shopName)
  $breadcrumb = @{ '@type' = 'BreadcrumbList'; itemListElement = @(@{ '@type' = 'ListItem'; position = 1; name = [string]$categoryPage.homeBreadcrumb; item = $homeUrl }, @{ '@type' = 'ListItem'; position = 2; name = [string]$category.name; item = $categoryUrl }) }
  $itemList = @(
    for ($index = 0; $index -lt $categoryProducts.Count; $index++) {
      $product = $categoryProducts[$index]
      @{ '@type' = 'ListItem'; position = $index + 1; name = [string]$product.name; url = (Absolute-SiteUrl "product-$($product.id).html") }
    }
  )
  $collectionSchema = @{ '@context' = 'https://schema.org'; '@graph' = @(@{ '@type' = 'CollectionPage'; name = [string]$category.name; description = [string]$category.description; url = $categoryUrl; mainEntity = @{ '@type' = 'ItemList'; itemListElement = $itemList } }, $breadcrumb) }
  Write-SearchPage "category-$($category.slug).html" 'category' $categoryTitle $categoryDescription $categoryUrl (Absolute-SiteUrl ([string]$category.bannerImage)) "data-page=`"category`" data-category-slug=`"$(Html $category.slug)`"" $categoryFallback $collectionSchema
  $sitemapUrls.Add($categoryUrl)
}

foreach ($product in $products) {
  $productUrl = Absolute-SiteUrl "product-$($product.id).html"
  $category = $categories | Where-Object { $_.name -eq $product.category } | Select-Object -First 1
  $productPage = $pages.product
  $productTitle = ([string]$productPage.metaTitle).Replace('{product}', [string]$product.name).Replace('{shopName}', [string]$config.shopName)
  $productDescription = [string]$product.description
  $productImage = Absolute-SiteUrl ([string]$product.imageUrl)
  $priceText = ([decimal]$product.price).ToString('N0', [System.Globalization.CultureInfo]::GetCultureInfo('en-US'))
  $orderMessage = ([string]$productPage.whatsappOrderTemplate).Replace('{product}', [string]$product.name).Replace('{quantity}', '1').Replace('{price}', "$($config.currency) $priceText")
  $waMessage = [System.Uri]::EscapeDataString($orderMessage)
  $productFallback = "<section class=`"pdp section-wrap`"><div class=`"breadcrumbs`"><a href=`"index.html`">$(Html $productPage.homeBreadcrumb)</a><span>&gt;</span><a href=`"category-$($category.slug).html`">$(Html $product.category)</a></div><div class=`"pdp-layout`"><div class=`"pdp-image`"><img src=`"$(Html $product.imageUrl)`" alt=`"$(Html $product.imageAlt)`" /></div><div class=`"pdp-info`"><p class=`"kicker`">$(Html $product.category)</p><h1>$(Html $product.name)</h1><p class=`"pdp-price`">$(Html $config.currency) $priceText</p><p class=`"pdp-description`">$(Html $product.description)</p><p>$(Html $product.details)</p><a class=`"button button-whatsapp`" href=`"https://wa.me/$($config.whatsappNumber -replace '\D','')?text=$waMessage`">$(Html $productPage.orderOnWhatsApp)</a></div></div></section>"
  $productCrumb = @{ '@type' = 'BreadcrumbList'; itemListElement = @(@{ '@type' = 'ListItem'; position = 1; name = [string]$productPage.homeBreadcrumb; item = $homeUrl }, @{ '@type' = 'ListItem'; position = 2; name = [string]$category.name; item = (Absolute-SiteUrl "category-$($category.slug).html") }, @{ '@type' = 'ListItem'; position = 3; name = [string]$product.name; item = $productUrl }) }
  $offer = @{ '@type' = 'Offer'; url = $productUrl; priceCurrency = [string]$config.currency; price = [string]$product.price; seller = @{ '@type' = 'Organization'; name = [string]$config.shopName } }
  $productEntity = [ordered]@{ '@type' = 'Product'; name = [string]$product.name; description = $productDescription; image = @($productImage); brand = @{ '@type' = 'Brand'; name = [string]$config.shopName }; offers = $offer }
  if (-not [string]::IsNullOrWhiteSpace([string]$product.sku)) { $productEntity.sku = [string]$product.sku }
  $productSchema = @{ '@context' = 'https://schema.org'; '@graph' = @($productEntity, $productCrumb) }
  Write-SearchPage "product-$($product.id).html" 'product' $productTitle $productDescription $productUrl $productImage "data-page=`"product`" data-product-id=`"$(Html $product.id)`"" $productFallback $productSchema
  $sitemapUrls.Add($productUrl)
}

$today = [System.DateTime]::UtcNow.ToString('yyyy-MM-dd')
$urlXml = @(
  foreach ($url in $sitemapUrls) {
    "  <url><loc>$([System.Security.SecurityElement]::Escape($url))</loc><lastmod>$today</lastmod></url>"
  }
) -join "`n"
$sitemap = "<?xml version=`"1.0`" encoding=`"UTF-8`"?>`n<urlset xmlns=`"http://www.sitemaps.org/schemas/sitemap/0.9`">`n$urlXml`n</urlset>`n"
[System.IO.File]::WriteAllText((Join-Path $rootPath 'sitemap.xml'), $sitemap, [System.Text.UTF8Encoding]::new($false))
$robots = "User-agent: *`nAllow: /`nSitemap: $siteUrl/sitemap.xml`n"
[System.IO.File]::WriteAllText((Join-Path $rootPath 'robots.txt'), $robots, [System.Text.UTF8Encoding]::new($false))
Write-Host "Generated $($sitemapUrls.Count) crawlable pages, sitemap.xml, and robots.txt for $siteUrl."
