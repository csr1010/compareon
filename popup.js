// Popup script to display and manage comparison list

let comparisonItems = [];

// Generate a unique browser UUID (persists across sessions)
async function getBrowserUUID() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['browser_uuid'], (result) => {
      if (result.browser_uuid) {
        resolve(result.browser_uuid);
      } else {
        // Generate new UUID using crypto API
        const uuid = crypto.randomUUID();
        chrome.storage.local.set({ browser_uuid: uuid }, () => {
          resolve(uuid);
        });
      }
    });
  });
}

// Fetch products from API
async function fetchProductsFromAPI() {
  try {
    const uuid = await getBrowserUUID();
    if (!uuid) {
      Logger.log('No session ID found, skipping API call');
      return;
    }

    Logger.log('Fetching products from API for UUID:', uuid);
    const response = await fetch(`https://nriroots-production.up.railway.app/api/compare/getproducts/${uuid}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.products && Array.isArray(data.products)) {
      // Get the latest local items first
      const localItems = await loadComparisonItems();
      
      Logger.log('Local items before merge:', localItems.length, localItems.map(p => p.product_id));
      Logger.log('API items:', data.products.length, data.products.map(p => p.product_id));
      
      // Merge API products with local products
      // Create a map of existing products by product_id to avoid duplicates
      const productMap = new Map();
      
      // First, add API products (server is source of truth for synced products)
      data.products.forEach(product => {
        if (product.product_id) {
          productMap.set(product.product_id, product);
        }
      });
      
      // Then add local products that aren't in API yet (newly added but not synced)
      localItems.forEach(product => {
        if (product.product_id && !productMap.has(product.product_id)) {
          // This is a local product not yet synced to API - keep it
          Logger.log('✓ Preserving local product not in API:', product.product_id, product.title?.substring(0, 30));
          productMap.set(product.product_id, product);
        } else if (product.product_id) {
          Logger.log('✗ Product already in API, using API version:', product.product_id);
        } else {
          Logger.warn('⚠️ Product has no product_id:', product);
        }
      });
      
      // Convert map back to array
      comparisonItems = Array.from(productMap.values());
      
      Logger.log('Final merged items:', comparisonItems.length, comparisonItems.map(p => p.product_id));
      
      // Update local storage
      chrome.storage.local.set({ comparison_items: comparisonItems }, () => {
        Logger.log('Products synced from API');
        renderProductList();
      });
    }
  } catch (error) {
    console.error('Failed to fetch products from API:', error);
  }
}

// Create comparison session via API
async function createComparisonSession() {
  if (comparisonItems.length < 2) {
    Logger.warn('⚠️ Please add at least 2 products to compare');
    return;
  }

  try {
    // Get or create browser UUID
    const browserUUID = await getBrowserUUID();
    
    // Prepare API payload
    const payload = {
      sessionId: browserUUID,
      products: comparisonItems,
      timestamp: new Date().toISOString()
    };

    // Show loading state
    const compareBtn = document.getElementById('compareBtn');
    const originalText = compareBtn.textContent;
    compareBtn.disabled = true;
    compareBtn.textContent = 'Creating Session...';

    // Call API via background script to avoid CORS
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'addToCompare', payload: payload },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'API call failed'));
          }
        }
      );
    });

    // Store session data in localStorage
    const sessionData = {
      sessionId: browserUUID,
      products: comparisonItems,
      apiResponse: response,
      createdAt: new Date().toISOString()
    };

    chrome.storage.local.set({ 
      current_session: sessionData,
      last_comparison_time: Date.now()
    }, () => {
      Logger.log('Session created and stored:', sessionData);
      
      // Reset button
      compareBtn.disabled = false;
      compareBtn.textContent = originalText;
      
      // Log success message
      Logger.log(`✅ Comparison session created successfully!`);
      Logger.log(`📋 Session ID: ${browserUUID}`);
      
      // Open Lovable app with session ID
      const comparisonUrl = Config.getComparisonUrl(browserUUID);
      chrome.tabs.create({ url: comparisonUrl });
    });

  } catch (error) {
    console.error('❌ Failed to create comparison session:', error);
    console.error('Error details:', error.message);
    
    // Reset button
    const compareBtn = document.getElementById('compareBtn');
    compareBtn.disabled = comparisonItems.length < 2;
    compareBtn.textContent = 'Start Comparing';
  }
}

// Load comparison items
async function loadComparisonItems() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['comparison_items'], (result) => {
      comparisonItems = result.comparison_items || [];
      resolve(comparisonItems);
    });
  });
}

// Render the product list
function renderProductList() {
  const emptyState = document.getElementById('emptyState');
  const productList = document.getElementById('productList');
  const compareContainer = document.getElementById('compareContainer');
  const itemCount = document.getElementById('itemCount');
  const compareBtn = document.getElementById('compareBtn');
  
  if (comparisonItems.length === 0) {
    emptyState.style.display = 'block';
    productList.style.display = 'none';
    compareContainer.style.display = 'none';
    return;
  }
  
  emptyState.style.display = 'none';
  productList.style.display = 'block';
  compareContainer.style.display = 'block';
  
  itemCount.textContent = comparisonItems.length;
  compareBtn.disabled = comparisonItems.length < 2;
  
  productList.innerHTML = '';
  
  comparisonItems.forEach((product, index) => {
    const productItem = document.createElement('div');
    productItem.className = 'product-item';
    
    // Image container with delete button below
    const imageContainer = document.createElement('div');
    imageContainer.className = 'product-image-container';
    
    const img = document.createElement('img');
    img.className = 'product-image';
    img.src = product.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="60"%3E%3Crect fill="%23ddd" width="60" height="60"/%3E%3C/svg%3E';
    img.alt = product.title;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Remove';
    deleteBtn.onclick = () => removeProduct(product.product_id);
    
    imageContainer.appendChild(img);
    imageContainer.appendChild(deleteBtn);
    
    // Product info container (title + price)
    const info = document.createElement('div');
    info.className = 'product-info';
    
    const details = document.createElement('div');
    details.className = 'product-details';
    
    const title = document.createElement('p');
    title.className = 'product-title';
    title.textContent = product.title || 'Unknown Product';
    
    details.appendChild(title);
    
    // Add rating and reviews below title
    if (product.rating || product.reviewsCount || product.totalReviews) {
      const meta = document.createElement('p');
      meta.className = 'product-meta';
      const parts = [];
      
      if (product.rating) {
        parts.push(`⭐ ${product.rating}`);
      }
      
      const reviews = product.totalReviews || product.reviewsCount;
      if (reviews) {
        parts.push(`${reviews} reviews`);
      }
      
      meta.textContent = parts.join(' • ');
      details.appendChild(meta);
    }
    
    const price = document.createElement('p');
    price.className = 'product-price';
    price.textContent = product.price || 'Price N/A';
    
    info.appendChild(details);
    info.appendChild(price);
    
    productItem.appendChild(imageContainer);
    productItem.appendChild(info);
    
    productList.appendChild(productItem);
  });
}

// Remove product from comparison
async function removeProduct(product_id) {
  // Find the product
  const product = comparisonItems.find(item => item.product_id === product_id);
  
  // Remove from local array
  comparisonItems = comparisonItems.filter(item => item.product_id !== product_id);
  
  // Update local storage
  chrome.storage.local.set({ comparison_items: comparisonItems }, () => {
    renderProductList();
  });
  
  // Call API to remove product
  if (product_id) {
    try {
      const uuid = await getBrowserUUID();
      if (uuid) {
        const response = await fetch(
          `https://nriroots-production.up.railway.app/api/compare/removeproduct/${uuid}/${product_id}`,
          { method: 'POST' }
        );
        
        if (response.ok) {
          Logger.log('Product removed from API:', product_id);
        } else {
          console.error('Failed to remove product from API:', response.status);
        }
      }
    } catch (error) {
      console.error('Error removing product from API:', error);
    }
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadComparisonItems();
  renderProductList();
  
  // Fetch latest products from API
  await fetchProductsFromAPI();
  
  document.getElementById('compareBtn').addEventListener('click', createComparisonSession);
  
  // Add refresh button handler
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    
    await fetchProductsFromAPI();
    
    refreshBtn.disabled = false;
  });
});
