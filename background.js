// Background script to handle badge updates and storage

// Update badge when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.comparison_items) {
    const items = changes.comparison_items.newValue || [];
    const activeCount = items.filter(item => item.status === 'active').length;
    updateBadge(activeCount);
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
    const activeCount = items.filter(item => item.status === 'active').length;
    updateBadge(activeCount);
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
  } else if (request.action === 'fetchPropertyDetails') {
    // Fetch additional property details in background
    fetchPropertyDetailsInBackground(request.url, request.productId)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error fetching details:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
  return true;
});

// Fetch property details in a background tab
async function fetchPropertyDetailsInBackground(url, productId) {
  console.log('🌐 [Background] Opening detail page:', url);
  
  try {
    // Create tab in background (active: false)
    const tab = await chrome.tabs.create({ url: url, active: false });
    console.log('📑 [Background] Background tab created:', tab.id);
    
    // Wait for tab to load
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.remove(tab.id).catch(() => {});
        reject(new Error('Timeout waiting for page to load'));
      }, 30000); // 30 second timeout
      
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeout);
          
          console.log('✅ [Background] Page loaded, extracting details');
          
          // Inject extraction script with scrolling
          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: extractZillowDetailsFromPage
            }, (results) => {
              // Close the background tab
              chrome.tabs.remove(tab.id).catch(() => {});
              
              if (chrome.runtime.lastError) {
                console.error('Script injection error:', chrome.runtime.lastError);
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              
              if (results && results[0] && results[0].result) {
                const details = results[0].result;
                console.log('✅ [Background] Details extracted:', details);
                
                // Update storage with additional details
                chrome.storage.local.get(['comparison_items'], (result) => {
                  const items = result.comparison_items || [];
                  const updatedItems = items.map(item => {
                    if (item.product_id === productId) {
                      return { ...item, ...details, detailsEnriched: true };
                    }
                    return item;
                  });
                  
                  chrome.storage.local.set({ comparison_items: updatedItems }, () => {
                    console.log('✅ [Background] Storage updated with enriched details');
                    resolve();
                  });
                });
              } else {
                console.warn('⚠️ [Background] No details extracted');
                resolve();
              }
            });
          }, 1000); // 1 second delay for initial rendering
        }
      });
    });
  } catch (error) {
    console.error('❌ [Background] Error:', error);
    throw error;
  }
}

// Function injected into detail page to extract data
function extractZillowDetailsFromPage() {
  return new Promise((resolve) => {
    const details = {};
    
    // Function to scroll to bottom
    const scrollToBottom = () => {
      return new Promise((scrollResolve) => {
        let totalHeight = 0;
        const distance = 500;
        const scrollDelay = 200;
        
        const timer = setInterval(() => {
          const scrollHeight = document.documentElement.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            // Wait a bit for lazy-loaded content to render
            setTimeout(scrollResolve, 1000);
          }
        }, scrollDelay);
      });
    };
    
    // First, scroll to bottom to load all content
    scrollToBottom().then(() => {
      try {
        // Extract beds, baths, sqft
        const bedBathContainer = document.querySelector('[data-testid="mobile-bed-bath-sqft"]') ||
                                document.querySelector('[data-testid="desktop-bed-bath-sqft"]');
        if (bedBathContainer) {
          const text = bedBathContainer.textContent;
          const bedMatch = text.match(/(\d+)\s*(?:bd|bed)/i);
          const bathMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:ba|bath)/i);
          const sqftMatch = text.match(/([\d,]+)\s*(?:sqft)/i);
          
          if (bedMatch) details.beds = bedMatch[1];
          if (bathMatch) details.baths = bathMatch[1];
          if (sqftMatch) details.sqft = sqftMatch[1].replace(/,/g, '');
        }
        
        // Extract at-a-glance facts
        const glanceContainer = document.querySelector('[data-testid="at-a-glance"]');
        if (glanceContainer) {
          const text = glanceContainer.textContent;
          
          const yearMatch = text.match(/Year Built[:\s]*([\d,]+)/i) || text.match(/Built in\s*([\d,]+)/i);
          const lotMatch = text.match(/Lot[:\s]*([\d,\.]+\s*(?:acres?|sq\s*ft))/i);
          const parkingMatch = text.match(/Parking[:\s]*([^\n]+?)(?:\n|$)/i);
          const heatingMatch = text.match(/Heating[:\s]*([^\n]+?)(?:\n|$)/i);
          const coolingMatch = text.match(/Cooling[:\s]*([^\n]+?)(?:\n|$)/i);
          
          if (yearMatch) details.yearBuilt = yearMatch[1];
          if (lotMatch) details.lotSize = lotMatch[1];
          if (parkingMatch) details.parking = parkingMatch[1].trim();
          if (heatingMatch) details.heating = heatingMatch[1].trim();
          if (coolingMatch) details.cooling = coolingMatch[1].trim();
        }
        
        // Extract description
        const descriptionElement = document.querySelector('[data-testid="description"]');
        if (descriptionElement) {
          const fullDesc = descriptionElement.textContent.trim();
          details.description = fullDesc.length > 200 ? fullDesc.substring(0, 200) + '...' : fullDesc;
        }
        
        // Extract stats
        const statsContainers = Array.from(document.querySelectorAll('[class*="StyledOverviewStats"]'));
        for (const container of statsContainers) {
          const text = container.textContent;
          const daysMatch = text.match(/(\d+)\s*days?\s*on\s*Zillow/i);
          const viewsMatch = text.match(/([\d,]+)\s*views?/i);
          const savesMatch = text.match(/(\d+)\s*saves?/i);
          
          if (daysMatch) details.daysOnZillow = daysMatch[1];
          if (viewsMatch) details.views = viewsMatch[1].replace(/,/g, '');
          if (savesMatch) details.saves = savesMatch[1];
          if (daysMatch || viewsMatch || savesMatch) break;
        }
        
        // Extract estimated monthly payment
        const paymentModule = document.querySelector('[data-testid="chip-personalize-payment-module"]');
        if (paymentModule) {
          const paymentMatch = paymentModule.textContent.match(/\$[\d,]+/);
          if (paymentMatch) details.estimatedMonthly = paymentMatch[0];
        }
        
        // Extract schools (now that we've scrolled)
        const inlineContainers = document.querySelectorAll('[data-renderstrat="inline"]');
        for (const container of inlineContainers) {
          const h2 = container.querySelector('h2');
          if (h2 && h2.textContent.trim() === 'Nearby schools') {
            const schools = [];
            const schoolElements = container.querySelectorAll('li, [class*="school"]');
            
            schoolElements.forEach((schoolEl, index) => {
              if (index >= 3) return;
              const text = schoolEl.textContent.trim();
              if (!text || text === 'Nearby schools') return;
              
              const ratingMatch = text.match(/(\d+)\/10/);
              const rating = ratingMatch ? ratingMatch[1] : '';
              let schoolName = text.split(/\d+\/10/)[0].trim();
              schoolName = schoolName.split(/\d+\.\d+\s*mi/)[0].trim();
              schoolName = schoolName.replace(/^\d+\.\s*/, '');
              
              if (schoolName && schoolName.length > 3) {
                schools.push(rating ? `${schoolName} (${rating}/10)` : schoolName);
              }
            });
            
            if (schools.length > 0) {
              details.nearbySchools = schools.join(', ');
            }
            break;
          }
        }
        
      } catch (error) {
        console.error('Error extracting details:', error);
      }
      
      resolve(details);
    });
  });
}

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
