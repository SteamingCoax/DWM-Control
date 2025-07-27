# Tab Management System

The DWM Control application now includes a flexible tab management system that allows you to show or hide tabs based on feature readiness or user preferences.

## Quick Setup

To disable a tab that's not ready for production, simply modify the `tabConfig` in the constructor:

```javascript
// In renderer.js constructor
this.tabConfig = {
    firmware: {
        enabled: true,        // ✅ Ready - show this tab
        label: 'Firmware Upload',
        icon: '🔧',
        description: 'Upload firmware to DFU devices'
    },
    terminal: {
        enabled: false,       // ❌ Not ready - hide this tab
        label: 'Serial Terminal',
        icon: '💻',
        description: 'Serial communication with devices'
    },
    control: {
        enabled: true,        // ✅ Ready - show this tab
        label: 'Control',
        icon: '🎛️',
        description: 'Device control and power monitoring'
    }
};
```

## User Interface

Users can manage tab visibility through the **Tab Management** section in the Control tab:

- **Toggle switches** - Enable/disable individual tabs
- **Show All** button - Enable all tabs
- **Hide All** button - Disable all tabs (keeps one enabled)
- **Reset** button - Reset to default configuration

## Developer Console API

You can control tabs programmatically from the browser console:

### Basic Commands
```javascript
// Hide a tab
dwm.tabs.hide('terminal')

// Show a tab
dwm.tabs.show('terminal')

// Toggle a tab
dwm.tabs.toggle('firmware')

// Get current status
dwm.tabs.status()
```

### Bulk Operations
```javascript
// Show all tabs
dwm.tabs.showAll()

// Hide all tabs (keeps first one enabled)
dwm.tabs.hideAll()

// List available tabs
dwm.tabs.list()
```

### Advanced Usage
```javascript
// Get full configuration
dwm.tabs.config

// Update tab configuration
dwm.updateTabConfig('terminal', {
    enabled: true,
    label: 'New Terminal Name',
    icon: '🖥️'
})
```

## Configuration Persistence

Tab settings are automatically saved to localStorage and restored when the app starts. This means:

- User preferences are remembered between sessions
- Developer configurations persist during development
- Each user can have their own tab visibility preferences

## Common Use Cases

### 1. Feature Development
Hide incomplete tabs during development:
```javascript
// Hide work-in-progress features
dwm.tabs.hide('terminal')  // Hide while implementing serial features
```

### 2. User Customization
Let power users customize their interface:
```javascript
// Users can hide features they don't need
dwm.tabs.hide('control')   // Hide advanced controls for basic users
```

### 3. Progressive Disclosure
Show features as they become available:
```javascript
// Enable features after device connection
if (deviceConnected) {
    dwm.tabs.show('terminal')
}
```

### 4. Role-Based Access
Show different tabs for different user roles:
```javascript
// Simple configuration for basic users
if (userRole === 'basic') {
    dwm.tabs.hide('control')
    dwm.tabs.hide('terminal')
}
```

## Tab Structure

Each tab configuration includes:

- `enabled` - Whether the tab is visible
- `label` - Display name in the tab
- `icon` - Emoji or icon for the tab
- `description` - Tooltip/description text

## Best Practices

1. **Default to Enabled** - Only disable tabs that are genuinely not ready
2. **Clear Labels** - Use descriptive labels and icons
3. **User Feedback** - The system provides console output when tabs change
4. **Graceful Degradation** - Always keep at least one tab enabled
5. **Save State** - Configuration changes are automatically persisted

## Testing

To test the tab management system:

1. Open the app and go to the **Control** tab
2. Scroll down to the **Tab Management** section
3. Use the toggle switches to hide/show tabs
4. Try the bulk action buttons
5. Refresh the app to verify settings persist

You can also test via the console:
```javascript
// Quick test sequence
dwm.tabs.hide('terminal')
dwm.tabs.status()
dwm.tabs.show('terminal')
```

## Troubleshooting

If tabs aren't responding:

1. Check the browser console for errors
2. Verify the tab key names match the configuration
3. Ensure at least one tab remains enabled
4. Try resetting the configuration: `dwm.tabs.showAll()`

The system includes error handling and will fall back to showing all tabs if there are configuration issues.
