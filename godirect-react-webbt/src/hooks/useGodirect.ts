
import { useEffect, useRef, useState } from 'react'

type Device = any;

export function useGodirect(sampleRateMs = 1000, sensorChannel = 1, useBluetooth = true) {
  const [connected, setConnected] = useState(false)
  const [reading, setReading] = useState(false)
  const [latest, setLatest] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const deviceRef = useRef<Device | null>(null)
  const sensorRef = useRef<any>(null)
  const wakeLockRelease = useRef<(() => void) | null>(null)

  const connect = async () => {
    // Clear any previous errors
    setError(null)
    
    // Check if already connected
    if (deviceRef.current) {
      setError('Device is already connected. Please disconnect first.')
      return
    }
    
    // Check if the library is loaded
    if (!(window as any).godirect) {
      setError('Go Direct library not loaded. Please refresh the page.')
      return
    }

    try {
      setConnecting(true)
      
      // Use the example's pattern: selectDevice(bluetooth)
      const gdxDevice = await (window as any).godirect.selectDevice(useBluetooth)
      
      if (!gdxDevice) {
        // User cancelled device selection
        setConnecting(false)
        return
      }
      
      // Wait for device to be ready after selection
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Try to open device with retry logic
      let openSuccess = false
      let lastError: any = null
      
      for (let attempt = 0; attempt < 3; attempt++) {
        if (openSuccess) break
        
        try {
          if (typeof gdxDevice.open === 'function') {
            await gdxDevice.open()
            
            // Wait longer after opening for BLE characteristics to be fully discovered
            // This is critical for the "Expected command and response characteristics not found" error
            await new Promise(resolve => setTimeout(resolve, 800 + (attempt * 200)))
            
            // Verify device is actually open by checking if we can access sensors
            if (gdxDevice.sensors && gdxDevice.sensors.length > 0) {
              openSuccess = true
              break
            } else {
              // Device opened but sensors not ready, wait more
              await new Promise(resolve => setTimeout(resolve, 500))
              if (gdxDevice.sensors && gdxDevice.sensors.length > 0) {
                openSuccess = true
                break
              }
            }
          } else {
            // No open method, assume already open
            openSuccess = true
            break
          }
        } catch (openError: any) {
          lastError = openError
          const errorMsg = openError?.message ?? String(openError)
          
          // If already open, that's okay - continue
          if (errorMsg.includes('already open')) {
            openSuccess = true
            break
          } else if (errorMsg.includes('characteristics not found') || 
                     errorMsg.includes('Expected command') ||
                     errorMsg.includes('command and response')) {
            // Wait before retry
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 1000))
              continue
            } else {
              // Last attempt failed
              throw new Error('디바이스 연결 실패. 다음을 확인해주세요:\n1. 다른 앱에서 디바이스 연결 해제\n2. 디바이스 전원을 껐다 켜기\n3. 브라우저 새로고침 후 다시 시도')
            }
          } else {
            throw openError
          }
        }
      }
      
      if (!openSuccess && lastError) {
        throw lastError
      }
      
      // Listen for device-closed event
      gdxDevice.on('device-closed', () => {
        setConnected(false)
        setReading(false)
        deviceRef.current = null
        sensorRef.current = null
      })

      // Wait a bit more to ensure device is fully ready
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Get the sensor - verify device has sensors available
      if (!gdxDevice.sensors || gdxDevice.sensors.length === 0) {
        throw new Error('디바이스에서 센서를 찾을 수 없습니다. 디바이스를 재시작하고 다시 시도해주세요.')
      }
      
      const sensor = gdxDevice.getSensor(sensorChannel)
      if (!sensor) {
        throw new Error(`센서 채널 ${sensorChannel}을 찾을 수 없습니다.`)
      }
      
      sensorRef.current = sensor
      
      // Enable the sensor
      sensor.setEnabled(true)

      // Set up value change listener
      sensor.on('value-changed', (sensor: any) => {
          const v = sensor.value
        if (typeof v === 'number') {
          setLatest(v)
        }
      })

      // Request wake lock to keep screen on
      if ('wakeLock' in navigator) {
        try {
        const wl = await (navigator as any).wakeLock.request('screen')
        wakeLockRelease.current = () => wl.release()
        } catch (wlError) {
          // Wake lock failed, but continue anyway
          console.warn('Wake lock not available:', wlError)
        }
      }

      deviceRef.current = gdxDevice
      setConnected(true)
      
      // Start reading automatically when connected
      try {
        if (typeof gdxDevice.start === 'function') {
          gdxDevice.start(sampleRateMs)
          setReading(true)
        }
      } catch (startError) {
        console.warn('Auto-start reading failed:', startError)
        setReading(false)
      }
      
      setConnecting(false)
    } catch (e: any) {
      const errorMessage = e?.message ?? String(e)
      // Don't show error if user cancelled - it's not really an error
      if (errorMessage.includes('cancelled') || errorMessage.includes('cancel')) {
        // User cancelled, just don't connect - no error needed
        setConnecting(false)
        return
      }
      setError(errorMessage)
      console.error('Connection error:', e)
      setConnecting(false)
    }
  }

  const startReading = async () => {
    if (!deviceRef.current) {
      setError('Device not connected')
      return
    }
    if (reading) {
      return // Already reading
    }
    try {
      // Re-enable sensor if it was disabled
      if (sensorRef.current) {
        sensorRef.current.setEnabled(true)
      }
      deviceRef.current.start(sampleRateMs)
      setReading(true)
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? String(e))
      console.error('Start reading error:', e)
    }
  }

  const stopReading = async () => {
    if (!deviceRef.current || !reading) {
      return
    }
    try {
      // Stop data collection - try stop method first, otherwise disable sensor
      if (typeof deviceRef.current.stop === 'function') {
        deviceRef.current.stop()
      } else if (sensorRef.current) {
        // Disable the sensor to stop data collection
        sensorRef.current.setEnabled(false)
      }
      setReading(false)
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? String(e))
      console.error('Stop reading error:', e)
    }
  }

  const disconnect = async () => {
    try {
      // Stop reading first
      if (reading) {
        await stopReading()
      }
      
      // Release wake lock
      if (wakeLockRelease.current) {
        wakeLockRelease.current()
        wakeLockRelease.current = null
      }
      
      // Close the device
      if (deviceRef.current) {
        try {
          await deviceRef.current.close()
        } catch (closeError: any) {
          // Ignore errors if device is already closed
          if (!closeError.message?.includes('already closed') && !closeError.message?.includes('not open')) {
            console.error('Close error:', closeError)
          }
        }
        deviceRef.current = null
        sensorRef.current = null
      }
    } catch (e) {
      console.error('Disconnect error:', e)
    } finally {
      setConnected(false)
      setReading(false)
      setLatest(null)
    }
  }

  useEffect(() => {
    return () => { 
      disconnect() 
    }
  }, [])

  return { connected, reading, latest, connect, disconnect, startReading, stopReading, error, connecting }
}
