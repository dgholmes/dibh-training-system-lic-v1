
import React, { useMemo, useRef, useState, useEffect } from 'react'
import LineChart from './components/LineChart'
import { useGodirect } from './hooks/useGodirect'

export default function App() {
  // sampleRateMs=100, sensorChannel=1 (Force sensor), useBluetooth=true
  const { connected, latest, connect, disconnect, error, connecting, startReading, stopReading, reading } = useGodirect(100, 1, true)
  const [isRecording, setIsRecording] = useState(false)
  const [recordedDataCount, setRecordedDataCount] = useState(0)
  const [graphData, setGraphData] = useState<Array<{ time: number, value: number }>>([])
  const startTimeRef = useRef<number | null>(null)
  const recordedDataRef = useRef<Array<{ timestamp: number, value: number }>>([])

  // Always update graph with real-time data when connected
  useEffect(() => {
    if (connected && typeof latest === 'number') {
      const now = Date.now()
      if (startTimeRef.current === null) {
        startTimeRef.current = now
      }
      
      // Always add to graph buffer for real-time display
      // Store more data for scrolling (keep last 5 minutes = 300 seconds worth of data)
      setGraphData(prev => {
        const timeFromStart = (now - startTimeRef.current!) / 1000 // seconds from start
        const newData = [...prev, { time: timeFromStart, value: latest }]
        
        // Keep last 5 minutes of data (for scrolling through history)
        // At 100ms sample rate, that's about 3000 points
        const fiveMinutesAgo = Math.max(0, timeFromStart - 300)
        return newData.filter(d => d.time >= fiveMinutesAgo)
      })
    }

    // Only save to recorded data when recording (for CSV export)
    if (connected && typeof latest === 'number' && isRecording) {
      const timestamp = Date.now()
      recordedDataRef.current.push({ timestamp, value: latest })
      setRecordedDataCount(recordedDataRef.current.length)
    }
  }, [latest, connected, isRecording])

  const handleStartRecording = () => {
    if (!connected) {
      alert('먼저 디바이스를 연결해주세요.')
      return
    }
    // Clear only recorded data for CSV export, keep graph for real-time display
    recordedDataRef.current = []
    setRecordedDataCount(0)
    setIsRecording(true)
  }

  const handleStopRecording = () => {
    setIsRecording(false)
  }

  const handleResetChart = () => {
    setGraphData([])
    startTimeRef.current = null
  }

  const handleDownloadCSV = () => {
    if (recordedDataRef.current.length === 0) {
      alert('다운로드할 데이터가 없습니다.')
      return
    }

    // Create CSV content
    const headers = ['Timestamp (ms)', 'Time (s)', 'Force (N)']
    const startTime = recordedDataRef.current[0]?.timestamp || 0
    const rows = recordedDataRef.current.map(({ timestamp, value }) => {
      const timeFromStart = ((timestamp - startTime) / 1000).toFixed(3)
      return [timestamp.toString(), timeFromStart, value.toFixed(3)]
    })

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `respiration_data_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const avg = useMemo(() => {
    return graphData.length ? graphData.reduce((a, v) => a + v.value, 0) / graphData.length : null
  }, [graphData])

  return (
    <div className="container">
      <div className="card">
        <h1>Go Direct Respiration Monitor</h1>
        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          {!connected ? (
            <button onClick={connect} disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect Respiration Belt'}
            </button>
          ) : (
            <button className="secondary" onClick={disconnect}>Disconnect</button>
          )}
          <span className="label">Status:</span>
          <span className="value">{connected ? 'Connected' : connecting ? 'Connecting...' : 'Disconnected'}</span>
        </div>

        {error && <div style={{ color: '#ff8080', marginBottom: 8 }}>Error: {error}</div>}

        {connected && (
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            {!isRecording ? (
              <button onClick={handleStartRecording} style={{ backgroundColor: '#28a745' }}>
                기록 시작
              </button>
            ) : (
              <button onClick={handleStopRecording} style={{ backgroundColor: '#dc3545' }}>
                기록 중지
              </button>
            )}
            {recordedDataCount > 0 && (
              <button onClick={handleDownloadCSV} style={{ backgroundColor: '#007bff' }}>
                CSV 다운로드 ({recordedDataCount}개 데이터)
              </button>
            )}
            <button 
              onClick={handleResetChart} 
              style={{ backgroundColor: '#ffc107', color: '#000' }}
            >
              차트 리셋
            </button>
          </div>
        )}

        {isRecording && (
          <div style={{ color: '#ff8080', marginBottom: 8, fontWeight: 'bold' }}>
            ● 기록 중... ({recordedDataCount}개 데이터 수집됨)
          </div>
        )}

        <div className="row" style={{ gap: 24, marginBottom: 12 }}>
          <div>
            <div className="label">Latest Force (N)</div>
            <div className="value" style={{ fontSize: 28 }}>{typeof latest === 'number' ? latest.toFixed(3) : '-'}</div>
          </div>
          <div>
            <div className="label">Avg (≈1 min) (N)</div>
            <div className="value" style={{ fontSize: 28 }}>{avg !== null ? avg.toFixed(3) : '-'}</div>
          </div>
        </div>

        <LineChart data={graphData} />

        <div className="footer">
          Tip: Web Bluetooth requires HTTPS (or localhost). Use Chrome on Android. Tap the button to connect.
        </div>
      </div>
    </div>
  )
}
