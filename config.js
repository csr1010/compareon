// ============================================
// CENTRAL CONFIGURATION
// ============================================

const Config = {
  // Logging control
  DEBUG_MODE: true, // Set to true to enable all logging, false to disable
  
  // Limits
  MAX_COMPARISON_ITEMS: 5,
  
  // Storage keys
  STORAGE_KEYS: {
    BROWSER_UUID: 'browser_uuid',
    COMPARISON_ITEMS: 'comparison_items',
    CURRENT_SESSION: 'current_session'
  },
  
  // Allowlisted domains for extension functionality
  ALLOWED_DOMAINS: [
    'amazon.com',
    'amazon.ca',
    'amazon.co.uk',
    'amazon.in',
    'zillow.com',
    // Add more domains here as needed
  ],
  
  // Check if current domain is allowed
  isAllowedDomain: function(hostname) {
    if (!hostname) return false;
    return this.ALLOWED_DOMAINS.some(domain => hostname.includes(domain));
  },
  
  // Get comparison URL based on debug mode
  getComparisonUrl: function(uuid) {
    const baseUrl = this.DEBUG_MODE 
      ? 'https://id-preview--7e0abc19-f325-43fa-b60b-6e7c90ba1b34.lovable.app'
      : 'https://www.compareon.xyz';
    return `${baseUrl}/compare/${uuid}`;
  }
};

// Logging wrapper functions
const Logger = {
  log: (...args) => {
    if (Config.DEBUG_MODE) {
      console.log(...args);
    }
  },
  
  warn: (...args) => {
    if (Config.DEBUG_MODE) {
      console.warn(...args);
    }
  },
  
  error: (...args) => {
    // Always log errors regardless of debug mode
    console.error(...args);
  },
  
  info: (...args) => {
    if (Config.DEBUG_MODE) {
      console.info(...args);
    }
  }
};

// Export for use in other scripts
window.Config = Config;
window.Logger = Logger;

console.log('✅ Config loaded - Debug mode:', Config.DEBUG_MODE);
