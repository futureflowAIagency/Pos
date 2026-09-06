import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import AdminRoute from './routes/AdminRoute.jsx';

import Login from './pages/Login.jsx';
import ScanRemote from './pages/ScanRemote.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Products from './pages/Products.jsx';
import POS from './pages/POS.jsx';
import InvoiceSearch from './pages/InvoiceSearch.jsx';
import Customers from './pages/Customers.jsx';
import Suppliers from './pages/Suppliers.jsx';
import Branches from './pages/Branches.jsx';
import StockTransfer from './pages/StockTransfer.jsx';
import Employees from './pages/Employees.jsx';
import Finance from './pages/Finance.jsx';
import Returns from './pages/Returns.jsx';
import ImportExport from './pages/ImportExport.jsx';
import Subscription from './pages/Subscription.jsx';
import Settings from './pages/Settings.jsx';
import ActivityLogs from './pages/ActivityLogs.jsx';
import Warranty from './pages/Warranty.jsx';
import ClaimWarranty from './pages/ClaimWarranty.jsx';
import Installments from './pages/Installments.jsx';
import Services from './pages/Services.jsx';
import Marketing from './pages/Marketing.jsx';
import CRM from './pages/CRM.jsx';
import AdminPanel from './pages/admin/AdminPanel.jsx';
import BusinessData from './pages/admin/BusinessData.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      {/* Public — no login. A phone opens this after scanning a POS "Scan with
          Phone" QR code; access is gated by the session id + token in the URL. */}
      <Route path="/scan/:id" element={<ScanRemote />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/invoice-search" element={<InvoiceSearch />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/branches" element={<Branches />} />
        <Route path="/stock-transfer" element={<StockTransfer />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/returns" element={<Returns />} />
        <Route path="/import-export" element={<ImportExport />} />
        <Route path="/subscription" element={<Subscription />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/activity" element={<ActivityLogs />} />
        <Route path="/warranty" element={<Warranty />} />
        <Route path="/claim-warranty" element={<ClaimWarranty />} />
        <Route path="/installments" element={<Installments />} />
        <Route path="/services" element={<Services />} />
        <Route path="/marketing" element={<Marketing />} />
        <Route path="/crm" element={<CRM />} />
      </Route>

      <Route element={<AdminRoute><Layout /></AdminRoute>}>
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/admin/businesses/:id" element={<BusinessData />} />
      </Route>
    </Routes>
  );
}
