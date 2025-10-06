# macOS IBM MQ Connection Fix - "MQCNO is not a constructor" Error

## Issue Description

When attempting to connect to an IBM MQ Queue Manager from macOS using the MQ Explorer VS Code extension, users encountered the following error:

```
Connection test failed: t.MQCNO is not a constructor
```

This error occurred regardless of TLS configuration and prevented any IBM MQ connections from being established.

## Error Analysis

### What the Error Means

The error `t.MQCNO is not a constructor` indicates that:
- `t` is a reference to the IBM MQ library object
- `MQCNO` should be a constructor function for creating connection options
- The code is trying to use `new t.MQCNO()` but `MQCNO` is not a proper constructor

### Why It Happened

The root cause was in the optional dependency implementation:

1. **Mock Object Used Instead of Real Library**: The code was using a mock object (created for TypeScript compilation) instead of the real IBM MQ library at runtime.

2. **Faulty Loading Logic**: The library loading check was incorrect:
   ```typescript
   // WRONG - This check never triggered because mq was already set to mock
   if (mq === null) {
       mq = require('ibmmq');
   }
   ```

3. **Mock Constructor Behavior**: The mock `MQCNO` was defined as:
   ```typescript
   MQCNO: class { constructor() { Object.assign(this, {}); } }
   ```
   This created an empty object instead of a proper IBM MQ connection options object.

## The Fix

### Implementation Details

#### 1. Separated Mock from Runtime Loading

**Before:**
```typescript
let mq: any = null;
try {
    mq = require('ibmmq');
} catch (error) {
    mq = mockMQ; // Problem: mq is never null after this
}
```

**After:**
```typescript
let mq: any = null;
let mqLoadAttempted: boolean = false;
let mqIsRealLibrary: boolean = false;

const mockMQ = { /* mock definition */ };
mq = mockMQ; // For compilation only
```

#### 2. Fixed Library Loading Logic

**Before:**
```typescript
private async loadIBMMQLibrary(): Promise<any> {
    if (mq === null) {  // Never true!
        mq = require('ibmmq');
    }
    return mq;
}
```

**After:**
```typescript
private async loadIBMMQLibrary(): Promise<any> {
    if (!mqLoadAttempted) {
        mqLoadAttempted = true;
        try {
            const realMQ = require('ibmmq');
            // Verify it's real by checking constructor
            if (realMQ && typeof realMQ.MQCNO === 'function') {
                mq = realMQ;  // Replace mock with real library
                mqIsRealLibrary = true;
                this.log('✅ IBM MQ library loaded successfully');
            }
        } catch (error) {
            mqIsRealLibrary = false;
            throw new Error('IBM MQ library not available...');
        }
    }
    
    if (mqIsRealLibrary) {
        return mq;
    }
    
    throw new Error('IBM MQ library not available.');
}
```

#### 3. Added Library Verification

The fix includes verification that the loaded library is genuine:
```typescript
if (realMQ && typeof realMQ.MQCNO === 'function') {
    // It's the real library
}
```

This ensures we're using actual IBM MQ constructors, not mocks.

## Testing on macOS

### Prerequisites

1. **IBM MQ Client Libraries**: Install IBM MQ client on macOS
   ```bash
   # Download from IBM website or use Homebrew if available
   # Set environment variables
   export MQ_INSTALLATION_PATH=/opt/mqm
   export DYLD_LIBRARY_PATH=$MQ_INSTALLATION_PATH/lib64
   ```

2. **VS Code**: Latest version installed

3. **Extension**: Install MQExplorer v0.3.0 or later

### Test Steps

1. **Launch VS Code**
   ```bash
   code .
   ```

2. **Open MQExplorer View**
   - Click on the MQExplorer icon in the Activity Bar
   - Or use Command Palette: `MQExplorer: Show Explorer`

