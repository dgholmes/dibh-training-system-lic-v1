import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoDirectProvider } from '@/context/GoDirectContext'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GoDirectProvider sampleRateMs={100} sensorChannel={1}>
        <Pages />
        <Toaster />
      </GoDirectProvider>
    </QueryClientProvider>
  )
}

export default App 