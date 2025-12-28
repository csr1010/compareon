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

// Load products from local storage only
async function loadProductsFromStorage() {
  const items = await loadComparisonItems();
  // Filter to show only active products
  comparisonItems = items.filter(item => item.status === 'active');
  Logger.log('Loaded active products:', comparisonItems.length);
  renderProductList();
}

// Open comparison page
async function openComparisonPage() {
  if (comparisonItems.length < 2) {
    Logger.warn('⚠️ Please add at least 2 products to compare');
    return;
  }

  try {
    // Get or create browser UUID
    const browserUUID = await getBrowserUUID();
    
    // Store session data locally
    const sessionData = {
      sessionId: browserUUID,
      products: comparisonItems,
      createdAt: new Date().toISOString()
    };

    chrome.storage.local.set({ 
      current_session: sessionData,
      last_comparison_time: Date.now()
    }, () => {
      Logger.log('Session created and stored locally:', sessionData);
      Logger.log(`✅ Opening comparison page`);
      Logger.log(`📋 Session ID: ${browserUUID}`);
      
      // Open comparison page with session ID
      const comparisonUrl = Config.getComparisonUrl(browserUUID);
      chrome.tabs.create({ url: comparisonUrl });
    });

  } catch (error) {
    console.error('❌ Failed to open comparison page:', error);
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

// Remove product from comparison (soft delete)
async function removeProduct(product_id) {
  // Get all items from storage
  chrome.storage.local.get(['comparison_items'], (result) => {
    const items = result.comparison_items || [];
    
    // Mark product as removed
    const updatedItems = items.map(item => {
      if (item.product_id === product_id) {
        return { ...item, status: 'removed', removedAt: new Date().toISOString() };
      }
      return item;
    });
    
    // Update storage
    chrome.storage.local.set({ comparison_items: updatedItems }, () => {
      Logger.log('Product marked as removed:', product_id);
      // Reload to show only active products
      loadProductsFromStorage();
    });
  });
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadProductsFromStorage();
  
  document.getElementById('compareBtn').addEventListener('click', openComparisonPage);
  
  // Add refresh button handler
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    await loadProductsFromStorage();
    refreshBtn.disabled = false;
  });
});
