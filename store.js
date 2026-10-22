(() => {
  "use strict";

  const config = window.SHOP_CONFIG || {};
  const content = window.SITE_CONTENT || {};
  const categories = window.SITE_CATEGORIES || [];
  let products = window.STORE_PRODUCTS || [];
  let cartWasPlaced = false;
  const page = document.body.dataset.page;
  const main = document.querySelector("#page-main");
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const CART_KEY = "3z-canvas-cart-v2";
  const ORDERS_KEY = "3z-canvas-orders-v1";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }
  function format(value, values = {}) {
    return String(value ?? "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => String(values[key] ?? ""));
  }
  function text(value, values = {}) { return escapeHtml(format(value, values)); }
  function assetUrl(path) { return new URL(String(path || ""), document.baseURI).href; }
  function categoryBySlug(slug) { return categories.find((category) => category.slug === slug); }
  function categoryHref(category) {
    const item = typeof category === "string" ? categories.find((entry) => entry.name === category) : category;
    return item ? withCart(`category.html?category=${encodeURIComponent(item.slug)}`) : withCart("index.html");
  }
  function productHref(product) { return withCart(`product.html?id=${encodeURIComponent(product.id)}`); }
  function encodePayload(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  function decodePayload(value) {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  function packCart(cart) { try { return encodePayload(JSON.stringify(cart)); } catch { return ""; } }
  function withCart(href) {
    const url = new URL(href, location.href);
    const encoded = packCart(readCart());
    if (encoded) url.searchParams.set("cart", encoded);
    return `${url.pathname.split("/").pop()}${url.search}${url.hash}`;
  }
  function money(value) {
    try {
      return new Intl.NumberFormat(config.locale, {
        style: "currency", currency: config.currency, maximumFractionDigits: 0
      }).format(Number(value) || 0);
    } catch {
      return `${config.currency} ${(Number(value) || 0).toLocaleString(config.locale)}`;
    }
  }
  function readCart() {
    if (cartWasPlaced) return {};
    const fromUrl = new URLSearchParams(location.search).get("cart");
    if (fromUrl) {
      try { const cart = JSON.parse(decodePayload(fromUrl)); if (cart && typeof cart === "object") return cart; }
      catch { /* Use browser storage if a cart link was edited. */ }
    }
    try { const value = JSON.parse(localStorage.getItem(CART_KEY) || "{}"); return value && typeof value === "object" ? value : {}; }
    catch { return {}; }
  }
  function saveCart(cart) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* URL-based cart links still work from a local file. */ }
    let urlWasUpdated = false;
    try {
      const url = new URL(location.href); const packed = packCart(cart);
      if (packed) url.searchParams.set("cart", packed); else url.searchParams.delete("cart");
      history.replaceState(null, "", url.href);
      urlWasUpdated = new URL(location.href).searchParams.get("cart") === packed;
    } catch { /* Some browsers restrict history updates for local files. */ }
    if (!urlWasUpdated) {
      try { const url = new URL(location.href); url.searchParams.set("cart", packCart(cart)); location.href = url.href; } catch { /* Browser storage remains available where supported. */ }
      return;
    }
    synchronizeCartLinks();
  }
  function synchronizeCartLinks() {
    const packed = packCart(readCart());
    $$('a[href]').forEach((link) => {
      const current = link.getAttribute("href") || "";
      if (/^(?:https?:|mailto:|tel:|#|javascript:)/i.test(current)) return;
      try {
        const url = new URL(current, location.href);
        if (!url.pathname.toLowerCase().endsWith(".html")) return;
        if (packed) url.searchParams.set("cart", packed); else url.searchParams.delete("cart");
        link.setAttribute("href", `${url.pathname.split("/").pop()}${url.search}${url.hash}`);
      } catch { /* Keep the existing href if this browser cannot resolve file URLs. */ }
    });
    const hiddenCart = $('input[name="cart"]');
    if (hiddenCart) hiddenCart.value = packed;
  }
  function cartItems() {
    const cart = readCart();
    return Object.entries(cart).map(([id, quantity]) => {
      const product = products.find((item) => item.id === id);
      return product ? { product, quantity: Math.max(1, Number(quantity) || 1) } : null;
    }).filter(Boolean);
  }
  function total(items = cartItems()) { return items.reduce((sum, item) => sum + item.product.price * item.quantity, 0); }
  function itemCount() { return cartItems().reduce((sum, item) => sum + item.quantity, 0); }
  function showToast(message) {
    const toast = $(".toast"); if (!toast) return;
    toast.textContent = message; toast.classList.add("is-visible");
    clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }
  function setPageMetadata(title, description) {
    document.title = title;
    const descriptionTag = $('meta[name="description"]');
    const themeTag = $('meta[name="theme-color"]');
    const iconTag = $('link[rel="icon"]');
    if (descriptionTag) descriptionTag.content = description || "";
    if (themeTag) themeTag.content = config.themeColor || "";
    if (iconTag) iconTag.href = assetUrl(config.faviconImage);
    document.documentElement.lang = config.htmlLanguage || "en";
  }

  function header() {
    const copy = config.header;
    const categoryLinks = categories.map((category) => `<a href="${categoryHref(category)}">${text(category.name)}</a>`).join("");
    const count = itemCount();
    const announcementText = text(config.announcement, { whatsappNumber: config.whatsappNumber });
    const whatsappHref = `https://wa.me/${String(config.whatsappNumber).replace(/\D/g, "")}`;
    $("#site-header").innerHTML = `<div class="announcement"><a class="announcement-link" href="${whatsappHref}" target="_blank" rel="noopener noreferrer" aria-label="${announcementText}"><span class="announcement-track"><span class="announcement-item"><span class="announcement-dot" aria-hidden="true"></span>${announcementText}</span><span class="announcement-item" aria-hidden="true"><span class="announcement-dot"></span>${announcementText}</span></span></a></div>
      <header class="site-header"><a class="brand" href="${withCart("index.html")}" aria-label="${text(copy.homeLinkLabel, { shopName: config.shopName })}"><img class="brand-logo" src="${escapeHtml(assetUrl(config.logoImage))}" alt="${escapeHtml(config.shopName)}" /></a>
      <button class="mobile-menu-toggle" type="button" aria-expanded="false" aria-label="${text(copy.openMenu)}"><span></span><span></span></button>
      <nav class="main-nav" aria-label="${text(copy.categoryNavigationLabel)}"><a href="${withCart("index.html#collections")}">${text(copy.allCategories)}</a>${categoryLinks}</nav>
      <div class="header-tools"><form class="header-search" action="index.html" role="search"><input type="hidden" name="cart" value="${escapeHtml(packCart(readCart()))}" /><input name="search" type="search" placeholder="${text(copy.searchPlaceholder)}" aria-label="${text(copy.searchLabel)}" /><button type="submit" aria-label="${text(copy.searchLabel)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.4"></circle><path d="m16 16 4.2 4.2"></path></svg></button></form><a class="cart-link" href="${withCart("cart.html")}" aria-label="${text(copy.cartAriaLabel, { count })}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z"></path><path d="M9 9V6a3 3 0 0 1 6 0v3"></path></svg><span class="cart-count" aria-hidden="true">${count}</span></a></div></header>`;
    const toggle = $(".mobile-menu-toggle");
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? copy.closeMenu : copy.openMenu);
      $(".main-nav").classList.toggle("is-open", open);
    });
  }
  function footer() {
    const copy = config.footer;
    const email = config.contactEmail ? `<a href="mailto:${escapeHtml(config.contactEmail)}">${escapeHtml(config.contactEmail)}</a>` : "";
    $("#site-footer").innerHTML = `<footer class="site-footer"><div class="footer-inner"><div><a class="brand footer-brand" href="${withCart("index.html")}" aria-label="${text(config.header.homeLinkLabel, { shopName: config.shopName })}"><img class="brand-logo" src="${escapeHtml(assetUrl(config.footerLogoImage || config.logoImage))}" alt="${escapeHtml(config.shopName)}" /></a><p>${text(config.tagline)}</p></div><div class="footer-nav"><strong>${text(copy.categoriesHeading)}</strong>${categories.map((category) => `<a href="${categoryHref(category)}">${text(category.name)}</a>`).join("")}</div><div class="footer-contact"><strong>${text(copy.helpHeading)}</strong><p>${text(copy.helpText)}</p><a class="footer-whatsapp" href="https://wa.me/${String(config.whatsappNumber).replace(/\D/g, "")}" target="_blank" rel="noopener noreferrer">${text(copy.whatsappLink)} <span aria-hidden="true">↗</span></a>${email}</div></div><div class="footer-bottom"><span>${text(copy.copyright, { year: new Date().getFullYear(), shopName: config.shopName })}</span><span>${text(copy.orderNote)}</span></div></footer>`;
  }
  function updateCartBadge() {
    const count = itemCount(); const badge = $(".cart-count"); const link = $(".cart-link");
    if (badge) badge.textContent = count;
    if (link) link.setAttribute("aria-label", format(config.header.cartAriaLabel, { count }));
  }
  function productCard(product) {
    return `<article class="product-card"><a class="product-card-image" href="${productHref(product)}"><img src="${escapeHtml(assetUrl(product.imageUrl))}" alt="${escapeHtml(product.imageAlt || product.name)}" loading="lazy" /><span class="image-label">${text(product.category)}</span></a><div class="product-card-content"><a class="product-card-title" href="${productHref(product)}">${text(product.name)}</a><p class="product-card-desc">${text(product.description)}</p><div class="product-card-buy"><strong>${money(product.price)}</strong><button type="button" data-add="${escapeHtml(product.id)}" class="add-button">${text(config.productCard.addToCart)} <span aria-hidden="true">＋</span></button></div></div></article>`;
  }
  function wireAddButtons(root = document) {
    $$('[data-add]', root).forEach((button) => button.addEventListener("click", () => {
      const cart = readCart(); cart[button.dataset.add] = (Number(cart[button.dataset.add]) || 0) + 1;
      saveCart(cart); updateCartBadge(); showToast(config.productCard.addedToCart);
    }));
  }
  function categoryTiles(copy) {
    return categories.map((category, index) => `<a class="category-tile category-tile-${index + 1}" href="${categoryHref(category)}"><img src="${escapeHtml(assetUrl(category.home.image))}" alt="${escapeHtml(category.home.imageAlt)}" loading="lazy" /><span class="tile-shade"></span><span class="category-tile-copy"><small>${text(copy.tileCount, { number: String(index + 1).padStart(2, "0") })}</small><strong>${text(category.name)}</strong><span>${text(copy.tileAction)} <span aria-hidden="true">↗</span></span></span></a>`).join("");
  }
  function initCarousel() {
    const carousel = $(".home-hero");
    const slides = $$(".carousel-slide", carousel);
    const dots = $$(".carousel-dot", carousel);
    if (slides.length < 2) return;
    let active = 0;
    let timer = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function showSlide(index) {
      active = (index + slides.length) % slides.length;
      slides.forEach((slide, position) => {
        const selected = position === active;
        slide.classList.toggle("is-active", selected);
        slide.setAttribute("aria-hidden", String(!selected));
      });
      dots.forEach((dot, position) => {
        const selected = position === active;
        dot.classList.toggle("is-active", selected);
        dot.setAttribute("aria-pressed", String(selected));
      });
    }
    function stop() { if (timer) clearInterval(timer); timer = null; }
    function start() {
      if (reducedMotion || timer || document.hidden) return;
      timer = setInterval(() => showSlide(active + 1), 6000);
    }
    $$('[data-direction]', carousel).forEach((button) => button.addEventListener("click", () => {
      showSlide(active + Number(button.dataset.direction)); stop(); start();
    }));
    dots.forEach((dot) => dot.addEventListener("click", () => { showSlide(Number(dot.dataset.goTo)); stop(); start(); }));
    carousel.addEventListener("mouseenter", stop);
    carousel.addEventListener("mouseleave", start);
    carousel.addEventListener("focusin", stop);
    carousel.addEventListener("focusout", (event) => { if (!carousel.contains(event.relatedTarget)) start(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else start(); });
    start();
  }
  function renderHome() {
    const copy = content.home;
    const query = new URLSearchParams(location.search).get("search") || "";
    const matching = query ? products.filter((product) => `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query.toLowerCase())) : products;
    const productSection = query
      ? `<section class="home-products section-wrap" id="products"><div class="section-heading"><div><p class="kicker">${text(copy.search.headingTemplate, { query })}</p><h2>${text(copy.search.title)}</h2></div><a class="text-link" href="${withCart("index.html#collections")}">${text(copy.search.browseCategories)} <span aria-hidden="true">↗</span></a></div><div class="product-grid">${matching.length ? matching.map(productCard).join("") : `<p class="empty-message">${text(copy.search.empty)}</p>`}</div></section>`
      : `<section class="home-products section-wrap" id="products"><div class="section-heading"><div><p class="kicker">${text(copy.popular.kicker)}</p><h2>${text(copy.popular.title)}</h2></div><a class="text-link" href="#collections">${text(copy.popular.browse)} <span aria-hidden="true">↗</span></a></div><div class="product-grid">${products.filter((product) => product.featured).map(productCard).join("")}</div></section>`;
    const slides = categories.map((category, index) => {
      const slide = category.home;
      const number = String(index + 1).padStart(2, "0");
      const note = (slide.noteLines || []).map(textLine => escapeHtml(textLine)).join("<br />");
      return `<article class="carousel-slide${index === 0 ? " is-active" : ""}" data-slide="${index}" role="group" aria-roledescription="slide" aria-label="${text(copy.carousel.slideLabel, { number: index + 1, total: categories.length, category: category.name })}" aria-hidden="${index === 0 ? "false" : "true"}"><div class="hero-copy"><p class="kicker"><span></span> ${text(copy.carousel.counter, { number, category: category.name })}</p><h1>${text(slide.title)}<br /><em>${text(slide.accent)}</em></h1><p>${text(slide.description)}</p><a class="button button-brown" href="${categoryHref(category)}">${text(copy.carousel.shopButtonTemplate, { category: category.name })} <span aria-hidden="true">↗</span></a><div class="hero-meta"><span>${text(slide.meta)}</span><i></i><span>${text(copy.carousel.customOrders)}</span></div></div><div class="hero-visual"><img src="${escapeHtml(assetUrl(slide.image))}" alt="${escapeHtml(slide.imageAlt)}" /><div class="hero-note"><span>${note}</span><b aria-hidden="true">✳</b></div><span class="hero-vertical">${text(config.shopName)} · ${text(config.tagline)}</span></div></article>`;
    }).join("");
    const dots = categories.map((category, index) => `<button type="button" class="carousel-dot${index === 0 ? " is-active" : ""}" data-go-to="${index}" aria-label="${text(copy.carousel.dotLabel, { category: category.name })}" aria-pressed="${index === 0 ? "true" : "false"}"></button>`).join("");
    main.innerHTML = `<section class="home-hero" aria-label="${text(copy.carousel.ariaLabel)}"><div class="carousel-track">${slides}</div><div class="carousel-controls"><button type="button" class="carousel-arrow" data-direction="-1" aria-label="${text(copy.carousel.previous)}">‹</button><div class="carousel-dots">${dots}</div><button type="button" class="carousel-arrow" data-direction="1" aria-label="${text(copy.carousel.next)}">›</button></div><div class="hero-bottom-line"><span>${text(copy.carousel.bottomLeft)}</span><span>${text(copy.carousel.bottomRight)} ↓</span></div></section>
      <section class="collections section-wrap" id="collections"><div class="section-heading"><div><p class="kicker">${text(copy.collections.kicker)}</p><h2>${text(copy.collections.heading)} <em>${text(copy.collections.headingAccent)}</em></h2></div><p>${text(copy.collections.description)}</p></div><div class="category-grid">${categoryTiles(copy.collections)}</div></section>${productSection}<section class="whatsapp-band"><div class="whatsapp-icon" aria-hidden="true">↗</div><div><p class="kicker">${text(copy.whatsappBand.kicker)}</p><h2>${text(copy.whatsappBand.title)}</h2><p>${text(copy.whatsappBand.description)}</p></div><a class="button button-light" href="https://wa.me/${String(config.whatsappNumber).replace(/\D/g, "")}" target="_blank" rel="noopener noreferrer">${text(copy.whatsappBand.button)} <span aria-hidden="true">↗</span></a></section>`;
    initCarousel();
    wireAddButtons(main);
  }
  function renderNotFound(kind) {
    const copy = content.errors;
    const categoryError = kind === "category";
    const title = categoryError ? copy.missingCategoryTitle : copy.missingProductTitle;
    const kicker = categoryError ? copy.missingCategoryKicker : copy.missingProductKicker;
    const link = categoryError ? copy.browseCategories : copy.continueShopping;
    main.innerHTML = `<section class="not-found"><p class="kicker">${text(kicker)}</p><h1>${text(title)}</h1><a class="button button-brown" href="${withCart("index.html#collections")}">${text(link)} <span aria-hidden="true">↗</span></a></section>`;
  }
  function renderCategory() {
    const copy = content.category;
    const category = categoryBySlug(new URLSearchParams(location.search).get("category") || "");
    if (!category) { setPageMetadata(format(copy.metaTitle, { category: "", shopName: config.shopName }), ""); renderNotFound("category"); return; }
    const list = products.filter((product) => product.category === category.name);
    setPageMetadata(format(copy.metaTitle, { category: category.name, shopName: config.shopName }), format(copy.metaDescription, { category: category.name, shopName: config.shopName }));
    main.innerHTML = `<section class="category-hero"><div class="breadcrumbs"><a href="${withCart("index.html")}">${text(copy.homeBreadcrumb)}</a><span aria-hidden="true">›</span><span>${text(category.name)}</span></div><div><p class="kicker">${text(copy.kickerTemplate, { number: String(categories.indexOf(category) + 1).padStart(2, "0") })}</p><h1>${text(category.name)}</h1><p>${text(category.description)}</p></div></section><section class="category-products section-wrap"><div class="listing-toolbar"><span>${list.length} ${text(list.length === 1 ? copy.itemSingular : copy.itemPlural)}</span><a href="${withCart("index.html#collections")}">${text(copy.allCategories)} <span aria-hidden="true">↗</span></a></div><div class="product-grid">${list.length ? list.map(productCard).join("") : `<div class="empty-message"><p>${text(copy.emptyTitle)}</p><p>${text(copy.emptyDescription)}</p></div>`}</div></section>`;
    const hero = $(".category-hero");
    hero.style.setProperty("--category-banner-image", `url("${assetUrl(category.bannerImage)}")`);
    wireAddButtons(main);
  }
  function renderProduct() {
    const copy = content.product;
    const product = products.find((item) => item.id === new URLSearchParams(location.search).get("id"));
    if (!product) { setPageMetadata(format(copy.metaTitle, { product: "", shopName: config.shopName }), ""); renderNotFound("product"); return; }
    setPageMetadata(format(copy.metaTitle, { product: product.name, shopName: config.shopName }), product.description);
    const category = categories.find((item) => item.name === product.category);
    const related = products.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 3);
    main.innerHTML = `<section class="pdp section-wrap"><div class="breadcrumbs"><a href="${withCart("index.html")}">${text(copy.homeBreadcrumb)}</a><span aria-hidden="true">›</span><a href="${categoryHref(category)}">${text(product.category)}</a><span aria-hidden="true">›</span><span>${text(product.name)}</span></div><div class="pdp-layout"><div class="pdp-image"><img src="${escapeHtml(assetUrl(product.imageUrl))}" alt="${escapeHtml(product.imageAlt || product.name)}" /></div><div class="pdp-info"><p class="kicker">${text(product.category)}${product.sku ? ` <span>${text(product.skuLabel || "")}${text(product.sku)}</span>` : ""}</p><h1>${text(product.name)}</h1><p class="pdp-price">${money(product.price)}</p><p class="pdp-description">${text(product.description)}</p><div class="pdp-specs"><span>${text(copy.detailsHeading)}</span><p>${text(product.details || copy.detailsFallback)}</p></div><p class="availability"><span></span>${text(copy.availability)}</p><div class="pdp-actions"><label class="quantity-select">${text(copy.quantityLabel)} <select id="pdp-quantity" aria-label="${text(copy.quantityLabel)}">${Array.from({ length: 10 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("")}</select></label><button class="button button-brown" type="button" id="pdp-add">${text(copy.addToCart)} <span aria-hidden="true">＋</span></button></div><a class="pdp-chat" href="https://wa.me/${String(config.whatsappNumber).replace(/\D/g, "")}?text=${encodeURIComponent(format(copy.whatsappQuestionTemplate, { product: product.name }))}" target="_blank" rel="noopener noreferrer">${text(copy.askAboutTemplate, { product: product.name })} <span aria-hidden="true">↗</span></a><div class="pdp-delivery"><strong>${text(copy.deliveryHeading)}</strong><p>${text(config.deliveryNote)} ${text(copy.paymentNote)}</p></div></div></div></section>${related.length ? `<section class="related-products section-wrap"><div class="section-heading"><div><p class="kicker">${text(copy.relatedKicker)}</p><h2>${text(copy.relatedHeading)}</h2></div></div><div class="product-grid">${related.map(productCard).join("")}</div></section>` : ""}`;
    $("#pdp-add").addEventListener("click", () => {
      const cart = readCart(); const quantity = Number($("#pdp-quantity").value) || 1;
      cart[product.id] = (Number(cart[product.id]) || 0) + quantity;
      saveCart(cart); updateCartBadge(); showToast(content.product.addedToCart || config.productCard.addedToCart);
    });
    wireAddButtons(main);
  }
  function renderCart() {
    const copy = content.cart;
    setPageMetadata(format(copy.metaTitle, { shopName: config.shopName }), copy.metaDescription);
    main.innerHTML = `<section class="page-heading section-wrap"><div class="breadcrumbs"><a href="${withCart("index.html")}">${text(copy.homeBreadcrumb)}</a><span aria-hidden="true">›</span><span>${text(copy.title)}</span></div><p class="kicker">${text(copy.kicker)}</p><h1>${text(copy.title)}</h1></section><section class="cart-page section-wrap" id="cart-content"></section>`;
    drawCart();
  }
  function drawCart(items = cartItems()) {
    const copy = content.cart;
    const target = $("#cart-content"); if (!target) return;
    if (!items.length) {
      target.innerHTML = `<div class="empty-cart"><span aria-hidden="true">✳</span><h2>${text(copy.emptyTitle)}</h2><p>${text(copy.emptyDescription)}</p><a class="button button-brown" href="${withCart("index.html#collections")}">${text(copy.browseCategories)} <span aria-hidden="true">↗</span></a></div>`;
      return;
    }
    target.innerHTML = `<div class="cart-layout"><div class="cart-items"><div class="cart-table-head"><span>${text(copy.tableProduct)}</span><span>${text(copy.tableQuantity)}</span><span>${text(copy.tableTotal)}</span></div>${items.map(({ product, quantity }) => `<article class="cart-row" data-id="${escapeHtml(product.id)}"><a class="cart-product" href="${productHref(product)}"><img src="${escapeHtml(assetUrl(product.imageUrl))}" alt="" /><span><small>${text(product.category)}</small><strong>${text(product.name)}</strong><em>${money(product.price)} ${text(copy.each)}</em></span></a><div class="quantity-control"><button data-change="-1" type="button" aria-label="${text(copy.decreaseQuantity)}">−</button><span>${quantity}</span><button data-change="1" type="button" aria-label="${text(copy.increaseQuantity)}">+</button></div><strong class="cart-line-total">${money(product.price * quantity)}</strong><button class="remove-line" type="button" data-remove aria-label="${text(copy.removeItem)} ${text(product.name)}">${text(copy.removeItem)}</button></article>`).join("")}</div><aside class="cart-summary"><p class="kicker">${text(copy.summaryKicker)}</p><h2>${text(copy.summaryTitle)}</h2><div class="summary-line"><span>${text(copy.subtotal)}</span><strong>${money(total(items))}</strong></div><p class="summary-note">${text(copy.shippingNote)}</p><a class="button button-brown button-wide" href="${withCart("checkout.html")}">${text(copy.checkoutButton)} <span aria-hidden="true">→</span></a><a class="continue-link" href="${withCart("index.html#collections")}">${text(copy.continueShopping)}</a></aside></div>`;
    $$('[data-change]', target).forEach((button) => button.addEventListener("click", () => {
      const row = button.closest("[data-id]"); const cart = readCart(); const next = (Number(cart[row.dataset.id]) || 0) + Number(button.dataset.change);
      if (next <= 0) delete cart[row.dataset.id]; else cart[row.dataset.id] = next;
      saveCart(cart); updateCartBadge(); drawCart();
    }));
    $$('[data-remove]', target).forEach((button) => button.addEventListener("click", () => {
      const cart = readCart(); delete cart[button.closest("[data-id]").dataset.id];
      saveCart(cart); updateCartBadge(); drawCart();
    }));
  }
  function renderCheckout() {
    const copy = content.checkout;
    const items = cartItems();
    setPageMetadata(format(copy.metaTitle, { shopName: config.shopName }), copy.metaDescription);
    main.innerHTML = `<section class="page-heading section-wrap"><div class="breadcrumbs"><a href="${withCart("index.html")}">${text(copy.homeBreadcrumb)}</a><span aria-hidden="true">›</span><a href="${withCart("cart.html")}">${text(copy.cartBreadcrumb)}</a><span aria-hidden="true">›</span><span>${text(copy.title)}</span></div><p class="kicker">${text(copy.kicker)}</p><h1>${text(copy.title)}</h1></section><section class="checkout-page section-wrap" id="checkout-content"></section>`;
    const target = $("#checkout-content");
    if (!items.length) {
      target.innerHTML = `<div class="empty-cart"><h2>${text(copy.emptyTitle)}</h2><p>${text(copy.emptyDescription)}</p><a class="button button-brown" href="${withCart("index.html#collections")}">${text(copy.browseCategories)} <span aria-hidden="true">↗</span></a></div>`;
      return;
    }
    target.innerHTML = `<div class="checkout-layout"><form class="customer-form" id="order-form"><p class="kicker">${text(copy.formKicker)}</p><h2>${text(copy.formTitle)}</h2><p class="form-note">${text(copy.formNote)}</p><label>${text(copy.fields.name)}<input name="name" autocomplete="name" required /></label><div class="form-grid"><label>${text(copy.fields.phone)}<input name="phone" type="tel" autocomplete="tel" required /></label><label>${text(copy.fields.city)}<input name="city" autocomplete="address-level2" required /></label></div><label>${text(copy.fields.address)}<textarea name="address" autocomplete="street-address" rows="3" required></textarea></label><label>${text(copy.fields.note)} <span class="optional">${text(copy.fields.optional)}</span><textarea name="note" rows="2" placeholder="${text(copy.fields.notePlaceholder)}"></textarea></label><button class="button button-brown button-wide" type="submit">${text(copy.submitButton)} <span aria-hidden="true">↗</span></button><p class="form-footnote">${text(copy.formFootnote)}</p></form><aside class="checkout-summary"><p class="kicker">${text(copy.summaryKicker)}</p><h2>${text(copy.summaryTitle)}</h2><div class="checkout-items">${items.map(({ product, quantity }) => `<div class="checkout-product"><img src="${escapeHtml(assetUrl(product.imageUrl))}" alt="" /><span><strong>${text(product.name)}</strong><small>${quantity} × ${money(product.price)}</small></span><b>${money(product.price * quantity)}</b></div>`).join("")}</div><div class="summary-line"><span>${text(copy.subtotal)}</span><strong>${money(total(items))}</strong></div><p class="summary-note">${text(config.deliveryNote)}</p><a class="continue-link" href="${withCart("cart.html")}">← ${text(copy.editCart)}</a></aside></div>`;
    $("#order-form").addEventListener("submit", placeOrder);
  }
  function makeWhatsAppMessage(order) {
    const copy = content.checkout.whatsappMessage;
    const lines = [format(copy.title, { shopName: config.shopName }), format(copy.orderId, { orderId: order.orderId }), ""];
    order.items.forEach((item) => lines.push(format(copy.item, { name: item.name, quantity: item.quantity, lineTotal: money(item.lineTotal) })));
    lines.push("", format(copy.subtotal, { subtotal: money(order.subtotal) }), "", format(copy.name, { name: order.customer.name }), format(copy.phone, { phone: order.customer.phone }), format(copy.city, { city: order.customer.city }), format(copy.address, { address: order.customer.address }));
    if (order.customer.note) lines.push(format(copy.note, { note: order.customer.note }));
    lines.push("", copy.closing);
    return lines.filter((line) => line !== "").join("\n");
  }
  function placeOrder(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const items = cartItems(); if (!items.length) { location.href = "cart.html"; return; }
    const fields = Object.fromEntries(new FormData(form).entries());
    const now = new Date();
    const order = {
      orderId: `${config.orderPrefix}-${now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      placedAt: now.toISOString(), currency: config.currency,
      customer: { name: fields.name.trim(), phone: fields.phone.trim(), city: fields.city.trim(), address: fields.address.trim(), note: fields.note.trim() },
      items: items.map(({ product, quantity }) => ({ id: product.id, sku: product.sku || "", name: product.name, category: product.category, quantity, unitPrice: product.price, lineTotal: product.price * quantity })),
      subtotal: total(items), status: content.checkout.orderStatus
    };
    let orders = [];
    try { orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]"); if (!Array.isArray(orders)) orders = []; } catch { /* The downloaded order file remains available. */ }
    orders.push(order);
    try { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); } catch { /* The downloaded order file remains available. */ }
    const file = new Blob([JSON.stringify(order, null, 2)], { type: "application/json" });
    const fileUrl = URL.createObjectURL(file); const download = document.createElement("a");
    download.href = fileUrl; download.download = `${order.orderId}.json`; document.body.append(download); download.click(); download.remove();
    setTimeout(() => URL.revokeObjectURL(fileUrl), 1500);
    const whatsappUrl = `https://wa.me/${String(config.whatsappNumber).replace(/\D/g, "")}?text=${encodeURIComponent(makeWhatsAppMessage(order))}`;
    try { window.open(whatsappUrl, "_blank", "noopener,noreferrer"); } catch { /* The confirmation page keeps a WhatsApp link available. */ }
    cartWasPlaced = true;
    try { localStorage.removeItem(CART_KEY); } catch { /* Clear the cart from the URL as well. */ }
    try { const url = new URL(location.href); url.searchParams.delete("cart"); history.replaceState(null, "", url.href); } catch { /* The order has already been prepared. */ }
    synchronizeCartLinks();
    renderConfirmation(order, whatsappUrl);
    updateCartBadge();
  }
  function renderConfirmation(order, whatsappUrl) {
    const copy = content.confirmation;
    setPageMetadata(format(copy.metaTitle, { shopName: config.shopName }), copy.metaDescription);
    main.innerHTML = `<section class="confirmation section-wrap"><div class="confirmation-icon" aria-hidden="true">✓</div><p class="kicker">${text(copy.kicker)}</p><h1>${text(copy.title, { name: order.customer.name })}</h1><p class="confirmation-intro">${text(copy.intro, { orderId: order.orderId })}</p><div class="confirmation-box"><div class="summary-line"><span>${text(copy.subtotal)}</span><strong>${money(order.subtotal)}</strong></div>${order.items.map((item) => `<div class="confirmation-lines"><div><span>${text(item.name)} × ${item.quantity}</span><b>${money(item.lineTotal)}</b></div></div>`).join("")}</div><div class="confirmation-actions"><a class="button button-brown" href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer">${text(copy.whatsappButton)} <span aria-hidden="true">↗</span></a><a class="continue-link" href="${withCart("index.html#collections")}">${text(copy.continueShopping)}</a></div><p class="form-footnote">${text(copy.footnote)}</p></section>`;
  }
  function init() {
    const pageCopy = content[page];
    if (!pageCopy || !config.shopName || !categories.length || !products.length) {
      console.error("Static site data bundle is missing or incomplete. Rebuild it from the JSON files.");
      return;
    }
    products = products.map((product) => ({ ...product, price: Number(product.price) || 0 }));
    setPageMetadata(format(pageCopy.metaTitle || pageCopy.meta?.title || "", { shopName: config.shopName }), pageCopy.metaDescription || pageCopy.meta?.description || "");
    header(); footer(); updateCartBadge();
    if (page === "home") renderHome();
    else if (page === "category") renderCategory();
    else if (page === "product") renderProduct();
    else if (page === "cart") renderCart();
    else if (page === "checkout") renderCheckout();
  }
  init();
})();
