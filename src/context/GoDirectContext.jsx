import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

// Create the context
const GoDirectContext = createContext(null);

// Configuration constants
const DEFAULT_SAMPLE_RATE_MS = 100; // 100ms = 10Hz
const DEFAULT_SENSOR_CHANNEL = 1;   // Force sensor channel
const MAX_CONNECTION_RETRIES = 3;   // Number of retry attempts
const RETRY_DELAY_MS = 2000;        // Delay between retries

/**
 * GoDirectProvider - Manages Bluetooth connection to Vernier GoDirect Respiration Belt
 * 
 * This provider maintains a persistent connection across all pages in the app.
 * The connection will remain active until explicitly disconnected or the browser tab is closed.
 */
export function GoDirectProvider({ children, sampleRateMs = DEFAULT_SAMPLE_RATE_MS, sensorChannel = DEFAULT_SENSOR_CHANNEL }) {
  // Connection state
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  
  // Sensor data
  const [latest, setLatest] = useState(null);
  
  // Refs for device and sensor (persist across renders)
  const deviceRef = useRef(null);
  const sensorRef = useRef(null);
  const wakeLockRef = useRef(null);
  const selectedDeviceRef = useRef(null); // Store selected device for retries

  /**
   * Helper function to attempt device setup after selection
   */
  const setupDevice = useCallback(async (gdxDevice, attempt = 0) => {
    // Wait for device to be ready after selection
    await new Promise(resolve => setTimeout(resolve, 500 + (attempt * 300)));
    
    // Try to open device (may already be open from selectDevice)
    if (typeof gdxDevice.open === 'function') {
      try {
        await gdxDevice.open();
      } catch (openErr) {
        const errMsg = openErr?.message ?? String(openErr);
        // If already open, that's fine - continue
        if (!errMsg.includes('already open')) {
          throw openErr;
        }
        console.log('Device already open, continuing...');
      }
      
      // Wait longer after opening for BLE characteristics to be fully discovered
      await new Promise(resolve => setTimeout(resolve, 1000 + (attempt * 500)));
    }
    
    // Verify device is actually open by checking if we can access sensors
    if (!gdxDevice.sensors || gdxDevice.sensors.length === 0) {
      // Device opened but sensors not ready, wait more
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!gdxDevice.sensors || gdxDevice.sensors.length === 0) {
        throw new Error('센서를 찾을 수 없습니다');
      }
    }
    
    return true;
  }, []);

  /**
   * Connect to the GoDirect Respiration Belt via Bluetooth
   */
  const connect = useCallback(async (isRetry = false) => {
    // Clear any previous errors
    setError(null);
    
    // Check if already connected
    if (deviceRef.current) {
      setError('Device is already connected. Please disconnect first.');
      return false;
    }
    
    // Check if the library is loaded
    if (!window.godirect) {
      setError('Go Direct library not loaded. Please refresh the page.');
      return false;
    }

    try {
      setConnecting(true);
      
      let gdxDevice = null;
      
      // If retrying with existing selection, use the stored device reference
      if (isRetry && selectedDeviceRef.current) {
        // For retry, we need to create a new device since the old one failed
        // We'll use the same selection dialog
        gdxDevice = await window.godirect.selectDevice(true);
      } else {
        // Use the Vernier godirect library to select device via Bluetooth
        gdxDevice = await window.godirect.selectDevice(true); // true = Bluetooth
      }
      
      if (!gdxDevice) {
        // User cancelled device selection
        setConnecting(false);
        setConnectionAttempt(0);
        selectedDeviceRef.current = null;
        return false;
      }
      
      // Store the selected device for potential retries
      selectedDeviceRef.current = gdxDevice;
      
      // Try to setup device with retry logic
      let setupSuccess = false;
      let lastError = null;
      const currentAttempt = isRetry ? connectionAttempt : 0;
      
      for (let attempt = currentAttempt; attempt < MAX_CONNECTION_RETRIES; attempt++) {
        setConnectionAttempt(attempt + 1);
        
        try {
          console.log(`Connection attempt ${attempt + 1}/${MAX_CONNECTION_RETRIES}...`);
          
          await setupDevice(gdxDevice, attempt);
          setupSuccess = true;
          break;
          
        } catch (setupError) {
          lastError = setupError;
          const errorMsg = setupError?.message ?? String(setupError);
          console.warn(`Attempt ${attempt + 1} failed:`, errorMsg);
          
          // If already open, that's okay - continue
          if (errorMsg.includes('already open')) {
            setupSuccess = true;
            break;
          }
          
          // Check if it's a retryable error
          const isRetryableError = 
            errorMsg.includes('timed out') ||
            errorMsg.includes('timeout') ||
            errorMsg.includes('characteristics not found') ||
            errorMsg.includes('Expected command') ||
            errorMsg.includes('command and response') ||
            errorMsg.includes('센서를 찾을 수 없습니다');
          
          if (isRetryableError && attempt < MAX_CONNECTION_RETRIES - 1) {
            // Wait before retry
            console.log(`Retrying in ${RETRY_DELAY_MS}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            
            // Try to close and reopen
            try {
              if (typeof gdxDevice.close === 'function') {
                await gdxDevice.close();
              }
            } catch (closeErr) {
              // Ignore close errors
            }
            
            // Wait a bit more before next attempt
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          } else {
            // Non-retryable error or max retries reached
            throw setupError;
          }
        }
      }
      
      if (!setupSuccess) {
        throw lastError || new Error('연결에 실패했습니다');
      }
      
      // Listen for device-closed event
      gdxDevice.on('device-closed', () => {
        setConnected(false);
        setReading(false);
        setLatest(null);
        deviceRef.current = null;
        sensorRef.current = null;
        selectedDeviceRef.current = null;
      });

      // Wait a bit more to ensure device is fully ready
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Get the sensor - verify device has sensors available
      if (!gdxDevice.sensors || gdxDevice.sensors.length === 0) {
        throw new Error('디바이스에서 센서를 찾을 수 없습니다. 디바이스를 재시작하고 다시 시도해주세요.');
      }
      
      const sensor = gdxDevice.getSensor(sensorChannel);
      if (!sensor) {
        throw new Error(`센서 채널 ${sensorChannel}을 찾을 수 없습니다.`);
      }
      
      sensorRef.current = sensor;
      
      // Enable the sensor
      sensor.setEnabled(true);

      // Set up value change listener
      sensor.on('value-changed', (sensorData) => {
        const v = sensorData.value;
        if (typeof v === 'number') {
          setLatest(v);
        }
      });

      // Request wake lock to keep screen on during training
      if ('wakeLock' in navigator) {
        try {
          const wl = await navigator.wakeLock.request('screen');
          wakeLockRef.current = wl;
        } catch (wlError) {
          // Wake lock failed, but continue anyway
          console.warn('Wake lock not available:', wlError);
        }
      }

      deviceRef.current = gdxDevice;
      setConnected(true);
      setConnectionAttempt(0);
      
      // Start reading automatically when connected
      try {
        if (typeof gdxDevice.start === 'function') {
          gdxDevice.start(sampleRateMs);
          setReading(true);
        }
      } catch (startError) {
        console.warn('Auto-start reading failed:', startError);
        setReading(false);
      }
      
      // Save device info for potential reconnection
      localStorage.setItem('godirect_last_connected', Date.now().toString());
      
      setConnecting(false);
      return true;
    } catch (e) {
      const errorMessage = e?.message ?? String(e);
      console.error('Connection error:', e);
      
      // Don't show error if user cancelled - it's not really an error
      if (errorMessage.includes('cancelled') || errorMessage.includes('cancel')) {
        setConnecting(false);
        setConnectionAttempt(0);
        selectedDeviceRef.current = null;
        return false;
      }
      
      // Check if it's a timeout or connection error
      const isTimeoutError = 
        errorMessage.includes('timed out') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('Device Open Failed');
      
      // Create a helpful error message
      let userFriendlyError;
      if (isTimeoutError) {
        userFriendlyError = `연결 시간 초과 (${connectionAttempt}/${MAX_CONNECTION_RETRIES} 시도)\n\n다음을 확인해주세요:\n• 디바이스 전원이 켜져 있는지 확인\n• LED가 깜빡이는지 확인 (페어링 모드)\n• 디바이스가 다른 기기에 연결되어 있지 않은지 확인\n\n전원이 켜져 있는데 연결이 안 되면:\n→ 전원 버튼을 4초 이상 눌러 끄기\n→ 다시 한 번 눌러 켜기\n→ 연결 다시 시도`;
      } else {
        userFriendlyError = `연결 실패: ${errorMessage}\n\n전원 버튼을 4초 이상 눌러 끄고,\n다시 한 번 눌러 켠 후 연결해주세요.`;
      }
      
      setError(userFriendlyError);
      setConnecting(false);
      setConnectionAttempt(0);
      selectedDeviceRef.current = null;
      return false;
    }
  }, [sampleRateMs, sensorChannel, connectionAttempt, setupDevice]);

  /**
   * Start reading data from the sensor
   */
  const startReading = useCallback(async () => {
    if (!deviceRef.current) {
      setError('Device not connected');
      return false;
    }
    if (reading) {
      return true; // Already reading
    }
    try {
      // Re-enable sensor if it was disabled
      if (sensorRef.current) {
        sensorRef.current.setEnabled(true);
      }
      deviceRef.current.start(sampleRateMs);
      setReading(true);
      setError(null);
      return true;
    } catch (e) {
      setError(e?.message ?? String(e));
      console.error('Start reading error:', e);
      return false;
    }
  }, [reading, sampleRateMs]);

  /**
   * Stop reading data from the sensor (but keep connection)
   */
  const stopReading = useCallback(async () => {
    if (!deviceRef.current || !reading) {
      return true;
    }
    try {
      // Stop data collection
      if (typeof deviceRef.current.stop === 'function') {
        deviceRef.current.stop();
      } else if (sensorRef.current) {
        // Disable the sensor to stop data collection
        sensorRef.current.setEnabled(false);
      }
      setReading(false);
      setError(null);
      return true;
    } catch (e) {
      setError(e?.message ?? String(e));
      console.error('Stop reading error:', e);
      return false;
    }
  }, [reading]);

  /**
   * Disconnect from the device
   */
  const disconnect = useCallback(async () => {
    try {
      // Stop reading first
      if (reading) {
        await stopReading();
      }
      
      // Release wake lock
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      
      // Close the device
      if (deviceRef.current) {
        try {
          await deviceRef.current.close();
        } catch (closeError) {
          // Ignore errors if device is already closed
          if (!closeError.message?.includes('already closed') && !closeError.message?.includes('not open')) {
            console.error('Close error:', closeError);
          }
        }
        deviceRef.current = null;
        sensorRef.current = null;
      }
      
      localStorage.removeItem('godirect_last_connected');
    } catch (e) {
      console.error('Disconnect error:', e);
    } finally {
      setConnected(false);
      setReading(false);
      setLatest(null);
      setError(null);
    }
  }, [reading, stopReading]);

  /**
   * Clear any error message
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount (when app closes)
  useEffect(() => {
    return () => {
      if (deviceRef.current) {
        disconnect();
      }
    };
  }, []);

  // Context value
  const value = {
    // State
    connected,
    connecting,
    reading,
    latest,
    error,
    connectionAttempt,
    maxRetries: MAX_CONNECTION_RETRIES,
    
    // Actions
    connect,
    disconnect,
    startReading,
    stopReading,
    clearError,
    
    // Device info (for debugging)
    device: deviceRef.current,
  };

  return (
    <GoDirectContext.Provider value={value}>
      {children}
    </GoDirectContext.Provider>
  );
}

/**
 * Hook to access the GoDirect Bluetooth connection
 * 
 * @returns {Object} Connection state and methods
 * @property {boolean} connected - Whether device is connected
 * @property {boolean} connecting - Whether connection is in progress
 * @property {boolean} reading - Whether actively reading data
 * @property {number|null} latest - Latest sensor value (Force in Newtons)
 * @property {string|null} error - Current error message
 * @property {Function} connect - Start Bluetooth connection
 * @property {Function} disconnect - Disconnect from device
 * @property {Function} startReading - Start reading sensor data
 * @property {Function} stopReading - Stop reading (keep connection)
 * @property {Function} clearError - Clear error message
 */
export function useGoDirect() {
  const context = useContext(GoDirectContext);
  if (!context) {
    throw new Error('useGoDirect must be used within a GoDirectProvider');
  }
  return context;
}

export default GoDirectContext;
