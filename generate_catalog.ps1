# Backward-compatible entry point. The full static data bundle includes site copy and products.
& (Join-Path $PSScriptRoot 'generate_site_data.ps1')
