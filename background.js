// Background script to handle badge updates and storage

// Update badge when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.comparison_items) {
    const items = changes.comparison_items.newValue || [];
    updateBadge(items.length);
  }
});

// Update badge function
function updateBadge(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#4A90E2' }); // Compareon blue
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Initialize badge on startup
chrome.runtime.onStartup.addListener(() => {
  initializeBadge();
});

// Initialize badge when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  initializeBadge();
});

// Initialize badge count
function initializeBadge() {
  chrome.storage.local.get(['comparison_items'], (result) => {
    const items = result.comparison_items || [];
    updateBadge(items.length);
  });
}

// Listen for messages from content script and external domains
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  // Only allow messages from compareon.xyz
  if (!sender.url || !sender.url.includes('compareon.xyz')) {
    sendResponse({ success: false, error: 'Unauthorized' });
    return;
  }

  if (request.action === 'getProducts') {
    // Return all products from chrome.storage.local
    chrome.storage.local.get(['comparison_items', 'browser_uuid'], (result) => {
      const items = result.comparison_items || [];
      sendResponse({ 
        success: true, 
        products: items,
        sessionId: result.browser_uuid 
      });
    });
    return true; // Keep channel open for async response
  } else if (request.action === 'removeProduct') {
    // Mark product as removed (soft delete)
    const productId = request.product_id;
    chrome.storage.local.get(['comparison_items'], (result) => {
      const items = result.comparison_items || [];
      const updatedItems = items.map(item => {
        if (item.product_id === productId) {
          return { ...item, status: 'removed', removedAt: new Date().toISOString() };
        }
        return item;
      });
      
      chrome.storage.local.set({ comparison_items: updatedItems }, () => {
        const activeCount = updatedItems.filter(item => item.status === 'active').length;
        updateBadge(activeCount);
        sendResponse({ success: true, count: activeCount });
      });
    });
    return true; // Keep channel open for async response
  }
  
  sendResponse({ success: false, error: 'Unknown action' });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateBadge') {
    updateBadge(request.count);
    sendResponse({ success: true });
  } else if (request.action === 'initializeBadge') {
    initializeBadge();
    sendResponse({ success: true });
  }
  return true;
});

// Helper function to get active products count
function getActiveProductsCount() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['comparison_items'], (result) => {
      const items = result.comparison_items || [];
      const activeItems = items.filter(item => item.status === 'active');
      resolve(activeItems.length);
    });
  });
}

// Initialize badge immediately
initializeBadge();
