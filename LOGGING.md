# Logging Control Guide

## Quick Toggle

To enable/disable all logging across the extension:

1. Open `config.js`
2. Change `DEBUG_MODE: false` to `DEBUG_MODE: true` (or vice versa)
3. Reload the extension in Chrome

## Usage in Code

Replace all `console.log`, `console.warn`, and `console.info` with the Logger:

### Before:
```javascript
console.log('Some message');
console.warn('Warning message');
console.error('Error message');
```

### After:
```javascript
Logger.log('Some message');      // Only shows when DEBUG_MODE is true
Logger.warn('Warning message');  // Only shows when DEBUG_MODE is true
Logger.error('Error message');   // Always shows (errors are always logged)
```

## Configuration Options

All centralized in `config.js`:

- **DEBUG_MODE**: Master switch for logging (true/false)
- **API_BASE_URL**: Backend API URL
- **LOVABLE_APP_URL**: Frontend app URL
- **MAX_COMPARISON_ITEMS**: Maximum products (currently 5)
- **STORAGE_KEYS**: Chrome storage key names

## Files Updated

- ✅ `config.js` - Created with Config and Logger
- ✅ `manifest.json` - Added config.js to content_scripts
- ✅ `popup.html` - Added config.js script tag

## Next Steps (Optional)

Replace console calls in these files with Logger:
- `amazon.js` - Product extraction logging
- `content.js` - Button insertion logging
- `popup.js` - UI and API logging
- `background.js` - Background service logging

## Example Replacement Pattern

Find: `console.log(`
Replace with: `Logger.log(`

Find: `console.warn(`
Replace with: `Logger.warn(`

**Note**: Keep `console.error(` as is, or change to `Logger.error(` (both work the same)
