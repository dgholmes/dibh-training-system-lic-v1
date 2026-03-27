import Layout from "./Layout.jsx";

import Calibration from "./Calibration";

import EndSession from "./EndSession";

import EquipmentCheck from "./EquipmentCheck";

import Login from "./Login";

import Home from "./Home";

import InitialDiagnosis from "./InitialDiagnosis";

import NewPatient from "./NewPatient";

import PatientDashboard from "./PatientDashboard";

import TrainingMonitor from "./TrainingMonitor";

import TrainingHistory from "./TrainingHistory";

import TrainingReport from "./TrainingReport";

import TrainingResult from "./TrainingResult";

import TypeDecision from "./TypeDecision";

import AnalysisFileSelect from "./AnalysisFileSelect";

import BreathingDataUpload from "./BreathingDataUpload";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {
    
    Calibration: Calibration,
    
    EndSession: EndSession,
    
    EquipmentCheck: EquipmentCheck,
    
    Login: Login,
    
    Home: Home,
    
    InitialDiagnosis: InitialDiagnosis,
    
    NewPatient: NewPatient,
    
    PatientDashboard: PatientDashboard,
    
    TrainingHistory: TrainingHistory,
    
    TrainingMonitor: TrainingMonitor,
    
    TrainingReport: TrainingReport,
    
    TrainingResult: TrainingResult,
    
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

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                
                    <Route path="/" element={<Login />} />
                
                
                <Route path="/Calibration" element={<Calibration />} />
                
                <Route path="/EndSession" element={<EndSession />} />
                
                <Route path="/EquipmentCheck" element={<EquipmentCheck />} />
                
                <Route path="/Login" element={<Login />} />
                
                <Route path="/Home" element={<Home />} />
                
                <Route path="/InitialDiagnosis" element={<InitialDiagnosis />} />
                
                <Route path="/NewPatient" element={<NewPatient />} />
                
                <Route path="/PatientDashboard" element={<PatientDashboard />} />
                
                <Route path="/TrainingHistory" element={<TrainingHistory />} />
                
                <Route path="/TrainingMonitor" element={<TrainingMonitor />} />
                
                <Route path="/TrainingReport" element={<TrainingReport />} />
                
                <Route path="/TrainingResult" element={<TrainingResult />} />
                
                <Route path="/TypeDecision" element={<TypeDecision />} />

                <Route path="/AnalysisFileSelect" element={<AnalysisFileSelect />} />

                <Route path="/BreathingDataUpload" element={<BreathingDataUpload />} />
                
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