import Layout from "./Layout.jsx";

import Login from "./Login";

import Home from "./Home";

import NewPatient from "./NewPatient";

import PatientDashboard from "./PatientDashboard";

import TrainingHistory from "./TrainingHistory";

import TrainingReport from "./TrainingReport";

import TypeDecision from "./TypeDecision";

import AnalysisFileSelect from "./AnalysisFileSelect";

import BreathingDataUpload from "./BreathingDataUpload";

import LegacyFlowRedirect from "./LegacyFlowRedirect.jsx";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {
    Login: Login,
    Home: Home,
    NewPatient: NewPatient,
    PatientDashboard: PatientDashboard,
    TrainingHistory: TrainingHistory,
    CalibrationReport: TrainingReport,
    TypeDecision: TypeDecision,
    AnalysisFileSelect: AnalysisFileSelect,
    BreathingDataUpload: BreathingDataUpload,
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

function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);

    return (
        <Layout currentPageName={currentPage}>
            <Routes>
                <Route path="/" element={<Login />} />
                <Route path="/Login" element={<Login />} />
                <Route path="/login" element={<Login />} />
                <Route path="/Home" element={<Home />} />
                <Route path="/home" element={<Home />} />
                <Route path="/NewPatient" element={<NewPatient />} />
                <Route path="/newpatient" element={<NewPatient />} />
                <Route path="/PatientDashboard" element={<PatientDashboard />} />
                <Route path="/patientdashboard" element={<PatientDashboard />} />
                <Route path="/TrainingHistory" element={<TrainingHistory />} />
                <Route path="/traininghistory" element={<TrainingHistory />} />
                <Route path="/CalibrationReport" element={<TrainingReport />} />
                <Route path="/calibrationreport" element={<TrainingReport />} />
                <Route path="/TypeDecision" element={<TypeDecision />} />
                <Route path="/typedecision" element={<TypeDecision />} />
                <Route path="/AnalysisFileSelect" element={<AnalysisFileSelect />} />
                <Route path="/analysisfileselect" element={<AnalysisFileSelect />} />
                <Route path="/BreathingDataUpload" element={<BreathingDataUpload />} />
                <Route path="/breathingdataupload" element={<BreathingDataUpload />} />

                {/* Deferred live belt / VR flows — deep links redirect to dashboard */}
                <Route path="/Calibration" element={<LegacyFlowRedirect />} />
                <Route path="/calibration" element={<LegacyFlowRedirect />} />
                <Route path="/EndSession" element={<LegacyFlowRedirect />} />
                <Route path="/endsession" element={<LegacyFlowRedirect />} />
                <Route path="/EquipmentCheck" element={<LegacyFlowRedirect />} />
                <Route path="/equipmentcheck" element={<LegacyFlowRedirect />} />
                <Route path="/InitialDiagnosis" element={<LegacyFlowRedirect />} />
                <Route path="/initialdiagnosis" element={<LegacyFlowRedirect />} />
                <Route path="/TrainingMonitor" element={<LegacyFlowRedirect />} />
                <Route path="/trainingmonitor" element={<LegacyFlowRedirect />} />
                <Route path="/TrainingResult" element={<LegacyFlowRedirect />} />
                <Route path="/trainingresult" element={<LegacyFlowRedirect />} />
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
