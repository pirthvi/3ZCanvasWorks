# 3Z Canvas Works

A static ecommerce website inspired by the supplied reference: parchment and light camel colours, dark brown text, antique gold trim, and canvas product imagery. It opens directly in a browser; no Python, web server, or hosting platform is needed for local use.

## Open the site

Open `index.html` in a browser. After editing any JSON source, double-click `Update Site Data.bat`, then reopen or refresh the page.

The browser reads the generated `site-data.js` bundle. The editable source of all site copy and settings stays in JSON. Generating the bundle keeps the site compatible with `file://` browsing, where browsers block JavaScript from fetching local JSON files.

## Google Search

The update script also generates a separate static HTML page for every category and product, adds canonical URLs and product structured data, and writes `robots.txt` and `sitemap.xml` in the website root. Product and category pages include readable content in their initial HTML so search crawlers do not have to rely only on JavaScript.

Before deploying:

1. In `content/site.json`, set `siteUrl` to the exact public HTTPS address you want Google to index. It currently uses the Cloudflare Workers URL from the project setup. If you connect a custom domain, use that domain instead.
2. Double-click `Update Site Data.bat` to rebuild the static routes and sitemap, then push the generated files and wait for Cloudflare to deploy them.
3. Add the public site to Google Search Console. Put its HTML verification token in `googleSiteVerification` in `content/site.json`, rebuild and deploy, then finish verification in Search Console. With a custom domain, DNS TXT verification is another option.
4. Submit `https://YOUR-SITE/sitemap.xml` in Search Console and use URL Inspection to request crawling for the home page and a few product pages.
5. Replace all sample product details with accurate product names, descriptions, specifications, prices, and images before requesting indexing.

Google decides which pages to index and where they rank; a sitemap and Search Console submission help discovery but cannot guarantee a listing or position.

## Where to edit content

- `content/site.json`: shop name, logo paths, WhatsApp number, currency, announcement, header, footer, and shared labels.
- `content/pages/home.json`: homepage headings, carousel controls, collection section, popular products, search messages, and WhatsApp callout.
- `content/pages/category.json`, `product.json`, `cart.json`, `checkout.json`, `confirmation.json`, and `errors.json`: copy used by those pages.
- `content/categories/<category>.json`: category name, slug, listing-page description/banner, and homepage carousel title, description, note, and image.
- `products/<category>/<product>/product.json`: one product’s name, price, category, description, specifications, SKU, featured status, and image path.

`content/categories/index.json` controls category order. `products/index.json` lists products and controls product order. Add a new JSON product to its category folder and add its path to that product index.

## Image folders

- `assets/images/brand/`: header/footer logo and favicon.
- `assets/images/home/`: homepage carousel and category-tile artwork.
- `assets/images/categories/<category-slug>/`: each category’s own banner image (`banner.svg` by default).
- `assets/images/products/<category>/`: individual product images used by both the product listing card and product detail page.
- `assets/images/shared/`: ornamental frame used across pages.

Image paths in JSON identify the image by its filename; the update script finds that filename with a supported browser image extension. You can replace `heavy-duty-canvas-bag.svg` with `heavy-duty-canvas-bag.jpg` in the same folder and leave the JSON unchanged. Supported formats include JPG/JPEG, PNG, WebP, AVIF, APNG, GIF, BMP, ICO, and SVG. If more than one format with the same filename is present, the script prefers WebP, AVIF, JPG, JPEG, PNG, APNG, GIF, BMP, ICO, then SVG. To choose a specific format, keep only that file with the image’s filename.

Product image files live under `assets/images/products/<category>/`; their JSON image paths are relative to that product’s folder. Category banner and logo paths in content JSON are relative to the project root. Replace a category’s `banner.svg` with `banner.jpg` or `banner.webp` in that category’s folder; the JSON can stay unchanged. After replacing an image, double-click `Update Site Data.bat` so the static bundle points to the selected file.

For category banners, use a wide landscape image around **1920 × 600 px** (minimum **1200 × 375 px**). The category hero uses `cover`, so it crops the image differently on desktop and mobile. Keep the main subject near the centre, leave the left side relatively uncluttered because category text overlays it, and do not include text or a logo in the image.

Keep the homepage image subject near the centre because carousel slides and category tiles crop the image to different shapes. A product uses one main image on both its card and detail page.

## Orders

Checkout downloads an order JSON file to the shopper’s device and opens WhatsApp with the order details. The shopper must press **Send**. A static website cannot save new order files into the hosted site folder; central order storage requires a backend or connected order service.
