import React, { useState } from 'react';
import { Search, Plus, ChevronLeft, ChevronRight, LogOut, Bluetooth, Wifi, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Patient } from '@/api/entities';
import { useQuery } from '@tanstack/react-query';
import PatientCard from '@/components/common/PatientCard';
import { useGoDirect } from '@/context/GoDirectContext';
import BluetoothSettingsSheet from '@/components/common/BluetoothSettingsSheet';
import { cn } from '@/lib/utils';

export default function Home() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [bluetoothSheetOpen, setBluetoothSheetOpen] = useState(false);
  const navigate = useNavigate();
  const patientsPerPage = 5;

  // GoDirect Bluetooth connection
  const { connected, connecting, connect, connectionAttempt, maxRetries } = useGoDirect();

  // Handle Bluetooth indicator click
  const handleBluetoothClick = () => {
    if (connected) {
      // If connected, open settings sheet
      setBluetoothSheetOpen(true);
    } else if (!connecting) {
      // If not connected and not connecting, initiate connection
      connect();
    }
  };

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients'],
    queryFn: () => Patient.list('-last_training_date'),
  });

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
    navigate(createPageUrl('Login'));
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-6 pb-24">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">환자 정보 선택</h1>
          <div className="flex items-center gap-2">
            {/* Bluetooth Indicator */}
            <button
              onClick={handleBluetoothClick}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all",
                connected 
                  ? "bg-[#22C55E]/10 hover:bg-[#22C55E]/20" 
                  : connecting 
                    ? "bg-[#3B82F6]/10" 
                    : "bg-[#1C2128] hover:bg-[#30363D]"
              )}
              title={connected ? '블루투스 설정' : '블루투스 연결'}
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 text-[#3B82F6] animate-spin" />
              ) : (
                <Bluetooth className={cn(
                  "w-4 h-4",
                  connected ? "text-[#22C55E]" : "text-[#8B949E]"
                )} />
              )}
              <span className={cn(
                "text-xs font-medium",
                connected ? "text-[#22C55E]" : connecting ? "text-[#3B82F6]" : "text-[#8B949E]"
              )}>
                {connected 
                  ? '연결됨' 
                  : connecting 
                    ? (connectionAttempt > 0 ? `재시도 ${connectionAttempt}/${maxRetries}` : '연결 중')
                    : '연결 안됨'}
              </span>
            </button>

            {/* WiFi Indicator */}
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#22C55E]/10">
              <Wifi className="w-4 h-4 text-[#22C55E]" />
              <span className="text-xs font-medium text-[#22C55E]">WiFi</span>
            </div>

            {/* Logout Button */}
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="text-[#8B949E] hover:text-white hover:bg-[#1C2128]"
            >
              <LogOut className="w-4 h-4 mr-1.5" />
              로그아웃
            </Button>
          </div>
        </div>

        {/* Bluetooth Settings Sheet */}
        <BluetoothSettingsSheet 
          open={bluetoothSheetOpen} 
          onOpenChange={setBluetoothSheetOpen} 
        />

        {/* Search Bar and New Patient Button */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8B949E]" />
          <Input
            id="patient-search"
            name="patient-search"
            placeholder="환자명 또는 코드로 검색"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
              <h2 className="text-[#8B949E] text-sm font-bold mb-3 uppercase tracking-wide">최근 치료 환자</h2>
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
              <h2 className="text-[#8B949E] text-sm font-bold mb-3 uppercase tracking-wide">최근 치료 환자</h2>
            <div className="space-y-3">
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
            <div className="text-center py-8">
              <p className="text-[#8B949E] text-m mb-4">등록된 환자가 없습니다</p>
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
      </div>
    </div>
  );
}
