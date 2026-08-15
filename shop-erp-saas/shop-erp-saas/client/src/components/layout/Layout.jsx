import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import Footer from './Footer.jsx';
import { ScannerProvider } from '../../context/ScannerContext.jsx';

export default function Layout() {
  const [open, setOpen] = useState(false);
  return (
    // Mounted here (not per-page) so a connected phone scanner survives
    // navigating between pages — React Router keeps this Layout mounted and
    // only swaps the <Outlet /> child, so the connection/poll never restarts.
    <ScannerProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar open={open} onClose={() => setOpen(false)} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Topbar onMenu={() => setOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            <Outlet />
          </main>
          <Footer />
        </div>
      </div>
    </ScannerProvider>
  );
}