3. **Add IBM MQ Connection Profile**
   - Click "+" to add new connection
   - Select "IBM MQ" as provider type
   - Fill in connection details:
     - Queue Manager: `QM1` (or your QM name)
     - Host: `localhost` (or your host)
     - Port: `1414` (or your port)
     - Channel: `DEV.APP.SVRCONN` (or your channel)
     - Username: (if required)
     - Password: (if required)

4. **Test Connection**
   - Click "Test Connection" button
   - Expected result: ✅ "Connection successful"
   - Previous error: ❌ "t.MQCNO is not a constructor"

5. **Verify Operations**
   - Connect to Queue Manager
   - List queues
   - Browse messages
   - Put messages

### Expected Results

✅ **Connection Test**: Should succeed without "MQCNO is not a constructor" error
✅ **Queue Listing**: Should display available queues
✅ **Message Operations**: Browse and put operations should work
✅ **Error Messages**: If IBM MQ libraries are missing, should show helpful guidance

## Platform-Specific Notes

### macOS

- **Library Path**: Ensure `DYLD_LIBRARY_PATH` includes IBM MQ libraries
- **Permissions**: May need to grant VS Code permissions to access network
- **Security**: macOS may require allowing the IBM MQ libraries in Security & Privacy settings

### Windows

- **Library Path**: IBM MQ libraries should be in system PATH
- **Installation**: Use IBM MQ Windows installer
- **No special configuration** typically needed

### Linux

- **Library Path**: Set `LD_LIBRARY_PATH` to include IBM MQ libraries
- **Installation**: Use IBM MQ Linux installer or package manager
- **Permissions**: Ensure user has access to IBM MQ installation directory

## Troubleshooting

### Issue: "IBM MQ library not available"

**Solution:**
1. Verify IBM MQ client is installed
2. Check environment variables (DYLD_LIBRARY_PATH on macOS, LD_LIBRARY_PATH on Linux)
3. Restart VS Code after installing IBM MQ
4. Check Output panel "MQExplorer: IBM MQ" for detailed logs

### Issue: Connection timeout

**Solution:**
1. Verify Queue Manager is running
2. Check firewall settings
3. Verify host and port are correct
4. Ensure channel is configured for client connections

### Issue: Authentication failed

**Solution:**
1. Verify username and password are correct
2. Check Queue Manager security settings
3. Ensure channel has appropriate authentication configuration

## Verification

### Check Extension Version

```bash
# In VS Code, open Extensions view
# Search for "MQExplorer"
# Verify version is 0.3.0 or later
```

### Check Output Logs

1. Open Output panel (View → Output)
2. Select "MQExplorer: IBM MQ" from dropdown
3. Look for:
   ```
   ✅ IBM MQ library loaded successfully
   ✅ Connected to queue manager QM1
   ```

### Verify Fix Applied

The fix is applied if:
- ✅ Extension loads without errors
- ✅ Connection test succeeds
- ✅ No "MQCNO is not a constructor" errors
- ✅ Output logs show "IBM MQ library loaded successfully"

## Related Documentation

- [IBM MQ Optional Dependency Fix](./IBM_MQ_OPTIONAL_DEPENDENCY_FIX.md) - Detailed technical documentation
- [CHANGELOG.md](../CHANGELOG.md) - Version 0.3.0 release notes
- [README.md](../README.md) - General extension documentation

## Support

If you continue to experience issues:

1. **Check Logs**: Review Output panel "MQExplorer: IBM MQ"
2. **Verify Installation**: Ensure IBM MQ client libraries are properly installed
3. **Environment Variables**: Verify library paths are set correctly
4. **Restart**: Restart VS Code after any configuration changes
5. **Report Issue**: If problem persists, report with:
   - macOS version
   - VS Code version
   - Extension version
   - IBM MQ client version
   - Complete error message from Output panel

## Version Information

- **Fixed in**: v0.3.0
- **Date**: 2025-01-XX
- **Platforms**: macOS, Windows, Linux
- **Status**: ✅ Resolved and tested

