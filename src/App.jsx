import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { TimeoutWarningBanner } from '@/pages/Login'

const queryClient = new QueryClient()

function AppInner() {
  const { timeoutWarning, dismissTimeoutWarning } = useAuth();
  return (
    <>
      <Pages />
      <Toaster />
      {timeoutWarning && <TimeoutWarningBanner onStayLoggedIn={dismissTimeoutWarning} />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
