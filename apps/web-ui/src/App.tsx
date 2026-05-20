import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppStateProvider } from "./state/AppState.tsx";
import { Topbar } from "./components/Topbar.tsx";
import { PinFoot } from "./components/PinFoot.tsx";
import { Flash } from "./components/Flash.tsx";
import { Dashboard } from "./screens/Dashboard.tsx";
import { Sources } from "./screens/Sources.tsx";
import { Settings } from "./screens/Settings.tsx";
import { Logs } from "./screens/Logs.tsx";
import { About } from "./screens/About.tsx";

export default function App() {
  return (
    <BrowserRouter>
      <AppStateProvider>
        <div className="app-shell">
          <Topbar />
          <div className="content">
            <Flash />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/sources" element={<Sources />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <PinFoot />
        </div>
      </AppStateProvider>
    </BrowserRouter>
  );
}
