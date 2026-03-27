import React, { useState } from 'react';
import { User, Lock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import logoSrc from '@/assets/logo.png';

export default function Login() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      navigate(createPageUrl('Home'));
    }, 1000);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D1117] p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-[#3B82F6]/10 via-transparent to-[#8B5CF6]/10" />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-8">
        <img
          src={logoSrc}
          alt=""
          className="block h-auto w-[78.7%] max-w-[400px] object-contain object-center"
          width={400}
          height={400}
          decoding="async"
        />

        <div className="inline-block rounded-full border border-[#30363D] bg-[#1C2128] px-5 py-2 text-sm text-[#8B949E]">
          원주세브란스기독병원
        </div>

        <form
          onSubmit={handleLogin}
          className="flex w-full flex-col gap-6 text-left"
        >
          <div className="w-full space-y-4 rounded-xl border border-[#30363D] bg-[#1C2128] p-6">
            <div className="relative">
              <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B949E]" />
              <Input
                type="text"
                placeholder="아이디를 입력하세요"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="h-14 rounded-xl border-[#30363D] bg-[#0D1117] pl-12 text-white placeholder:text-[#8B949E] focus:border-[#3B82F6] focus:ring-[#3B82F6]/20"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B949E]" />
              <Input
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-14 rounded-xl border-[#30363D] bg-[#0D1117] pl-12 text-white placeholder:text-[#8B949E] focus:border-[#3B82F6] focus:ring-[#3B82F6]/20"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="h-14 w-full rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-lg font-semibold text-white shadow-lg shadow-[#3B82F6]/25 transition-all hover:from-[#2563EB] hover:to-[#7C3AED]"
          >
            {isLoading ? (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <>
                시작하기
                <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-[#8B949E]">© 2026 THEPICT Inc.</p>
      </div>
    </div>
  );
}
