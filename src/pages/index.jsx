import Layout from "./Layout.jsx";
import Login from "./Login";
import Home from "./Home";
import NewPatient from "./NewPatient";
import PatientDashboard from "./PatientDashboard";
import TrainingHistory from "./TrainingHistory";
import TrainingReport from "./TrainingReport";
import TypeDecision from "./TypeDecision";
import AnalysisFileSelect from "./AnalysisFileSelect";
import BreathingUploadRedirect from "./BreathingUploadRedirect.jsx";
import LegacyFlowRedirect from "./LegacyFlowRedirect.jsx";
import AdminAccounts from "./AdminAccounts.jsx";
import AdminAuditLog from "./AdminAuditLog.jsx";
import AdminBackup from "./AdminBackup.jsx";
// SI-07 evidence harness — registered only in debug builds (see below).
import DebugErrorGallery from "./DebugErrorGallery.jsx";

import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { SECURITY_DEBUG } from '@/lib/securityDebug';

const PAGES = {
    Login: Login,
    Home: Home,
    NewPatient: NewPatient,
    PatientDashboard: PatientDashboard,
    TrainingHistory: TrainingHistory,
    CalibrationReport: TrainingReport,
    TypeDecision: TypeDecision,
    AnalysisFileSelect: AnalysisFileSelect,
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || 'Login';
}

function ProtectedRoute({ children }) {
    const { isAuthenticated, initialised } = useAuth();
    const location = useLocation();
    if (!initialised) return null;
    if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
    return children;
}

function AdminRoute({ children }) {
    const { session, initialised } = useAuth();
    const location = useLocation();
    if (!initialised) return null;
    if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
    if (session.role !== 'admin') return <Navigate to="/home" replace />;
    return children;
}

function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);

    return (
        <Layout currentPageName={currentPage}>
            <Routes>
                <Route path="/" element={<Login />} />
                <Route path="/Login" element={<Login />} />
                <Route path="/login" element={<Login />} />
                <Route path="/Home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path="/NewPatient" element={<ProtectedRoute><NewPatient /></ProtectedRoute>} />
                <Route path="/newpatient" element={<ProtectedRoute><NewPatient /></ProtectedRoute>} />
                <Route path="/PatientDashboard" element={<ProtectedRoute><PatientDashboard /></ProtectedRoute>} />
                <Route path="/patientdashboard" element={<ProtectedRoute><PatientDashboard /></ProtectedRoute>} />
                <Route path="/TrainingHistory" element={<ProtectedRoute><TrainingHistory /></ProtectedRoute>} />
                <Route path="/traininghistory" element={<ProtectedRoute><TrainingHistory /></ProtectedRoute>} />
                <Route path="/CalibrationReport" element={<ProtectedRoute><TrainingReport /></ProtectedRoute>} />
                <Route path="/calibrationreport" element={<ProtectedRoute><TrainingReport /></ProtectedRoute>} />
                <Route path="/TypeDecision" element={<ProtectedRoute><TypeDecision /></ProtectedRoute>} />
                <Route path="/typedecision" element={<ProtectedRoute><TypeDecision /></ProtectedRoute>} />
                <Route path="/AnalysisFileSelect" element={<ProtectedRoute><AnalysisFileSelect /></ProtectedRoute>} />
                <Route path="/analysisfileselect" element={<ProtectedRoute><AnalysisFileSelect /></ProtectedRoute>} />
                {/* Upload merged into the analysis screen — keep deep links alive */}
                <Route path="/BreathingDataUpload" element={<ProtectedRoute><BreathingUploadRedirect /></ProtectedRoute>} />
                <Route path="/breathingdataupload" element={<ProtectedRoute><BreathingUploadRedirect /></ProtectedRoute>} />

                {/* Admin-only routes */}
                <Route path="/admin/accounts" element={<AdminRoute><AdminAccounts /></AdminRoute>} />
                <Route path="/admin/auditlog" element={<AdminRoute><AdminAuditLog /></AdminRoute>} />
                <Route path="/admin/backup" element={<AdminRoute><AdminBackup /></AdminRoute>} />

                {/* SI-07 message-capture harness. SECURITY_DEBUG is a build-time literal,
                    so this route does not exist in a production build. */}
                {SECURITY_DEBUG && <Route path="/debug/errors" element={<DebugErrorGallery />} />}

                {/* Deferred live belt / VR flows — deep links redirect to dashboard */}
                <Route path="/Calibration" element={<ProtectedRoute><LegacyFlowRedirect /></ProtectedRoute>} />
                <Route path="/calibration" element={<ProtectedRoute><LegacyFlowRedirect /></ProtectedRoute>} />
                <Route path="/EndSession" element={<ProtectedRoute><LegacyFlowRedirect /></ProtectedRoute>} />
                <Route path="/endsession" element={<ProtectedRoute><LegacyFlowRedirect /></ProtectedRoute>} />
                <Route path="/EquipmentCheck" element={<ProtectedRoute><LegacyFlowRedirect /></ProtectedRoute>} />
                <Route path="/equipmentcheck" element={<ProtectedRoute><LegacyFlowRedirect /></ProtectedRoute>} />
                <Route path="/InitialDiagnosis" element={<ProtectedRoute><LegacyFlowRedirect /></ProtectedRoute>} />
                <Route path="/initialdiagnosis" element={<ProtectedRoute><LegacyFlowRedirect /></ProtectedRoute>} />
                <Route path="/TrainingMonitor" element={<ProtectedRoute><LegacyFlowRedirect /></ProtectedRoute>} />
                <Route path="/trainingmonitor" element={<ProtectedRoute><LegacyFlowRedirect /></ProtectedRoute>} />
                <Route path="/TrainingResult" element={<ProtectedRoute><LegacyFlowRedirect /></ProtectedRoute>} />
                <Route path="/trainingresult" element={<ProtectedRoute><LegacyFlowRedirect /></ProtectedRoute>} />
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}
