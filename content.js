// Content script to add Compare button - Modular architecture for multi-retailer support

// ============================================
// COMPARISON MANAGER - Handles storage and limits
// ============================================
const ComparisonManager = {
  MAX_ITEMS: 5,
  STORAGE_KEY: 'comparison_items',

  async getItems() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([this.STORAGE_KEY], (result) => {
          if (chrome.runtime.lastError) {
            console.error('Extension context invalidated:', chrome.runtime.lastError);
            resolve([]);
            return;
          }
          resolve(result[this.STORAGE_KEY] || []);
        });
      } catch (error) {
        console.error('Error getting items:', error);
        resolve([]);
      }
    });
  },

  async addItem(product) {
    const items = await this.getItems();
    
    // Add status and timestamp to product
    product.status = 'active';
    product.addedAt = new Date().toISOString();
    
    // Check if product_id already exists
    const existingIndex = items.findIndex(item => item.product_id === product.product_id);
    
    if (existingIndex !== -1) {
      const existingProduct = items[existingIndex];
      
      // If product was previously removed, reactivate it
      if (existingProduct.status === 'removed') {
        items[existingIndex] = { ...product, reactivatedAt: new Date().toISOString() };
        
        return new Promise((resolve) => {
          try {
            chrome.storage.local.set({ [this.STORAGE_KEY]: items }, () => {
              if (chrome.runtime.lastError) {
                console.error('Extension context invalidated:', chrome.runtime.lastError);
                resolve({ success: false, message: 'Extension was reloaded. Please refresh the page.' });
                return;
              }
              const activeCount = items.filter(item => item.status === 'active').length;
              resolve({ success: true, message: 'Product reactivated in comparison', count: activeCount, isReactivated: true });
            });
          } catch (error) {
            console.error('Error reactivating item:', error);
            resolve({ success: false, message: 'Failed to reactivate product. Please refresh the page.' });
          }
        });
      }
      
      // Update existing active product
      items[existingIndex] = { ...product, updatedAt: new Date().toISOString() };
      
      return new Promise((resolve) => {
        try {
          chrome.storage.local.set({ [this.STORAGE_KEY]: items }, () => {
            if (chrome.runtime.lastError) {
              console.error('Extension context invalidated:', chrome.runtime.lastError);
              resolve({ success: false, message: 'Extension was reloaded. Please refresh the page.' });
              return;
            }
            const activeCount = items.filter(item => item.status === 'active').length;
            resolve({ success: true, message: 'Product updated in comparison', count: activeCount, isReplaced: true });
          });
        } catch (error) {
          console.error('Error updating item:', error);
          resolve({ success: false, message: 'Failed to update product. Please refresh the page.' });
        }
      });
    }
    
    // Check limit for active items only
    const activeItems = items.filter(item => item.status === 'active');
    if (activeItems.length >= this.MAX_ITEMS) {
      return { success: false, message: `Maximum ${this.MAX_ITEMS} items can be compared`, isLimitReached: true };
    }
    
    items.push(product);
    
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [this.STORAGE_KEY]: items }, () => {
          if (chrome.runtime.lastError) {
            console.error('Extension context invalidated:', chrome.runtime.lastError);
            resolve({ success: false, message: 'Extension was reloaded. Please refresh the page.' });
            return;
          }
          const activeCount = items.filter(item => item.status === 'active').length;
          resolve({ success: true, message: 'Product added to comparison', count: activeCount });
        });
      } catch (error) {
        console.error('Error adding item:', error);
        resolve({ success: false, message: 'Failed to add product. Please refresh the page.' });
      }
    });
  },

  async removeItem(productId) {
    const items = await this.getItems();
    
    // Soft delete: mark as removed instead of deleting
    const updatedItems = items.map(item => {
      if (item.product_id === productId) {
        return { ...item, status: 'removed', removedAt: new Date().toISOString() };
      }
      return item;
    });
    
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [this.STORAGE_KEY]: updatedItems }, () => {
          if (chrome.runtime.lastError) {
            console.error('Extension context invalidated:', chrome.runtime.lastError);
            resolve({ success: false, count: 0 });
            return;
          }
          const activeCount = updatedItems.filter(item => item.status === 'active').length;
          resolve({ success: true, count: activeCount });
        });
      } catch (error) {
        console.error('Error removing item:', error);
        resolve({ success: false, count: 0 });
      }
    });
  }
};

// ============================================
// RETAILER DETECTION
// ============================================
function detectRetailer() {
  const hostname = window.location.hostname;
  
  if (Config.isAllowedDomain(hostname)) {
    Logger.log('🏪 Retailer detected: Amazon');
    Logger.log('🔧 AmazonExtractor available:', !!window.AmazonExtractor);
    return window.AmazonExtractor;
  }
  
  // Add more retailer detection here in the future
  // if (hostname.includes('walmart.com')) return window.WalmartExtractor;
  
  Logger.warn('⚠️ Retailer not supported:', hostname);
  return null;
}

