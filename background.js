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

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateBadge') {
    updateBadge(request.count);
    sendResponse({ success: true });
  } else if (request.action === 'initializeBadge') {
    initializeBadge();
    sendResponse({ success: true });
  } else if (request.action === 'callCompareAPI') {
    // Handle API call to avoid CORS issues
    handleCompareAPICall(request.payload)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  } else if (request.action === 'addToCompare') {
    // Handle add to compare API call
    handleAddToCompare(request.payload)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  return true;
});

// Handle API call
async function handleCompareAPICall(payload) {
  const API_ENDPOINT = 'https://nriroots-production.up.railway.app/api/compare';
  
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// Handle add to compare API call
async function handleAddToCompare(payload) {
  const API_ENDPOINT = 'https://nriroots-production.up.railway.app/api/compare/addtocompare';
  
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Add to compare API call failed:', error);
    throw error;
  }
}

// Initialize badge immediately
initializeBadge();
