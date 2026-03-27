
import React, { useEffect, useRef, useState } from 'react'
import { Chart, LineController, LineElement, PointElement, LinearScale, Title, Tooltip, Legend, CategoryScale } from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, Tooltip, Legend, CategoryScale, zoomPlugin)

type Props = { data: Array<{ time: number, value: number }>, maxPoints?: number }

const formatTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(1)
  return `${mins}m ${secs}s`
}

export default function LineChart({ data, maxPoints = 600 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const chartRef = useRef<Chart<'line'> | null>(null)
  const userPannedRef = useRef(false)
  const [showResetButton, setShowResetButton] = useState(false)
  
  const resetToLatest = () => {
    userPannedRef.current = false
    setShowResetButton(false)
    const c = chartRef.current
    if (!c || data.length === 0) return
    
    const maxTime = Math.max(...data.map(d => d.time))
    const minTime = Math.min(...data.map(d => d.time))
    const minVisibleTime = Math.max(minTime, maxTime - 30)
    const maxVisibleTime = maxTime
    
    const xScale = c.scales.x
    if (xScale) {
      xScale.options.min = minVisibleTime
      xScale.options.max = maxVisibleTime
      c.update('none')
    }
  }

  useEffect(() => {
    if (!canvasRef.current) return
    
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: { 
        datasets: [{
          label: 'Force (N)',
          data: data.map(d => ({ x: d.time, y: d.value })),
          borderColor: '#0b5fff',
          backgroundColor: 'rgba(11, 95, 255, 0.1)',
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: { 
          legend: { 
            display: true,
            labels: { 
              color: '#e6edf3',
              font: { size: 12 }
            } 
          },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#e6edf3',
            bodyColor: '#e6edf3',
            borderColor: '#0b5fff',
            borderWidth: 1,
            callbacks: {
              title: (items) => {
                if (items.length === 0) return ''
                const xValue = items[0].parsed.x
                return `Time: ${formatTime(xValue)}`
              },
              label: (item) => {
                return `Force: ${item.parsed.y.toFixed(3)} N`
              }
            }
          },
          zoom: {
            zoom: {
              wheel: {
                enabled: true,
                speed: 0.1
              },
              pinch: {
                enabled: true
              },
              mode: 'x',
            },
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: null, // Allow panning without modifier key
              onPan: () => {
                // Mark that user has panned
                userPannedRef.current = true
                setShowResetButton(true)
              },
              onPanComplete: () => {
                // Keep the flag set so view stays where user scrolled
              }
            },
            limits: {
              x: {
                min: 0,
                max: 'original'
              }
            }
          }
        },
        scales: {
          x: { 
            type: 'linear',
            display: true,
            title: {
              display: true,
              text: 'Time (s)',
              color: '#e6edf3',
              font: { size: 12 }
            },
            ticks: { 
              color: '#e6edf3',
              font: { size: 10 },
              maxRotation: 45,
              minRotation: 0,
              callback: function(value) {
                return value.toFixed(1) + 's'
              }
            }, 
            grid: { 
              color: 'rgba(255,255,255,0.05)',
              drawBorder: false
            } 
          },
          y: { 
            beginAtZero: false,
            title: {
              display: true,
              text: 'Force (N)',
              color: '#e6edf3',
              font: { size: 12 }
            },
            ticks: { 
              color: '#e6edf3',
              font: { size: 11 }
            }, 
            grid: { 
              color: 'rgba(255,255,255,0.05)',
              drawBorder: false
            }
          }
        }
      }
    })
    
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const c = chartRef.current
    if (!c) return
    
    if (data.length === 0) {
      c.data.datasets[0].data = []
      c.update('none')
      return
    }
    
    // Always update data - this ensures real-time data continues even when scrolled
    // Update the dataset data - this always happens regardless of scroll position
    c.data.datasets[0].data = data.map(d => ({ x: d.time, y: d.value }))
    
    // Calculate the visible window (last 30 seconds)
    const maxTime = Math.max(...data.map(d => d.time))
    const minTime = Math.min(...data.map(d => d.time))
    const minVisibleTime = Math.max(minTime, maxTime - 30)
    const maxVisibleTime = maxTime
    
    // Update X-axis to show the 30 second window
    // Only auto-update if user hasn't panned/zoomed manually
    const xScale = c.scales.x
    if (xScale && data.length > 0) {
      if (userPannedRef.current) {
        // User has panned/zoomed - preserve their view
        // Don't change min/max, just keep current range
        // Data will still be updated and visible in their selected range
        // The chart will show the data in the user's selected range
      } else {
        // User hasn't panned - auto-update to show latest 30 seconds
        xScale.options.min = minVisibleTime
        xScale.options.max = maxVisibleTime
      }
    } else if (xScale && data.length === 0) {
      // Reset to default when no data
      xScale.options.min = undefined
      xScale.options.max = undefined
      userPannedRef.current = false
    }
    
    // Update Y-axis scale based on visible data (current view)
    const visibleData = data.filter(d => {
      if (!xScale) return true
      const min = xScale.min ?? minVisibleTime
      const max = xScale.max ?? maxVisibleTime
      return d.time >= min && d.time <= max
    })
    
    if (visibleData.length > 0) {
      const values = visibleData.map(d => d.value)
      const min = Math.min(...values)
      const max = Math.max(...values)
      const padding = (max - min) * 0.1 || 1
      c.options.scales!.y!.min = min - padding
      c.options.scales!.y!.max = max + padding
    }
    
    // Always update the chart - data continues to flow even when scrolled
    // Use 'none' mode for performance, but ensure update happens
    c.update('none')
  }, [data])

  return (
    <div style={{ position: 'relative' }}>
      {showResetButton && (
        <button
          onClick={resetToLatest}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 10,
            backgroundColor: '#0b5fff',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          최신으로 이동
        </button>
      )}
      <div style={{ height: '300px', width: '100%', position: 'relative' }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
