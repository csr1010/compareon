// Zillow.com Product Extractor
// Handles property card extraction and Compare button insertion for Zillow

window.ZillowExtractor = {
  // ============================================
  // PAGE TYPE DETECTION
  // ============================================
  
  isProductListPage() {
    // Check if we're on a search results page with property cards
    return document.querySelectorAll('[data-test="property-card"]').length > 0;
  },
  
  isProductDetailPage() {
    // Zillow detail pages typically have specific selectors
    // This can be expanded based on actual Zillow detail page structure
    return window.location.pathname.includes('/homedetails/') || 
           window.location.pathname.includes('/b/');
  },

  // ============================================
  // PRODUCT ID EXTRACTION
  // ============================================
  
  extractPropertyId(propertyCard) {
    // Try multiple methods to get property ID
    
    // Method 1: data-test="property-card" might have data-zpid or similar
    const zpid = propertyCard.getAttribute('data-zpid') || 
                 propertyCard.getAttribute('id') ||
                 propertyCard.querySelector('[data-zpid]')?.getAttribute('data-zpid');
    
    if (zpid) {
      Logger.log('  Found property ID (zpid):', zpid);
      return zpid;
    }
    
    // Method 2: Extract from property card link href
    const linkElement = propertyCard.querySelector('[data-test="property-card-link"]');
    if (linkElement) {
      const href = linkElement.getAttribute('href');
      // Zillow URLs typically have zpid in them: /homedetails/address/12345_zpid/
      const zpidMatch = href?.match(/\/(\d+)_zpid/);
      if (zpidMatch) {
        Logger.log('  Found property ID from URL:', zpidMatch[1]);
        return zpidMatch[1];
      }
    }
    
    // Method 3: Generate from card position as fallback
    const cards = Array.from(document.querySelectorAll('[data-test="property-card"]'));
    const index = cards.indexOf(propertyCard);
    const fallbackId = `zillow-property-${index}-${Date.now()}`;
    Logger.log('  Using fallback property ID:', fallbackId);
    return fallbackId;
  },

  // ============================================
  // INSERTION POINT DETECTION
  // ============================================
  
  findInsertionPoints() {
    const propertyCards = document.querySelectorAll('[data-test="property-card"]');
    
    if (propertyCards.length === 0) {
      Logger.log('No property cards found on this page');
      return [];
    }
    
    Logger.log(`Found ${propertyCards.length} property cards`);
    
    const insertionData = [];
    
    propertyCards.forEach((card, index) => {
      const propertyId = this.extractPropertyId(card);
      
      if (!propertyId) {
        Logger.warn(`  Skipping card ${index}: No property ID found`);
        return;
      }
      
      // Find the property-card-link to insert button next to it
      const linkElement = card.querySelector('[data-test="property-card-link"]');
      
      if (!linkElement) {
        Logger.warn(`  Skipping card ${index}: No property-card-link found`);
        return;
      }
      
      insertionData.push({
        insertionPoint: linkElement,
        productContainer: card,
        asin: propertyId, // Using asin field for consistency with content.js
        uuid: null,
        id: propertyId
      });
      
      Logger.log(`  ✓ Card ${index}: Property ID = ${propertyId}`);
    });
    
    return insertionData;
  },

  // ============================================
  // PRODUCT INFORMATION EXTRACTION
  // ============================================
  
  extractFromListingPage(propertyCard) {
    Logger.log('📦 Extracting property from listing page');
    
    const propertyId = this.extractPropertyId(propertyCard);
    
    if (!propertyId) {
      Logger.error('Cannot extract property: No property ID found');
      return null;
    }
    
    // Extract address
    let address = '';
    const addressElement = propertyCard.querySelector('address');
    if (addressElement) {
      address = addressElement.textContent.trim();
    } else {
      const linkElement = propertyCard.querySelector('[data-test="property-card-link"]');
      if (linkElement) {
        address = linkElement.textContent.trim();
      }
    }
    
    // Extract price
    let price = '';
    const priceElement = propertyCard.querySelector('[data-test="property-card-price"]');
    if (priceElement) {
      price = priceElement.textContent.trim();
    } else {
      const titleLinkElement = propertyCard.querySelector('[data-test="property-card-title-link"]');
      if (titleLinkElement) {
        // Sometimes price is in title-link
        price = titleLinkElement.textContent.trim();
      }
    }
    
    // Extract property details (beds, baths, sqft, property type)
    let beds = '';
    let baths = '';
    let sqft = '';
    let propertyType = '';
    
    // Try both data-test and data-testid
    const detailsElement = propertyCard.querySelector('[data-test="property-card-details"]') ||
                          propertyCard.querySelector('[data-testid="property-card-details"]');
    
    if (detailsElement) {
      const detailsText = detailsElement.textContent.trim();
      
      // Parse details - format: "3 bds 2 ba 1,206 sqft - House for sale"
      // Extract beds: number before "bd" or "bds"
      const bedsMatch = detailsText.match(/(\d+)\s*bds?/i);
      if (bedsMatch) beds = bedsMatch[1];
      
      // Extract baths: number (can be decimal) before "ba"
      const bathsMatch = detailsText.match(/(\d+(?:\.\d+)?)\s*ba/i);
      if (bathsMatch) baths = bathsMatch[1];
      
      // Extract sqft: number with optional comma before "sqft"
      const sqftMatch = detailsText.match(/([\d,]+)\s*sqft/i);
      if (sqftMatch) sqft = sqftMatch[1];
      
      // Extract property type: text after "sqft -" or after last dash
      const propertyTypeMatch = detailsText.match(/sqft\s*-\s*(.+)$/i) || 
                               detailsText.match(/-\s*(.+)$/);
      if (propertyTypeMatch) {
        propertyType = propertyTypeMatch[1].trim();
      }
    }
    
    // Extract property images using TreeWalker
    const images = [];
    const imgElements = propertyCard.querySelectorAll('img');
    imgElements.forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('data-src');
      if (src && !src.includes('data:image') && !images.includes(src)) {
        images.push(src);
      }
    });
    
    // Extract property quick info (badges like "New", "Price cut", etc.)
    const quickInfo = [];
    const badgeElements = propertyCard.querySelectorAll('[class*="StyledPropertyCardBadge"]');
    const seenBadges = new Set();
    
    badgeElements.forEach(badge => {
      const badgeText = badge.textContent.trim();
      if (badgeText && !seenBadges.has(badgeText)) {
        seenBadges.add(badgeText);
        quickInfo.push(badgeText);
      }
    });
    
    // Get property URL
    let propertyUrl = '';
    const linkElement = propertyCard.querySelector('[data-test="property-card-title-link"]');
    if (linkElement) {
      const href = linkElement.getAttribute('href');
      propertyUrl = href?.startsWith('http') ? href : `https://www.zillow.com${href}`;
    }
    
    const product = {
      product_id: propertyId,
      title: address,
      price: price,
      image: images[0] || '',
      propertyLink: propertyUrl,
      retailer: 'zillow',
      // Zillow-specific fields
      address: address,
      beds: beds,
      baths: baths,
      sqft: sqft,
      propertyType: propertyType,
      images: images,
      quickInfo: quickInfo,
      extractedAt: new Date().toISOString()
    };
    
    Logger.log('✅ Property extracted:', {
      id: propertyId,
      address: address.substring(0, 50),
      price: price,
      beds: beds,
      baths: baths,
      sqft: sqft,
      images: images.length
    });
    
    return product;
  },
  
  extractFromDetailPage() {
    Logger.log('📦 Extracting property from detail page');
    
    // Detail page extraction can be implemented later if needed
    // For now, return null as Zillow detail pages have different structure
    Logger.warn('Detail page extraction not yet implemented for Zillow');
    return null;
  },

  // ============================================
  // COMPARE BUTTON CREATION
  // ============================================
  
  createCompareButton(insertionPoint, productContainer, metadata, clickHandler) {
    const button = document.createElement('button');
    button.textContent = '+ Compare';
    button.className = 'smart-compare-btn zillow-compare-btn';
    button.setAttribute('data-compare-button', 'true');
    button.setAttribute('data-smart-product-id', metadata.asin || metadata.id);
    
    // Store metadata on button for click handler
    button._productContainer = productContainer;
    button._productMetadata = metadata;
    
    // Add click handler with event propagation prevention
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      clickHandler(button);
    }, true); // Use capture phase
    
    // Add Zillow-specific styling with absolute positioning
    button.style.cssText = `
      position: absolute;
      bottom: 8px;
      left: 8px;
      background-color: #0068fb;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
      z-index: 9999;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;
    
    // Ensure the product container has position: relative
    if (productContainer && window.getComputedStyle(productContainer).position === 'static') {
      productContainer.style.position = 'relative';
    }
    
    // Hover effect
    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#0056d6';
    });
    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '#0068fb';
    });
    
    return button;
  }
};

Logger.log('✅ Zillow Extractor loaded');