// ============================================
// COMPARE BUTTON CLICK HANDLER
// ============================================
async function handleCompareClick(buttonElement) {
  const extractor = detectRetailer();
  if (!extractor) return;
  
  Logger.log('🖱️ Compare button clicked!');
  
  // Get product container and metadata from button
  const productContainer = buttonElement._productContainer;
  const metadata = buttonElement._productMetadata;
  
  Logger.log('📦 Product metadata:', metadata);
  
  // Extract product information on click
  let product = null;
  
  if (extractor.isProductListPage()) {
    // Extract from listing page using the product container
    product = extractor.extractFromListingPage(productContainer);
  } else if (extractor.isProductDetailPage()) {
    // Check if this is a recommended product (has container) or main product (no container)
    if (productContainer) {
      // This is a recommended product - extract from its container (treat like listing page)
      Logger.log('📦 Extracting recommended product from container');
      product = extractor.extractFromListingPage(productContainer);
    } else {
      // This is the main product - extract from detail page
      Logger.log('📦 Extracting main product from detail page');
      product = extractor.extractFromDetailPage();
    }
  }
  
  if (!product) {
    console.error('❌ Failed to extract product information');
    return;
  }
  
  // Final fallback: If product_id is missing, use data-smart-product-id from button
  if (!product.product_id) {
    const buttonProductId = buttonElement.getAttribute('data-smart-product-id');
    if (buttonProductId) {
      product.product_id = buttonProductId;
      Logger.log('✅ Using product_id from button attribute:', buttonProductId);
    } else {
      Logger.warn('⚠️ No product_id found in extraction or button');
    }
  }
  
  Logger.log('📦 Product extracted:', product?.title?.substring(0, 50), 'ID:', product.product_id);
  
  // Add to comparison list
  const result = await ComparisonManager.addItem(product);
  
  if (result.success) {
    if (result.isReplaced) {
      Logger.log(`✓ Product updated in comparison (${result.count}/${ComparisonManager.MAX_ITEMS})`);
    } else {
      Logger.log(`✓ Added to comparison (${result.count}/${ComparisonManager.MAX_ITEMS})`);
    }
  } else if (result.isLimitReached) {
    Logger.log(`Limit reached (${ComparisonManager.MAX_ITEMS} items max)`);
  }
}

// ============================================
// BUTTON INSERTION
// ============================================
function insertCompareButtons() {
  const extractor = detectRetailer();
  if (!extractor) {
    Logger.log('⚠️ Retailer not supported');
    return;
  }
  
  const insertionData = extractor.findInsertionPoints();
  
  if (insertionData.length === 0) {
    Logger.log('⚠️ No insertion points found on this page');
    return;
  }
  
  Logger.log(`🔘 Found ${insertionData.length} insertion points`);
  
  // Track inserted product IDs to prevent duplicates
  const insertedProductIds = new Set();
  
  insertionData.forEach((data) => {
    const { insertionPoint, productContainer, asin, uuid, id } = data;
    
    // Skip if we already inserted a button for this product ID in this run
    if (asin && insertedProductIds.has(asin)) {
      Logger.log(`  Skipping duplicate button for ASIN: ${asin}`);
      return;
    }
    
    // Check if compare button already exists in the product container or as next sibling
    // First check the container for any existing button with this product ID
    if (productContainer) {
      const existingButton = productContainer.querySelector(`button[data-smart-product-id="${asin}"]`);
      if (existingButton) {
        Logger.log(`  Button already exists in container for ASIN: ${asin}`);
        insertedProductIds.add(asin); // Track it to prevent duplicates in this run
        return;
      }
    }
    
    // Also check next sibling (for main product or when container is null)
    const nextSibling = insertionPoint.nextSibling;
    if (nextSibling?.nodeType === 1 && nextSibling.hasAttribute('data-compare-button')) {
      const existingProductId = nextSibling.getAttribute('data-smart-product-id');
      if (existingProductId === asin) {
        Logger.log(`  Button already exists as next sibling for ASIN: ${asin}`);
        insertedProductIds.add(asin); // Track it to prevent duplicates in this run
        return;
      }
    }
    
    // Validate insertion point
    if (!insertionPoint) {
      Logger.warn(`  No insertion point found for ASIN: ${asin}`);
      return;
    }
    
    // Create metadata object
    const metadata = { asin, uuid, id };
    
    // Create button without extracting product info
    // Extraction will happen on click
    const compareButton = extractor.createCompareButton(
      insertionPoint, 
      productContainer, 
      metadata, 
      handleCompareClick
    );
    
    // Insert button based on insertion point type
    try {
      if (insertionPoint.parentNode) {
        // Insert as next sibling of the insertion point
        insertionPoint.parentNode.insertBefore(compareButton, insertionPoint.nextSibling);
        Logger.log(`  ✅ Button inserted for ASIN: ${asin}`);
      } else if (insertionPoint.appendChild) {
        // If no parent, try to append to the insertion point itself
        insertionPoint.appendChild(compareButton);
        Logger.log(`  ✅ Button appended to container for ASIN: ${asin}`);
      } else {
        Logger.warn(`  ⚠️ Could not insert button for ASIN: ${asin} - no valid insertion method`);
        return;
      }
    } catch (error) {
      Logger.error(`  ❌ Error inserting button for ASIN: ${asin}`, error.message);
      return;
    }
    
    // Track this product ID as inserted
    if (asin) {
      insertedProductIds.add(asin);
    }
  });
  
  Logger.log('✓ Compare buttons inserted');
}

// ============================================
// INITIALIZATION
// ============================================

// Run when page loads
insertCompareButtons();

// Watch for dynamic content changes
const observer = new MutationObserver(() => {
  insertCompareButtons();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

Logger.log('🚀 Compareon Extension loaded');
