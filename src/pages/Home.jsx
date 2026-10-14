import { useState } from 'react';
import { Search, Plus, ChevronLeft, ChevronRight, LogOut, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Patient } from '@/api/entities';
import { useQuery } from '@tanstack/react-query';
import PatientCard from '@/components/common/PatientCard';
import { useAuth } from '@/context/AuthContext';
import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRODUCT_CODE, PRODUCT_CODE_LABEL } from '@/config/product';

export default function Home() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();
  const { logout, session } = useAuth();
  const patientsPerPage = 5;

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients'],
    queryFn: () => Patient.list('-last_training_date'),
  });

  const isSearching = searchTerm.trim().length > 0;

  const filteredPatients = patients.filter(patient =>
    patient.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.patient_code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredPatients.length / patientsPerPage);
  const paginatedPatients = filteredPatients.slice(
    (currentPage - 1) * patientsPerPage,
    currentPage * patientsPerPage
  );

  const handlePatientSelect = (patient) => {
    navigate(createPageUrl('PatientDashboard') + `?patientId=${patient.id}`);
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-24">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-20 mb-6 flex items-center justify-between bg-[#0D1117] py-1">
          <h1 className="text-2xl font-bold text-white">환자 정보 선택</h1>
          <div className="flex items-center gap-2">
            {/* Admin panel — visible to admin role only (UC-01) */}
            {session?.role === 'admin' && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin/accounts')}
                className="gap-1.5 text-[#A78BFA] hover:bg-[#8B5CF6]/10 hover:text-[#C4B5FD]">
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">관리자</span>
              </Button>
            )}
            <Button onClick={handleLogout} variant="ghost" size="sm"
              className="text-[#8B949E] hover:text-white hover:bg-[#1C2128]">
              <LogOut className="w-4 h-4 mr-1.5" />
              로그아웃
            </Button>
          </div>
        </div>

        {/* Search Bar and New Patient Button */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8B949E]" />
          <Input
            id="patient-search"
            name="patient-search"
            placeholder="환자명 또는 코드로 검색"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-14 h-14 bg-[#1C2128] border-[#30363D] text-white placeholder:text-[#8B949E] focus:border-[#3B82F6] rounded-xl text-base"
          />
        </div>
        <Link to={createPageUrl('NewPatient')}>
            <Button className="bg-transparent hover:bg-[#1C2128] text-white h-14 px-4 rounded-xl border-2 border-dashed border-[#30363D] whitespace-nowrap">
              <Plus className="w-5 h-5 mr-2" />
              신규 환자 등록
            </Button>
          </Link>
          </div>

        {/* Patient List */}
        <div className="space-y-3">
          {isLoading ? (
            <>
              <h2 className="text-[#8B949E] text-sm font-bold mb-3 uppercase tracking-wide">
                {isSearching ? '검색 결과' : '최근 치료 환자'}
              </h2>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-[#1C2128] rounded-xl p-5 border border-[#30363D] animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-[#30363D]" />
                    <div className="flex-1">
                      <div className="h-5 bg-[#30363D] rounded w-32 mb-2" />
                      <div className="h-4 bg-[#30363D] rounded w-40" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </>
          ) : paginatedPatients.length > 0 ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[#8B949E] text-sm font-bold uppercase tracking-wide">
                  {isSearching ? `검색 결과 (${filteredPatients.length}건)` : '최근 치료 환자'}
                </h2>
                {isSearching && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchTerm('');
                      setCurrentPage(1);
                    }}
                    className="h-8 gap-1.5 text-[#8B949E] hover:bg-[#1C2128] hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                    검색 해제
                  </Button>
                )}
              </div>
            <div className={cn('space-y-3', isSearching && 'border-l-2 border-[#3B82F6]/60 pl-3')}>
              {paginatedPatients.map((patient) => (
                <PatientCard
                  key={patient.id}
                  patient={patient}
                  onClick={() => handlePatientSelect(patient)}
                />
              ))}
            </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-[#30363D] py-10 text-center">
              <p className="text-sm text-[#8B949E]">
                {isSearching ? '검색 결과가 없습니다' : '등록된 환자가 없습니다'}
              </p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="text-[#8B949E] hover:text-white hover:bg-[#1C2128] disabled:opacity-50"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-[#8B949E] font-medium">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="text-[#8B949E] hover:text-white hover:bg-[#1C2128] disabled:opacity-50"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        )}

        {/* Version was only visible on login and the admin screens (#6) */}
        <p className="mt-10 text-center text-xs text-[#6E7681]">
          DIBH - Flow v{__APP_VERSION__} &nbsp;·&nbsp; {PRODUCT_CODE_LABEL} {PRODUCT_CODE}
        </p>
      </div>
    </div>
  );
}
