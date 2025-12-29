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
    
    // Extract zpid from URL
    const zpidMatch = window.location.pathname.match(/\/(\d+)_zpid/);
    if (!zpidMatch) {
      Logger.error('Could not extract zpid from URL');
      return null;
    }
    const zpid = zpidMatch[1];
    
    // Extract address and price from home-info
    let address = '';
    let price = '';
    
    const homeInfoContainer = document.querySelector('[data-testid="home-info"]');
    if (homeInfoContainer) {
      const addressElement = homeInfoContainer.querySelector('h1');
      if (addressElement) {
        address = addressElement.textContent.trim();
      }
    }
    
    // Extract price from data-testid="price"
    const priceElement = document.querySelector('[data-testid="price"]');
    if (priceElement) {
      price = priceElement.textContent.trim();
    }
    
    // Fallback for address and price
    if (!address) {
      const addressElement = document.querySelector('h1[data-test="property-address"]') || document.querySelector('h1');
      address = addressElement ? addressElement.textContent.trim() : '';
    }
    if (!price) {
      const fallbackPrice = document.querySelector('[data-test="property-price"]');
      price = fallbackPrice ? fallbackPrice.textContent.trim() : '';
    }
    
    // Extract beds, baths, sqft from bed-bath-sqft
    let beds = '';
    let baths = '';
    let sqft = '';
    
    const bedBathContainer = document.querySelector('[data-testid="mobile-bed-bath-sqft"]') ||
                            document.querySelector('[data-testid="desktop-bed-bath-sqft"]');
    if (bedBathContainer) {
      const text = bedBathContainer.textContent;
      Logger.log('🛏️ Bed/Bath/Sqft text:', text);
      
      const bedMatch = text.match(/(\d+)\s*(?:bd|bed|bedroom)/i);
      const bathMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:ba|bath|bathroom)/i);
      const sqftMatch = text.match(/([\d,]+)\s*(?:sqft|sq\s*ft)/i);
      
      if (bedMatch) beds = bedMatch[1];
      if (bathMatch) baths = bathMatch[1];
      if (sqftMatch) sqft = sqftMatch[1].replace(/,/g, '');
    }
    
    // Extract property details from "At a glance"
    let yearBuilt = '';
    let lotSize = '';
    let parking = '';
    let heating = '';
    let cooling = '';
    
    const glanceContainer = document.querySelector('[data-testid="at-a-glance"]');
    if (glanceContainer) {
      const factsText = glanceContainer.textContent;
      Logger.log('📊 At a glance text:', factsText);
      
      const yearMatch = factsText.match(/Year Built[:\s]*([\d,]+)/i) || 
                       factsText.match(/Built in\s*([\d,]+)/i);
      const lotMatch = factsText.match(/Lot[:\s]*([\d,\.]+\s*(?:acres?|sq\s*ft))/i);
      const parkingMatch = factsText.match(/Parking[:\s]*([^\n]+?)(?:\n|$)/i);
      const heatingMatch = factsText.match(/Heating[:\s]*([^\n]+?)(?:\n|$)/i);
      const coolingMatch = factsText.match(/Cooling[:\s]*([^\n]+?)(?:\n|$)/i);
      
      if (yearMatch) yearBuilt = yearMatch[1];
      if (lotMatch) lotSize = lotMatch[1];
      if (parkingMatch) parking = parkingMatch[1].trim();
      if (heatingMatch) heating = heatingMatch[1].trim();
      if (coolingMatch) cooling = coolingMatch[1].trim();
    }
    
    // Extract description
    let description = '';
    const descriptionElement = document.querySelector('[data-testid="description"]');
    if (descriptionElement) {
      const fullDesc = descriptionElement.textContent.trim();
      description = fullDesc.length > 200 ? fullDesc.substring(0, 200) + '...' : fullDesc;
    }
    
    // Extract social stats from StyledOverviewStats
    let daysOnZillow = '';
    let views = '';
    let saves = '';
    
    const statsContainers = Array.from(document.querySelectorAll('[class*="StyledOverviewStats"]'));
    for (const container of statsContainers) {
      const statsText = container.textContent.trim();
      
      const daysMatch = statsText.match(/(\d+)\s*days?\s*on\s*Zillow/i);
      const viewsMatch = statsText.match(/([\d,]+)\s*views?/i);
      const savesMatch = statsText.match(/(\d+)\s*saves?/i);
      
      if (daysMatch) daysOnZillow = daysMatch[1];
      if (viewsMatch) views = viewsMatch[1].replace(/,/g, '');
      if (savesMatch) saves = savesMatch[1];
      
      if (daysOnZillow || views || saves) break; // Found stats, stop looking
    }
    
    // Extract estimated monthly payment
    let estimatedMonthly = '';
    const paymentModule = document.querySelector('[data-testid="chip-personalize-payment-module"]');
    if (paymentModule) {
      const paymentText = paymentModule.textContent;
      const paymentMatch = paymentText.match(/\$[\d,]+/);
      if (paymentMatch) {
        estimatedMonthly = paymentMatch[0];
      }
    }
    
    // Extract nearby schools
    let nearbySchools = '';
    const inlineContainers = document.querySelectorAll('[data-renderstrat="inline"]');
    
    for (const container of inlineContainers) {
      const h2 = container.querySelector('h2');
      if (h2 && h2.textContent.trim() === 'Nearby schools') {
        const schools = [];
        
        // Try to find school elements within this container
        const schoolElements = container.querySelectorAll('li, [class*="school"]');
        
        schoolElements.forEach((schoolEl, index) => {
          if (index >= 3) return; // Only top 3 schools
          
          const text = schoolEl.textContent.trim();
          if (!text || text === 'Nearby schools') return;
          
          // Try to extract school name and rating
          const ratingMatch = text.match(/(\d+)\/10/);
          const rating = ratingMatch ? ratingMatch[1] : '';
          
          // Get school name (text before rating or distance info)
          let schoolName = text.split(/\d+\/10/)[0].trim();
          schoolName = schoolName.split(/\d+\.\d+\s*mi/)[0].trim();
          schoolName = schoolName.replace(/^\d+\.\s*/, ''); // Remove numbering like "1. "
          
          if (schoolName && schoolName.length > 3) {
            schools.push(rating ? `${schoolName} (${rating}/10)` : schoolName);
          }
        });
        
        if (schools.length > 0) {
          nearbySchools = schools.join(', ');
        }
        break;
      }
    }
    
    // Extract images
    const images = [];
    const imageElements = document.querySelectorAll('[data-test="property-photo"] img, [class*="MediaCarousel"] img, picture img');
    imageElements.forEach(img => {
      const src = img.src || img.getAttribute('data-src');
      if (src && !src.includes('data:image') && !images.includes(src)) {
        images.push(src);
      }
    });
    
    // Extract property URL
    const propertyUrl = window.location.href.split('?')[0]; // Remove query params
    
    const product = {
      product_id: zpid,
      title: address,
      price: price,
      image: images[0] || '',
      propertyLink: propertyUrl,
      retailer: 'zillow',
      address: address,
      beds: beds,
      baths: baths,
      sqft: sqft,
      images: images,
      extractedAt: new Date().toISOString(),
      extractedFrom: 'detail-page',
      // Additional detail page fields
      description: description,
      yearBuilt: yearBuilt,
      lotSize: lotSize,
      parking: parking,
      heating: heating,
      cooling: cooling,
      daysOnZillow: daysOnZillow,
      views: views,
      saves: saves,
      estimatedMonthly: estimatedMonthly,
      nearbySchools: nearbySchools
    };
    
    Logger.log('✅ Property extracted from detail page:', {
      id: zpid,
      address: address.substring(0, 50),
      price: price,
      beds: beds,
      baths: baths,
      sqft: sqft,
      images: images.length,
      yearBuilt: yearBuilt,
      description: description ? 'Yes' : 'No',
      stats: `${daysOnZillow} days, ${views} views, ${saves} saves`,
      estimatedMonthly: estimatedMonthly,
      schools: nearbySchools ? 'Yes' : 'No'
    });
    
    return product;
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
    
    // Add click handler with two-phase extraction
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Phase 1: Extract basic data from card immediately
      const product = window.ZillowExtractor.extractFromListingPage(productContainer);
      
      if (product) {
        // Add to storage immediately
        chrome.storage.local.get(['comparison_items'], (result) => {
          const items = result.comparison_items || [];
          
          product.status = 'active';
          product.addedAt = new Date().toISOString();
          
          const existingIndex = items.findIndex(item => item.product_id === product.product_id);
          
          if (existingIndex !== -1) {
            items[existingIndex] = { ...product, updatedAt: new Date().toISOString() };
          } else {
            const activeItems = items.filter(item => item.status === 'active');
            if (activeItems.length >= 5) {
              alert('Maximum 5 items can be compared');
              return;
            }
            items.push(product);
          }
          
          chrome.storage.local.set({ comparison_items: items }, () => {
            const activeCount = items.filter(item => item.status === 'active').length;
            
            // Update badge
            chrome.runtime.sendMessage({ action: 'updateBadge', count: activeCount });
            
            // Phase 2: Fetch additional details in background
            const linkElement = productContainer.querySelector('[data-test="property-card-title-link"]');
            if (linkElement) {
              const href = linkElement.getAttribute('href');
              const fullUrl = href?.startsWith('http') ? href : `https://www.zillow.com${href}`;
              
              Logger.log('🔄 Fetching additional details in background:', fullUrl);
              
              chrome.runtime.sendMessage({
                action: 'fetchPropertyDetails',
                url: fullUrl,
                productId: product.product_id
              });
            }
          });
        });
      }
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
