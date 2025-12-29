// ============================================
// AMAZON PRODUCT EXTRACTOR
// ============================================
// This module handles product data extraction from Amazon pages
// Supports both product listing pages and product detail pages

/**
 * BUTTON INSERTION STRATEGY
 * 
 * The extension inserts "Compare" buttons on Amazon pages by:
 * 1. Finding all elements with a valid (non-empty) data-asin attribute
 * 2. For each element, finding a suitable insertion point (title link)
 * 3. Creating and inserting a Compare button next to the title
 * 
 * This works on:
 * - Product listing pages (search results)
 * - Product detail pages (main product + recommended/sponsored products)
 * 
 * EXTRACTION STRATEGY
 * 
 * When a Compare button is clicked, we extract product data:
 * 
 * For products with containers (listing page products, recommended products):
 * - Extract from the product container element using data attributes and selectors
 * - Fallback to link attributes (title, href) when standard selectors fail
 * 
 * For main product on detail pages:
 * - Extract comprehensive data from the detail page DOM
 * - Include extended information (bullets, description, specifications)
 */

const AmazonExtractor = {
  
  // ============================================
  // PAGE TYPE DETECTION
  // ============================================
  
  /**
   * Check if current page is a product detail page
   */
  isProductDetailPage() {
    const pathname = window.location.pathname;
    return pathname.includes('/dp/') || pathname.includes('/gp/product/');
  },
  
  /**
   * Check if current page is a product listing/search page
   */
  isProductListPage() {
    const pathname = window.location.pathname;
    const search = window.location.search;
    return pathname.includes('/s') || search.includes('?k=');
  },
  
  // ============================================
  // UTILITY METHODS
  // ============================================
  
  /**
   * Extract Product ID (ASIN) from Amazon product URL
   * @param {string} url - Amazon product URL
   * @returns {string|null} - Product ID or null
   */
  extractProductIdFromUrl(url) {
    if (!url) return null;
    
    // Try multiple patterns to extract ASIN
    // Pattern 1: /dp/ASIN
    let match = url.match(/\/dp\/([A-Z0-9]{10})/);
    if (match) return match[1];
    
    // Pattern 2: /gp/product/ASIN
    match = url.match(/\/gp\/product\/([A-Z0-9]{10})/);
    if (match) return match[1];
    
    // Pattern 3: ASIN in query parameters (for redirect links like /sspa/click?)
    match = url.match(/[?&]asin=([A-Z0-9]{10})/i);
    if (match) return match[1];
    
    // Pattern 4: Any path segment that looks like an ASIN
    match = url.match(/\/([A-Z0-9]{10})(?:\/|$|\?|#)/);
    if (match) return match[1];
    
    return null;
  },
  
  /**
   * Clean and normalize text content
   * @param {string} text - Raw text
   * @returns {string} - Cleaned text
   */
  cleanText(text) {
    if (!text) return null;
    return text.replace(/\s+/g, ' ').trim();
  },
  
  /**
   * Extract price from price-recipe by searching through all nodes
   * @param {Element} priceRecipe - The price-recipe container element
   * @returns {string|null} - Price string (e.g., "$50.28")
   */
  extractPriceFromNodes(priceRecipe) {
    if (!priceRecipe) return null;
    
    // Regex to match price formats:
    // $30.45, $30, $299.99, $345, $4,655.99, $4,655, etc.
    // Pattern: $ followed by digits (with optional commas), optional decimal point and cents
    const priceRegex = /\$[\d,]+(?:\.\d{2})?/;
    
    // Get all text nodes within price-recipe
    const walker = document.createTreeWalker(
      priceRecipe,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      const match = text.match(priceRegex);
      if (match) {
        Logger.log('  Found price:', match[0]);
        return match[0];
      }
    }
    
    return null;
  },

  /**
   * Extract price from detail page by searching through all nodes or constructing from components
   * @param {Element} priceContainer - The price container element
   * @returns {string|null} - Price string (e.g., "$50.28")
   */
  extractPriceFromNodesDetailPage(priceContainer) {
    if (!priceContainer) return null;
    
    // Regex to match price formats:
    // $30.45, $30, $299.99, $345, $4,655.99, $4,655, etc.
    // Pattern: $ followed by digits (with optional commas), optional decimal point and cents
    const priceRegex = /\$[\d,]+(?:\.\d{2})?/;
    
    // Get all text nodes within priceContainer
    const walker = document.createTreeWalker(
      priceContainer,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      const match = text.match(priceRegex);
      if (match) {
        Logger.log('  Found price:', match[0]);
        return match[0];
      }
    }
    
    // Fallback: Try to construct price from component spans
    Logger.log('  Attempting to construct price from component spans...');
    const symbol = priceContainer.querySelector('.a-price-symbol')?.textContent?.trim() || '';
    const whole = priceContainer.querySelector('.a-price-whole')?.textContent?.trim() || '';
    const decimal = priceContainer.querySelector('.a-price-decimal')?.textContent?.trim() || '';
    const fraction = priceContainer.querySelector('.a-price-fraction')?.textContent?.trim() || '';
    
    if (symbol && whole) {
      const constructedPrice = symbol + whole + decimal + fraction;
      Logger.log('  Constructed price from components:', constructedPrice);
      return constructedPrice;
    }
    
    return null;
  },
  
  /**
   * Extract rating from reviews-block by searching through all nodes
   * @param {Element} reviewsBlock - The reviews-block container element
   * @returns {string|null} - Rating string (e.g., "4.5")
   */
  extractRatingFromNodes(reviewsBlock) {
    if (!reviewsBlock) return null;
    
    // Regex to match rating format: X.X (e.g., 4.3, 4.5, 3.8)
    const ratingRegex = /\b(\d\.\d)\b/;
    
    // Get all text nodes within reviews-block
    const walker = document.createTreeWalker(
      reviewsBlock,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      const match = text.match(ratingRegex);
      if (match) {
        Logger.log('  Found rating:', match[1]);
        return match[1];
      }
    }
    
    return null;
  },
  
  /**
   * Extract customer reviews URL from reviews-block
   * @param {Element} reviewsBlock - The reviews-block container element
   * @returns {Object|null} - Object with reviewsUrl and totalReviews
   */
  extractReviewsUrlFromNodes(reviewsBlock) {
    if (!reviewsBlock) return null;
    
    // Find all anchor tags within reviews-block
    const links = reviewsBlock.querySelectorAll('a[href]');
    
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.includes('customerReviews')) {
        // Convert relative URL to absolute if needed
        const reviewsUrl = href.startsWith('http') ? href : `https://${window.location.hostname}${href}`;
        
        // Find span with text in brackets like "(1,234)" or "(some text)"
        const spans = link.querySelectorAll('span');
        let totalReviews = null;
        
        for (const span of spans) {
          const text = span.textContent.trim();
          const match = text.match(/\(([^)]+)\)/);
          if (match) {
            totalReviews = match[1]; // Extract text inside brackets
            Logger.log('  Found total reviews:', totalReviews);
            break;
          }
        }
        
        Logger.log('  Found reviews URL:', reviewsUrl);
        return { reviewsUrl, totalReviews };
      }
    }
    
    return null;
  },
  
  /**
   * Try multiple selectors until one returns a value
   * @param {Array<string>} selectors - Array of CSS selectors
   * @param {Element} context - Context element (default: document)
   * @returns {Element|null}
   */
  trySelectors(selectors, context = document) {
    for (const selector of selectors) {
      const element = context.querySelector(selector);
      if (element) return element;
    }
    return null;
  },

  /**
   * Find elements by keyword in data-csa-c-slot-id attribute
   * @param {string} keyword - Keyword to search for in slot IDs
   * @returns {Array<Object>} - Array of matched elements with metadata
   */
  findElementsBySlotKeyword(keyword) {
    const nodes = document.querySelectorAll('[data-csa-c-slot-id]');
    const matched = [];

    nodes.forEach(el => {
      const slotId = el.getAttribute('data-csa-c-slot-id');
      if (!slotId) return;

      const lower = slotId.toLowerCase();
      if (!lower.includes(keyword.toLowerCase())) return;

      const target = document.getElementById(slotId);
      if (!target) return;

      // Check for non-empty meaningful content
      const text = target.textContent.replace(/\s+/g, ' ').trim();
      if (!text) return;

      matched.push({
        sourceNode: el,
        slotId,
        matchedElement: target,
        contentPreview: text.slice(0, 120)
      });

      Logger.log('  Found slot:', slotId, '→', text.slice(0, 60) + '...');
    });

    Logger.log(`  Total matches for "${keyword}":`, matched.length);
    return matched;
  },

  /**
   * Extract text content from element by traversing text nodes and skipping script/style
   * @param {Element} element - The element to extract content from
   * @returns {string} - Extracted and cleaned text content
   */
  extractContentFromElement(element) {
    if (!element) return '';

    const textParts = [];
    
    // Create a TreeWalker to traverse all text nodes
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip if the text node is inside a script or style tag
          let parent = node.parentElement;
          while (parent && parent !== element) {
            if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
              return NodeFilter.FILTER_REJECT;
            }
            parent = parent.parentElement;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (text && text.length > 0) {
        textParts.push(text);
      }
    }
    
    // Join all text parts and clean up
    return textParts.join(' ').replace(/\s+/g, ' ').trim();
  },
  
  // ============================================
  // PRODUCT LISTING PAGE EXTRACTION
  // ============================================
  
  /**
   * Extract product information from a product container
   * Used for products on listing pages and recommended/sponsored products
   * 
   * Strategy:
   * 1. Find product link (title-recipe > a, or first link with /dp/)
   * 2. Extract title (link title attribute → h2 → link text)
   * 3. Extract product_id from URL or data-asin attribute
   * 4. Extract price, image, rating, reviews
   * 
   * @param {Element} productContainer - The product container element with data-asin
   * @returns {Object|null} - Product information object
   */
  extractFromListingPage(productContainer) {
    Logger.log('🔍 Extracting product from container...');
    
    if (!productContainer) {
      Logger.error('❌ Product container not provided');
      return null;
    }
    
    // STEP 1: Find the product link in the container
    Logger.log('\n📍 Step 1: Finding product link...');
    let linkElement = null;
    
    // Try 1: title-recipe > a (standard for listing pages)
    linkElement = productContainer.querySelector('[data-cy="title-recipe"] > a');
    if (linkElement) {
      Logger.log('   ✅ Found via title-recipe');
    }
    
    // Try 2: Any link with title attribute (fallback for recommended products)
    if (!linkElement) {
      linkElement = productContainer.querySelector('a[href][title]');
      if (linkElement) {
        Logger.log('   ✅ Found via link with title attribute');
      }
    }
    
    // Try 3: First link with /dp/ in href
    if (!linkElement) {
      linkElement = productContainer.querySelector('a[href*="/dp/"]');
      if (linkElement) {
        Logger.log('   ✅ Found via /dp/ link');
      }
    }
    
    // Try 4: Just first link in container
    if (!linkElement) {
      linkElement = productContainer.querySelector('a[href]');
      if (linkElement) {
        Logger.log('   ✅ Found via first link');
      }
    }
    
    if (!linkElement) {
      Logger.error('❌ Could not find any link in container');
      return null;
    }
    
    // Extract URL from href attribute
    const productUrl = linkElement.href;
    if (!productUrl) {
      Logger.error('❌ Link has no href attribute');
      return null;
    }
    Logger.log('✅ Product URL:', productUrl);
    
    // STEP 2: Extract title from link's title attribute
    Logger.log('\n📍 Step 2: Extracting product title...');
    let title = null;
    
    // Try 1: Link title attribute (works for both listing and recommended products)
    if (linkElement.hasAttribute('title')) {
      title = this.cleanText(linkElement.getAttribute('title'));
      Logger.log('   ✅ From link title attribute');
    }
    
    // Try 2: h2 element text (fallback)
    if (!title) {
      const h2 = productContainer.querySelector('h2');
      title = this.cleanText(h2?.textContent);
      if (title) {
        Logger.log('   ✅ From h2 element');
      }
    }
    
    // Try 3: Link text content (last resort)
    if (!title) {
      title = this.cleanText(linkElement.textContent);
      if (title) {
        Logger.log('   ✅ From link text');
      }
    }
    
    if (!title) {
      Logger.warn('⚠️ Title not found');
    }
    
    // STEP 3: Extract product ID
    Logger.log('\n📍 Step 3: Extracting product ID...');
    let product_id = this.extractProductIdFromUrl(productUrl);
    
    // Fallback: Use data-asin attribute
    if (!product_id) {
      product_id = productContainer?.getAttribute('data-asin');
      if (product_id) {
        Logger.log('   ✅ From data-asin attribute');
      }
    } else {
      Logger.log('   ✅ From URL');
    }
    
    if (!product_id) {
      Logger.warn('⚠️ Product ID not found');
    }
    
    // STEP 4: Extract price
    Logger.log('\n📍 Step 4: Extracting price...');
    let price = null;
    
    // Try 1: price-recipe (standard for listing pages)
    const priceRecipe = productContainer.querySelector('[data-cy="price-recipe"]');
    if (priceRecipe) {
      price = this.extractPriceFromNodes(priceRecipe);
      if (price) {
        Logger.log('   ✅ From price-recipe');
      }
    }
    
    // Try 2: Look for a-price structure (for recommended products)
    if (!price) {
      const priceWhole = productContainer.querySelector('.a-price-whole');
      const priceFraction = productContainer.querySelector('.a-price-fraction');
      
      if (priceWhole) {
        let priceText = this.cleanText(priceWhole.textContent);
        if (priceFraction) {
          priceText += this.cleanText(priceFraction.textContent);
        }
        
        // Extract just the price using regex to avoid duplicates
        const match = priceText.match(/[\$£€¥₹]?\s*([\d,]+(?:\.\d{2})?)/);
        if (match) {
          price = match[0].trim();
          Logger.log('   ✅ From a-price structure');
        }
      }
    }
    
    // Try 3: Elements with class containing '-price' (broader search)
    if (!price) {
      const priceElement = productContainer.querySelector('[class*="-price"]');
      if (priceElement) {
        const text = this.cleanText(priceElement.textContent);
        // Extract just the first price match to avoid duplicates
        const match = text.match(/[\$£€¥₹]\s*[\d,]+(?:\.\d{2})?/);
        if (match) {
          price = match[0];
          Logger.log('   ✅ From element with *-price class');
        }
      }
    }
    
    if (price) {
      Logger.log('✅ Price:', price);
    } else {
      Logger.warn('⚠️ Price not found');
    }
    
    
    // STEP 5: Extract rating and reviews count
    Logger.log('\n📍 Step 5: Extracting rating and reviews...');
    let rating = null;
    let totalReviews = null;
    
    // Try 1: Look for aria-label with pattern "X.X out of 5 stars XXX ratings"
    const ariaLabelElements = productContainer.querySelectorAll('[aria-label]');
    for (const elem of ariaLabelElements) {
      const ariaLabel = elem.getAttribute('aria-label');
      // Match pattern like "4.3 out of 5 stars" or "4.3 out of 5 stars 151 ratings"
      const ratingMatch = ariaLabel.match(/([\d.]+)\s+out of\s+5\s+stars/i);
      if (ratingMatch) {
        rating = ratingMatch[1];
        Logger.log('   ✅ Rating from aria-label:', rating);
        
        // Try to extract ratings count from same aria-label
        const ratingsMatch = ariaLabel.match(/(\d+[\d,]*)\s+ratings?/i);
        if (ratingsMatch) {
          totalReviews = ratingsMatch[1].replace(/,/g, '');
          Logger.log('   ✅ Total reviews from aria-label:', totalReviews);
        }
        break;
      }
    }
    
    // Try 2: Fallback to reviews-block (for listing pages)
    if (!rating) {
      const reviewsBlock = productContainer.querySelector('[data-cy="reviews-block"]');
      if (reviewsBlock) {
        rating = this.extractRatingFromNodes(reviewsBlock);
        if (rating) {
          Logger.log('   ✅ Rating from reviews-block');
        }
        
        const reviewsData = this.extractReviewsUrlFromNodes(reviewsBlock);
        if (reviewsData?.totalReviews) {
          totalReviews = reviewsData.totalReviews;
          Logger.log('   ✅ Total reviews from reviews-block');
        }
      }
    }
    
    if (rating) {
      Logger.log('✅ Rating:', rating);
    } else {
      Logger.warn('⚠️ Rating not found');
    }
    
    if (totalReviews) {
      Logger.log('✅ Total Reviews:', totalReviews);
    }
    
    // STEP 7: Extract image
    Logger.log('\n📍 Step 7: Extracting image...');
    let image = null;
    
    // Try specific selectors first
    const imageSelectors = [
      '[data-cy="image-container"] img',
      'img[data-image-latency="s-product-image"]'
    ];
    const imageElement = this.trySelectors(imageSelectors, productContainer);
    image = imageElement?.src || imageElement?.getAttribute('data-src');
    
    // Fallback: Just get any img tag in the container
    if (!image) {
      const anyImg = productContainer.querySelector('img');
      if (anyImg) {
        image = anyImg.src || anyImg.getAttribute('data-src');
        Logger.log('   ✅ From img tag (fallback)');
      }
    }
    
    if (image) {
      Logger.log('✅ Image found');
    }
    
    Logger.log('🎉 Extraction complete\n');
    
    // Get reviews URL from reviews-block if available
    const reviewsBlock = productContainer.querySelector('[data-cy="reviews-block"]');
    const reviewsData = this.extractReviewsUrlFromNodes(reviewsBlock);
    const reviewsUrl = reviewsData?.reviewsUrl || null;
    
    return {
      title: title,
      price: price,
      rating: rating,
      totalReviews: totalReviews,
      reviewsUrl: reviewsUrl,
      image: image,
      url: productUrl,
      product_id: product_id,
      retailer: 'amazon'
    };
  },
  
  // ============================================
  // PRODUCT DETAIL PAGE EXTRACTION
  // ============================================
  
  /**
   * Extract product information from a product detail page
   * Used for the main product being viewed on detail pages
   * 
   * Strategy:
   * 1. Use page URL as product URL
   * 2. Extract title from #productTitle
   * 3. Extract product_id from URL or ASIN input
   * 4. Extract price, rating, reviews from page elements
   * 
   * @returns {Object|null} - Complete product information object
   */
  extractFromDetailPage() {
    Logger.log('🔍 Extracting from product detail page...');
    
    // STEP 1: Product URL (current page)
    Logger.log('\n📍 Step 1: Getting product URL...');
    const productUrl = window.location.href;
    Logger.log('✅ URL:', productUrl);
    
    // STEP 2: Extract title
    Logger.log('\n📍 Step 2: Extracting title...');
    const titleElement = document.querySelector('#productTitle');
    const title = this.cleanText(titleElement?.textContent);
    if (title) {
      Logger.log('✅ Title found');
    }
    
    // STEP 3: Extract product ID
    Logger.log('\n📍 Step 3: Extracting product ID...');
    let product_id = this.extractProductIdFromUrl(productUrl);
    
    // Fallback: Use ASIN input field
    if (!product_id) {
      const asinInput = document.querySelector('input[name="ASIN"]');
      product_id = asinInput?.value;
      if (product_id) {
        Logger.log('   ✅ From ASIN input');
      }
    } else {
      Logger.log('   ✅ From URL');
    }
    
    // STEP 4: Extract price
    Logger.log('\n📍 Step 4: Extracting price...');
    const priceContainer = document.querySelector('[data-feature-name^="corePriceDisplay_"]');
    const price = this.extractPriceFromNodesDetailPage(priceContainer);
    if (price) {
      Logger.log('✅ Price:', price);
    }
    
    // STEP 5: Extract rating
    Logger.log('\n📍 Step 5: Extracting rating...');
    const ratingElement = document.querySelector('[data-hook="rating-out-of-text"]');
    const rating = this.cleanText(ratingElement?.textContent);
    if (rating) {
      Logger.log('✅ Rating:', rating);
    }
    
    // STEP 6: Extract reviews count
    Logger.log('\n📍 Step 6: Extracting reviews...');
    const reviewsElement = document.querySelector('[data-hook="total-review-count"]');
    const reviewsCount = this.cleanText(reviewsElement?.textContent);
    if (reviewsCount) {
      Logger.log('✅ Reviews:', reviewsCount);
    }
    
    // STEP 7: Extract image
    Logger.log('\n📍 Step 7: Extracting image...');
    const imageSelectors = [
      '#landingImage',
      '#imgBlkFront',
      '.a-dynamic-image'
    ];
    const imageElement = this.trySelectors(imageSelectors);
    const image = imageElement?.src;
    if (image) {
      Logger.log('✅ Image found');
    }
    
    // STEP 8: Extract feature bullets
    Logger.log('\n📍 Step 8: Extracting feature bullets...');
    const featureBullets = this.extractFeatureBullets();
    Logger.log('✅ Feature bullets:', featureBullets.length, 'items');
    if (featureBullets.length > 0) {
      Logger.log('   First bullet:', featureBullets[0].substring(0, 60) + '...');
    }
    
    // STEP 9: Extract description
    Logger.log('\n📍 Step 9: Extracting product description...');
    const description = this.extractDescription();
    if (description) {
      Logger.log('✅ Description:', description);
      Logger.log('   Length:', description.length, 'characters');
    } else {
      Logger.warn('⚠️ Description not found');
    }
    
    
    // STEP 10: Extract product details
    Logger.log('\n📍 Step 10: Extracting specifications...');
    const productDetails = this.extractProductDetails();
    const detailsCount = Object.keys(productDetails).length;
    if (detailsCount > 0) {
      Logger.log(`✅ ${detailsCount} specifications`);
    }
    
    // STEP 11: Extract important information
    Logger.log('\n📍 Step 11: Extracting important info...');
    const product_important_information = this.extractImportantInformation();
    if (product_important_information) {
      Logger.log('✅ Important info found');
    }
    
    // STEP 12: Extract highlights
    Logger.log('\n📍 Step 12: Extracting highlights...');
    const voyagerNorthstarATF = this.extractVoyagerNorthstarATF();
    if (voyagerNorthstarATF) {
      Logger.log('✅ Highlights found');
    }
    
    Logger.log('🎉 Extraction complete\n');
    
    return {
      title: title,
      price: price,
      rating: rating,
      totalReviews: reviewsCount,
      image: image,
      url: productUrl,
      product_id: product_id,
      retailer: 'amazon',
      // Extended information for detail pages
      featureBullets: featureBullets,
      description: description,
      productDetails: productDetails,
      productImportantInformation: product_important_information,
      productHighlights: voyagerNorthstarATF
    };
  },
  
  /**
   * Extract feature bullets from product detail page
   * @returns {Array<string>} - Array of feature bullet points
   */
  extractFeatureBullets() {
    Logger.log('  Searching for feature bullets using data-csa-c-slot-id...');
    
    // Find elements with 'featurebullets_' keyword in slot ID
    const bulletMatches = this.findElementsBySlotKeyword('featurebullets_');
    
    if (bulletMatches.length > 0) {
      // Use the first match
      const firstMatch = bulletMatches[0];
      Logger.log('  Using slot:', firstMatch.slotId);
      
      const bulletText = this.extractContentFromElement(firstMatch.matchedElement);
      if (bulletText) {
        Logger.log('  Extracted feature bullets text length:', bulletText.length, 'characters');
        // Return as array with single text entry for consistency
        return [bulletText];
      }
    }
    
    // Fallback to old selector-based extraction
    Logger.log('  Falling back to #feature-bullets selector...');
    const bullets = [];
    const bulletElements = document.querySelectorAll('#feature-bullets ul li');
    
    bulletElements.forEach(li => {
      const text = this.cleanText(li.textContent);
      if (text && text.length > 0) {
        bullets.push(text);
      }
    });
    
    return bullets;
  },
  
  /**
   * Extract product description from product detail page
   * @returns {string|null} - Product description
   */
  extractDescription() {
    Logger.log('  Searching for description using data-csa-c-slot-id...');
    
    // Find elements with 'description' keyword in slot ID
    const descriptionMatches = this.findElementsBySlotKeyword('description');
    
    if (descriptionMatches.length > 0) {
      // Use the first match
      const firstMatch = descriptionMatches[0];
      Logger.log('  Using slot:', firstMatch.slotId);
      
      const description = this.extractContentFromElement(firstMatch.matchedElement);
      if (description) {
        Logger.log('  Extracted description length:', description.length, 'characters');
        return description;
      }
    }
    
    // Fallback to old selectors if slot-based search fails
    Logger.log('  Falling back to selector-based search...');
    const descriptionSelectors = [
      '#productDescription',
      '#renewedProgramDescriptionBtf_feature_div',
      '#feature-bullets'
    ];
    
    const descElement = this.trySelectors(descriptionSelectors);
    return this.cleanText(descElement?.textContent);
  },
  
  /**
   * Extract important information from product detail page
   * @returns {string|null} - Important information text
   */
  extractImportantInformation() {
    Logger.log('  Searching for important information using data-csa-c-slot-id...');
    
    // Find elements with 'importantInformation' keyword in slot ID
    const infoMatches = this.findElementsBySlotKeyword('importantInformation');
    
    if (infoMatches.length > 0) {
      // Use the first match
      const firstMatch = infoMatches[0];
      Logger.log('  Using slot:', firstMatch.slotId);
      
      const infoText = this.extractContentFromElement(firstMatch.matchedElement);
      if (infoText) {
        Logger.log('  Extracted important information length:', infoText.length, 'characters');
        return infoText;
      }
    }
    
    Logger.log('  ⚠️ No important information found');
    return null;
  },
  
  /**
   * Extract voyager northstar ATF from product detail page
   * @returns {string|null} - Voyager northstar ATF text
   */
  extractVoyagerNorthstarATF() {
    Logger.log('  Searching for voyager northstar ATF using data-csa-c-slot-id...');
    
    // Find elements with 'voyagerNorthstarATF' keyword in slot ID
    const voyagerMatches = this.findElementsBySlotKeyword('voyagerNorthstarATF');
    
    if (voyagerMatches.length > 0) {
      // Use the first match
      const firstMatch = voyagerMatches[0];
      Logger.log('  Using slot:', firstMatch.slotId);
      
      const voyagerText = this.extractContentFromElement(firstMatch.matchedElement);
      if (voyagerText) {
        Logger.log('  Extracted voyager northstar ATF length:', voyagerText.length, 'characters');
        return voyagerText;
      }
    }
    
    Logger.log('  ⚠️ No voyager northstar ATF found');
    return null;
  },
  
  /**
   * Extract product details from all tables in #prodDetails section
   * @returns {Object} - Key-value pairs of product specifications
   */
  extractProductDetails() {
    Logger.log('  Searching for product details using data-csa-c-slot-id...');
    
    // Find elements with 'detailBullets' keyword in slot ID
    const detailMatches = this.findElementsBySlotKeyword('detailBullets');
    
    if (detailMatches.length > 0) {
      // Use the first match and extract all content from it
      const firstMatch = detailMatches[0];
      Logger.log('  Using slot:', firstMatch.slotId);
      
      const detailsText = this.extractContentFromElement(firstMatch.matchedElement);
      if (detailsText) {
        Logger.log(detailsText)
        Logger.log('  Extracted product details text length:', detailsText.length, 'characters');
        return { details: detailsText };
      }
    }
    
    // Fallback to old #prodDetails selector
    Logger.log('  Falling back to #prodDetails selector...');
    const details = {};
    const prodDetailsSection = document.querySelector('#prodDetails');
    
    if (!prodDetailsSection) {
      Logger.log('  ⚠️ No #prodDetails section found');
      return details;
    }
    
    const tables = prodDetailsSection.querySelectorAll('table');
    Logger.log(`  Processing ${tables.length} tables in #prodDetails`);
    
    tables.forEach((table, index) => {
      Logger.log(`  Processing table ${index + 1}/${tables.length}`);
      
      table.querySelectorAll('tr').forEach(row => {
        let key = null;
        let value = null;
        
        // Try structure 1: th + td
        key = row.querySelector('th')?.textContent;
        value = row.querySelector('td')?.textContent;
        
        // Try structure 2: two td elements
        if (!key || !value) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            key = cells[0]?.textContent;
            value = cells[1]?.textContent;
          }
        }
        
        // Try structure 3: span-based cells
        if (!key) {
          key = row.querySelector('td.a-span3')?.textContent;
          value = row.querySelector('td.a-span9')?.textContent || 
                  row.querySelector('td:not(.a-span3)')?.textContent;
        }
        
        if (key && value) {
          const cleanKey = this.cleanText(key);
          const cleanValue = this.cleanText(value);
          if (cleanKey && cleanValue) {
            details[cleanKey] = cleanValue;
          }
        }
      });
    });
    
    return details;
  },
  
  // ============================================
  // BUTTON INSERTION
  // ============================================
  
  /**
   * Find all insertion points for Compare buttons on the current page
   * 
   * Strategy:
   * 1. Find all elements with valid (non-empty) data-asin attributes
   * 2. For each element, find a suitable insertion point (typically near the product title)
   * 3. Return array of insertion data for button creation
   * 
   * Works on:
   * - Product listing pages: All product cards
   * - Product detail pages: Main product + recommended/sponsored products
   * 
   * @returns {Array<Object>} - Array of insertion data objects containing:
   *   - insertionPoint: DOM element where button should be inserted
   *   - productContainer: Container element with data-asin (or null for main product)
   *   - asin: Product ASIN
   *   - uuid: Product UUID (if available)
   *   - id: Element ID (if available)
   */
  findInsertionPoints() {
    const insertionData = [];
    
    // LISTING PAGES: Process all product cards with data-asin
    if (this.isProductListPage()) {
      return this.findInsertionPointsOnListingPage();
    }
    
    // DETAIL PAGES: Process main product + recommended products
    if (this.isProductDetailPage()) {
      return this.findInsertionPointsOnDetailPage();
    }
    
    return insertionData;
  },
  
  /**
   * Find insertion points on product listing pages
   * @returns {Array<Object>} - Insertion data for all products on listing page
   */
  findInsertionPointsOnListingPage() {
    const products = document.querySelectorAll('[data-asin]');
    const insertionData = [];
    
    Logger.log(`🔍 Listing Page: Found ${products.length} elements with data-asin`);
    
    products.forEach((productContainer, index) => {
      const asin = productContainer.getAttribute('data-asin');
      
      // Skip empty ASINs
      if (!asin || asin.trim() === '') {
        Logger.log(`  Product ${index + 1}: Skipping - empty ASIN`);
        return;
      }
      
      // Find title-recipe as insertion point
      const titleRecipe = productContainer.querySelector('[data-cy="title-recipe"]');
      
      if (titleRecipe) {
        Logger.log(`  Product ${index + 1}: ASIN=${asin}`);
        insertionData.push({
          insertionPoint: titleRecipe,
          productContainer: productContainer,
          asin: asin,
          uuid: productContainer.getAttribute('data-uuid'),
          id: productContainer.getAttribute('id')
        });
      }
    });
    
    return insertionData;
  },
  
  /**
   * Find insertion points on product detail pages
   * Includes both the main product and recommended/sponsored products
   * @returns {Array<Object>} - Insertion data for main + recommended products
   */
  findInsertionPointsOnDetailPage() {
    const insertionData = [];
    
    // 1. Add main product (the product being viewed)
    const mainProductData = this.findMainProductInsertionPoint();
    if (mainProductData) {
      insertionData.push(mainProductData);
    }
    
    // 2. Add recommended/sponsored products (any element with data-asin)
    const recommendedProducts = this.findRecommendedProductInsertionPoints();
    insertionData.push(...recommendedProducts);
    
    Logger.log(`🔍 Detail Page: Found ${insertionData.length} total insertion points`);
    
    return insertionData;
  },
  
  /**
   * Find insertion point for the main product on detail page
   * @returns {Object|null} - Insertion data for main product
   */
  findMainProductInsertionPoint() {
    const productTitle = document.querySelector('#productTitle');
    
    if (!productTitle?.parentElement?.parentElement) {
      return null;
    }
    
    // Get ASIN from hidden input or URL
    const asinInput = document.querySelector('input[name="ASIN"]');
    const mainAsin = asinInput?.value || this.extractProductIdFromUrl(window.location.href);
    
    Logger.log(`  Main Product: ASIN=${mainAsin}`);
    
    return {
      insertionPoint: productTitle.parentElement.parentElement,
      productContainer: null, // Main product doesn't have a container
      asin: mainAsin,
      uuid: null,
      id: 'main-product'
    };
  },
  
  /**
   * Find insertion points for recommended/sponsored products on detail page
   * @returns {Array<Object>} - Insertion data for recommended products
   */
  findRecommendedProductInsertionPoints() {
    const allProductElements = document.querySelectorAll('[data-asin]');
    const insertionData = [];
    
    Logger.log(`  Recommended Products: Found ${allProductElements.length} elements with data-asin`);
    
    allProductElements.forEach((productContainer, index) => {
      const asin = productContainer.getAttribute('data-asin');
      
      // Skip empty ASINs
      if (!asin || asin.trim() === '') {
        return;
      }
      
      // Find suitable insertion point within this container
      const insertionPoint = this.findInsertionPointInContainer(productContainer);
      
      if (insertionPoint) {
        Logger.log(`    Product ${index + 1}: ASIN=${asin}`);
        insertionData.push({
          insertionPoint: insertionPoint,
          productContainer: productContainer,
          asin: asin,
          uuid: productContainer.getAttribute('data-uuid'),
          id: productContainer.getAttribute('id')
        });
      }
    });
    
    return insertionData;
  },
  
  /**
   * Find the best insertion point within a product container
   * Tries multiple selectors in order of preference
   * 
   * @param {Element} container - Product container element
   * @returns {Element|null} - Best insertion point, or null if none found
   */
  findInsertionPointInContainer(container) {
    // Try selectors in order of preference
    const selectors = [
      '[data-cy="title-recipe"]',              // Standard product card
      'h2',                                     // Heading element
      'a[href*="/dp/"]'                         // Product link (fallback)
    ];
    
    for (const selector of selectors) {
      const element = container.querySelector(selector);
      if (element) {
        // For title-recipe, return it directly; for others return parent
        if (selector === '[data-cy="title-recipe"]') {
          return element;
        }
        // For h2, find its parent container
        if (selector === 'h2') {
          // Try to find a good parent container (not just immediate parent)
          let parent = element.parentElement;
          while (parent && parent !== container && parent.tagName === 'A') {
            parent = parent.parentElement;
          }
          return parent || element.parentElement;
        }
        // For links, return the parent element
        return element.parentElement;
      }
    }
    
    // Final fallback: use the container itself or first div/section
    const firstDiv = container.querySelector('div.a-row, div.a-section');
    if (firstDiv) {
      Logger.log('   Using first div container as insertion point');
      return firstDiv;
    }
    
    Logger.log('   Using container itself as insertion point');
    return container;
  },
  
  /**
   * Create a compare button element
   * @param {Element} insertionPoint - The element where button is inserted
   * @param {Element} productContainer - The product container element with data-asin
   * @param {Object} metadata - Product metadata (asin, uuid, id)
   * @param {Function} onClickHandler - Click handler function
   * @returns {Element} - Button element
   */
  createCompareButton(insertionPoint, productContainer, metadata, onClickHandler) {
    const button = document.createElement('button');
    button.className = 'a-button a-button-primary compare-extension-button';
    button.setAttribute('data-compare-button', 'true');
    
    // Store product_id as data attribute for reliable access
    // Try multiple sources: metadata.asin, container data-asin, or extract from nearby link
    let productId = metadata?.asin;
    
    if (!productId && productContainer) {
      productId = productContainer.getAttribute('data-asin');
      Logger.log('  Using data-asin from container:', productId);
    }
    
    if (!productId && productContainer) {
      // Last resort: try to extract from product URL in title-recipe
      const linkElement = productContainer.querySelector('[data-cy="title-recipe"] > a');
      if (linkElement?.href) {
        productId = this.extractProductIdFromUrl(linkElement.href);
        Logger.log('  Extracted product_id from URL:', productId);
      }
    }
    
    if (productId) {
      button.setAttribute('data-smart-product-id', productId);
      Logger.log('  ✅ Button has product_id:', productId);
    } else {
      Logger.warn('  ⚠️ Could not determine product_id for button');
    }
    
    // Store product container reference and metadata on the button
    button._productContainer = productContainer;
    button._productMetadata = metadata;
    
    button.innerHTML = `
      <span class="a-button-inner">
        <input class="a-button-input" type="submit" aria-labelledby="compare-button-announce">
        <span id="compare-button-announce" class="a-button-text" aria-hidden="true">
          Compare
        </span>
      </span>
    `;
    
    button.addEventListener('click', function(e) {
      e.preventDefault();
      onClickHandler(button);
    });
    
    return button;
  }
};

// Export for use in content.js
window.AmazonExtractor = AmazonExtractor;

Logger.log('✅ Amazon Extractor loaded successfully');
