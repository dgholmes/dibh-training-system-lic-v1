import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { getSqliteDatabase } from '@/db/sqliteDb'

getSqliteDatabase().catch((e) => console.error('SQLite init failed', e))

ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
) 