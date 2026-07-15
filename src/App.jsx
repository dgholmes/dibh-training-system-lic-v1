import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { TimeoutWarningBanner } from '@/pages/Login'
import { SECURITY_DEBUG } from '@/lib/securityDebug'

const queryClient = new QueryClient()

function AppInner() {
  const { timeoutWarning, dismissTimeoutWarning } = useAuth();
  return (
    <>
      {SECURITY_DEBUG && (
        <div className="fixed left-0 top-0 z-[9999] w-full bg-[#EF4444] py-1 text-center text-xs font-bold text-white">
          DEBUG BUILD — 프로덕션/제출 빌드에 포함되어서는 안 됨
        </div>
      )}
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
