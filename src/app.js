// JeeDrive - High-Clarity 9-Table Supabase Schema CRUD Admin Panel & Website
import {
  TABLES_REGISTRY,
  fetchTableRecords,
  insertTableRecord,
  updateTableRecord,
  deleteTableRecord,
  logAdminAction,
  authenticateAdminUser
} from './supabaseClient.js';

// Table Icon Mapping for maximum sidebar clarity (Dashboard + 9 Non-Pricing Tables)
const TABLE_ICONS = {
  dashboard: "📊",
  owners: "👥",
  bookings: "📅",
  driver_profiles: "🚘",
  driver_preferences: "⚙️",
  driver_notifications: "🔔",
  driver_support_tickets: "🎫",
  admin_audit_logs: "📜",
  driver_documents: "📁",
  owner_notifications: "📨"
};

// Application State
const state = {
  currentView: 'website', // 'website', 'admin_login', 'admin_panel'
  activeTableId: 'dashboard', // Default to Dashboard section
  tablesData: {}, // Cached records per table
  tablesCounts: {}, // Record counts
  isLoadingTable: false,
  tableError: null,
  searchQuery: '',
  tableFilter: 'ALL',
  currentPage: 1,
  pageSize: 10,

  // Secret 5-Click Logo State
  logoClickCount: 0,
  logoClickTimer: null,

  // Modals
  viewModalRecord: null,
  addModalOpen: false,
  editModalRecord: null,
  deleteModalRecord: null,
  modalFormError: null,
  isSaving: false,

  // Auth State (Live Supabase Verification against public.admin_users)
  adminAuth: {
    isAuthenticated: false, // Verified live against Supabase admin_users table
    userEmail: 'neembaba@drivemate.in',
    username: 'NeemBaba',
    role: 'SUPER_ADMIN'
  },
  isLoggingIn: false,
  loginError: null,

  notification: null
};

// Support Phone Configuration (Kept hidden from visible text as required by UI rules)
const SUPPORT_PHONE_NUMBER = "+918197341169";

// Toast Notifications
function showToast(message, type = 'info') {
  state.notification = { message, type };
  renderApp();
  setTimeout(() => {
    state.notification = null;
    renderApp();
  }, 4000);
}

// Fetch active table data from Supabase
async function loadActiveTableData(forceRefresh = false) {
  if (state.activeTableId === 'dashboard') {
    await loadAllTablesData(forceRefresh);
    return;
  }

  const tableConfig = TABLES_REGISTRY.find(t => t.id === state.activeTableId);
  if (!tableConfig) return;

  if (!forceRefresh && state.tablesData[state.activeTableId]) {
    renderApp();
    return;
  }

  state.isLoadingTable = true;
  state.tableError = null;
  renderApp();

  try {
    const records = await fetchTableRecords(tableConfig.dbTable, tableConfig.orderBy, 150);
    state.tablesData[state.activeTableId] = Array.isArray(records) ? records : [];
    state.tablesCounts[state.activeTableId] = state.tablesData[state.activeTableId].length;
  } catch (err) {
    console.error(`Error loading table ${tableConfig.dbTable}:`, err);
    state.tableError = err.message || 'Failed to fetch records from Supabase';
    state.tablesData[state.activeTableId] = [];
  } finally {
    state.isLoadingTable = false;
    renderApp();
  }
}

// Preload all 9 tables for Dashboard Metrics
async function loadAllTablesData(forceRefresh = false) {
  state.isLoadingTable = true;
  state.tableError = null;
  renderApp();

  try {
    await Promise.all(TABLES_REGISTRY.map(async (tableConfig) => {
      if (!forceRefresh && state.tablesData[tableConfig.id]) return;
      try {
        const records = await fetchTableRecords(tableConfig.dbTable, tableConfig.orderBy, 100);
        state.tablesData[tableConfig.id] = Array.isArray(records) ? records : [];
        state.tablesCounts[tableConfig.id] = state.tablesData[tableConfig.id].length;
      } catch (err) {
        state.tablesData[tableConfig.id] = state.tablesData[tableConfig.id] || [];
      }
    }));
  } catch (err) {
    console.error("Dashboard data load error:", err);
    state.tableError = "Failed to load dashboard metrics.";
  } finally {
    state.isLoadingTable = false;
    renderApp();
  }
}

// Handle Add Form Submission
async function handleAddRecord(e) {
  e.preventDefault();
  const tableConfig = TABLES_REGISTRY.find(t => t.id === state.activeTableId);
  if (!tableConfig || !tableConfig.canAdd) return;

  state.isSaving = true;
  state.modalFormError = null;
  renderApp();

  const formData = new FormData(e.target);
  const payload = {};

  for (const col of tableConfig.columns) {
    if (col.readOnly && col.name === 'id') continue;
    if (col.readOnly && (col.name === 'created_at' || col.name === 'updated_at')) continue;

    if (col.type === 'boolean') {
      payload[col.name] = formData.get(col.name) === 'on';
    } else if (col.type === 'number') {
      const val = formData.get(col.name);
      if (val !== null && val !== '') {
        payload[col.name] = Number(val);
      } else if (col.isRequired) {
        state.modalFormError = `Field "${col.label}" is required.`;
        state.isSaving = false;
        renderApp();
        return;
      }
    } else if (col.type === 'json') {
      const val = formData.get(col.name);
      if (val && val.trim()) {
        try {
          payload[col.name] = JSON.parse(val);
        } catch {
          state.modalFormError = `Invalid JSON formatted in "${col.label}".`;
          state.isSaving = false;
          renderApp();
          return;
        }
      }
    } else {
      const val = formData.get(col.name);
      if (val !== null && val !== '') {
        payload[col.name] = val;
      } else if (col.isRequired) {
        state.modalFormError = `Field "${col.label}" is required.`;
        state.isSaving = false;
        renderApp();
        return;
      }
    }
  }

  try {
    await insertTableRecord(tableConfig.dbTable, payload);
    showToast(`Record successfully added to ${tableConfig.name}!`, 'success');
    await logAdminAction(state.adminAuth.userEmail, `INSERT_${tableConfig.dbTable.toUpperCase()}`, payload.driver_id || payload.id || null, { added: payload });
    state.addModalOpen = false;
    await loadActiveTableData(true);
  } catch (err) {
    state.modalFormError = err.message || 'Supabase rejected the insert operation.';
  } finally {
    state.isSaving = false;
    renderApp();
  }
}

// Handle Edit Form Submission
async function handleEditRecord(e) {
  e.preventDefault();
  const tableConfig = TABLES_REGISTRY.find(t => t.id === state.activeTableId);
  if (!tableConfig || !tableConfig.canEdit || !state.editModalRecord) return;

  state.isSaving = true;
  state.modalFormError = null;
  renderApp();

  const formData = new FormData(e.target);
  const patchData = {};
  const primaryKeyVal = state.editModalRecord[tableConfig.primaryKey];

  for (const col of tableConfig.columns) {
    if (col.readOnly || col.name === tableConfig.primaryKey) continue;
    if (col.name === 'password_hash') continue;

    if (col.type === 'boolean') {
      patchData[col.name] = formData.get(col.name) === 'on';
    } else if (col.type === 'number') {
      const val = formData.get(col.name);
      if (val !== null && val !== '') {
        patchData[col.name] = Number(val);
      }
    } else if (col.type === 'json') {
      const val = formData.get(col.name);
      if (val && val.trim()) {
        try {
          patchData[col.name] = JSON.parse(val);
        } catch {
          state.modalFormError = `Invalid JSON in "${col.label}".`;
          state.isSaving = false;
          renderApp();
          return;
        }
      }
    } else {
      const val = formData.get(col.name);
      if (val !== null) {
        patchData[col.name] = val;
      }
    }
  }

  if (tableConfig.columns.some(c => c.name === 'updated_at')) {
    patchData.updated_at = new Date().toISOString();
  }

  try {
    await updateTableRecord(tableConfig.dbTable, tableConfig.primaryKey, primaryKeyVal, patchData);
    showToast(`Record updated in ${tableConfig.name}!`, 'success');
    await logAdminAction(state.adminAuth.userEmail, `UPDATE_${tableConfig.dbTable.toUpperCase()}`, state.editModalRecord.driver_id || primaryKeyVal, { updated: patchData });
    state.editModalRecord = null;
    await loadActiveTableData(true);
  } catch (err) {
    state.modalFormError = err.message || 'Supabase rejected the update operation.';
  } finally {
    state.isSaving = false;
    renderApp();
  }
}

// Handle Delete Confirmation
async function confirmDeleteRecord() {
  const tableConfig = TABLES_REGISTRY.find(t => t.id === state.activeTableId);
  if (!tableConfig || !tableConfig.canDelete || !state.deleteModalRecord) return;

  const primaryKeyVal = state.deleteModalRecord[tableConfig.primaryKey];
  state.isSaving = true;
  renderApp();

  try {
    await deleteTableRecord(tableConfig.dbTable, tableConfig.primaryKey, primaryKeyVal);
    showToast(`Record deleted from ${tableConfig.name}!`, 'success');
    await logAdminAction(state.adminAuth.userEmail, `DELETE_${tableConfig.dbTable.toUpperCase()}`, state.deleteModalRecord.driver_id || primaryKeyVal, { deleted_id: primaryKeyVal });
    state.deleteModalRecord = null;
    await loadActiveTableData(true);
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'danger');
  } finally {
    state.isSaving = false;
    renderApp();
  }
}

// -------------------------------------------------------------
// UI Renderers
// -------------------------------------------------------------

function renderHeader() {
  const isAuth = state.adminAuth.isAuthenticated;
  return `
    <header class="glass-nav sticky top-0 z-40 px-4 lg:px-8 py-3 transition-all border-b border-[#F5E6DA]/90 bg-[#FFF9F5]/95 backdrop-blur-md shadow-sm">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        
        <!-- Secret 5-Click Logo Access -->
        <a href="#" onclick="event.preventDefault(); window.handleLogoClick();" class="flex items-center group cursor-pointer select-none">
          <img src="./assets/logo.png" alt="JEE DRIVE - Your Drive Our Priority" class="h-10 lg:h-12 w-auto object-contain transition-transform group-hover:scale-105">
        </a>

        <!-- Public Nav links (when on website view) -->
        ${state.currentView === 'website' ? `
          <nav class="hidden md:flex items-center gap-7 font-semibold text-xs text-[#0A1329]">
            <a href="#overview" class="hover:text-[#0556F3] transition-colors">Overview</a>
            <a href="#how-it-works" class="hover:text-[#0556F3] transition-colors">How It Works</a>
            <a href="#benefits" class="hover:text-[#0556F3] transition-colors">Benefits</a>
            <a href="#trip-types" class="hover:text-[#0556F3] transition-colors">Trip Types</a>
            <a href="#driver-registration" class="hover:text-[#0556F3] transition-colors">Become a Driver</a>
          </nav>
        ` : `
          <div class="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span>JeeDrive Admin Control Center</span>
          </div>
        `}

        <!-- Action CTAs -->
        <div class="flex items-center gap-3">
          <!-- Call Support Icon Button -->
          <a href="tel:${SUPPORT_PHONE_NUMBER}" class="support-call-btn" aria-label="Call Support" title="Call JeeDrive Support">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
          </a>

          ${isAuth ? `
            ${state.currentView !== 'admin_panel' ? `
              <button onclick="window.navigateTo('admin_panel');" class="btn-primary text-xs py-2 px-3.5">
                Admin Panel
              </button>
            ` : `
              <button onclick="window.navigateTo('website');" class="btn-secondary text-xs py-2 px-3">
                Website View
              </button>
            `}
            <button onclick="window.logoutAdmin();" class="text-xs font-semibold text-slate-500 hover:text-red-600 px-2.5 py-1 transition-colors">
              Logout
            </button>
          ` : ''}
        </div>

      </div>
    </header>
  `;
}

// Clean Public Website View (Warm Cream, Dark Navy, JeeDrive Blue & Subtle Orange Palette)
function renderPublicWebsite() {
  return `
    <!-- Hero / Overview Section -->
    <section id="overview" class="relative pt-12 pb-20 md:pt-16 md:pb-28 bg-gradient-to-b from-[#FFF5EC] via-[#FFF9F5] to-[#FEF6EF] overflow-hidden border-b border-[#F5E6DA]">
      <div class="max-w-7xl mx-auto px-4 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div class="lg:col-span-7 space-y-6">
            <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF0E5] border border-[#FCD5B5] text-[#D96B10] text-xs font-bold shadow-sm">
              <span class="w-2 h-2 rounded-full bg-[#F58220] animate-ping"></span>
              Your Drive, Our Priority — Bengaluru Chauffeur Network
            </div>
            <h1 class="text-4xl md:text-5xl lg:text-6xl font-extrabold text-[#0A1329] leading-tight tracking-tight">
              Professional Drivers for Your <span class="gradient-text">Own Car</span>, Whenever You Need.
            </h1>
            <p class="text-[#3B4758] text-base md:text-lg max-w-xl font-normal leading-relaxed">
              JeeDrive connects vehicle owners with background-verified, experienced chauffeurs in Bengaluru. Enjoy smooth city rides, airport drops, and outstation trips with complete peace of mind.
            </p>
            <div class="flex flex-wrap gap-4 pt-2">
              <a href="#how-it-works" class="btn-orange text-xs py-3 px-6 shadow-xl shadow-orange-500/20">
                ⚡ Explore How It Works
              </a>
              <a href="tel:${SUPPORT_PHONE_NUMBER}" class="btn-secondary text-xs py-3 px-5">
                📞 Call JeeDrive Support
              </a>
            </div>
          </div>
          <div class="lg:col-span-5">
            <div class="glass-panel p-6 border-[#FCE8D8] text-center bg-white/90 backdrop-blur-md shadow-xl shadow-orange-950/5 rounded-2xl">
              <img src="./assets/logo.png" alt="JEE DRIVE - Your Drive Our Priority" class="w-full max-h-56 object-contain rounded-xl mb-4 p-4 bg-white border border-[#F5E6DA] shadow-inner">
              <div class="p-4 bg-[#F0F5FF] rounded-xl border border-[#D0E0FF] text-left text-xs space-y-2.5 text-[#3B4758]">
                <div class="text-[#0556F3] font-bold flex items-center gap-1.5">
                  <span>✓</span> Manual & Automatic Vehicles Supported
                </div>
                <div>Available across all Bengaluru localities: Indiranagar, Koramangala, Whitefield, Jayanagar, Hoskote, and Airport routes.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section id="how-it-works" class="py-16 md:py-24 bg-[#FFF2E8] border-b border-[#F5E6DA]">
      <div class="max-w-7xl mx-auto px-4 lg:px-8 text-center">
        <h2 class="text-2xl md:text-4xl font-extrabold text-[#0A1329] mb-3">How JeeDrive <span class="gradient-text">Works</span></h2>
        <p class="text-[#3B4758] text-xs md:text-sm font-medium mb-12">4 easy steps for car owners and driver partners</p>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 text-left">
          <div class="glass-panel p-6 border-[#FCE8D8] bg-white/80 hover:bg-white hover:border-[#F58220]/40 shadow-sm hover:shadow-xl transition-all duration-300 rounded-2xl">
            <div class="text-[#0556F3] font-black text-2xl mb-2">01</div>
            <h3 class="text-base font-bold text-[#0A1329] mb-1.5">Select Trip Type</h3>
            <p class="text-xs text-[#3B4758] leading-relaxed">Choose One-Way, Round Trip, Airport, Outstation, or Home Ride.</p>
          </div>
          <div class="glass-panel p-6 border-[#FCE8D8] bg-white/80 hover:bg-white hover:border-[#F58220]/40 shadow-sm hover:shadow-xl transition-all duration-300 rounded-2xl">
            <div class="text-[#0556F3] font-black text-2xl mb-2">02</div>
            <h3 class="text-base font-bold text-[#0A1329] mb-1.5">Verified Driver Match</h3>
            <p class="text-xs text-[#3B4758] leading-relaxed">JeeDrive assigns a nearby vetted chauffeur suited to your transmission.</p>
          </div>
          <div class="glass-panel p-6 border-[#FCE8D8] bg-white/80 hover:bg-white hover:border-[#F58220]/40 shadow-sm hover:shadow-xl transition-all duration-300 rounded-2xl">
            <div class="text-[#0556F3] font-black text-2xl mb-2">03</div>
            <h3 class="text-base font-bold text-[#0A1329] mb-1.5">Enjoy The Ride</h3>
            <p class="text-xs text-[#3B4758] leading-relaxed">Sit back in your personal car while our experienced driver steers.</p>
          </div>
          <div class="glass-panel p-6 border-[#FCE8D8] bg-white/80 hover:bg-white hover:border-[#F58220]/40 shadow-sm hover:shadow-xl transition-all duration-300 rounded-2xl">
            <div class="text-[#F58220] font-black text-2xl mb-2">04</div>
            <h3 class="text-base font-bold text-[#0A1329] mb-1.5">Transparent Fare</h3>
            <p class="text-xs text-[#3B4758] leading-relaxed">Pay the calculated fare directly based on verified pricing rules.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Benefits -->
    <section id="benefits" class="py-16 md:py-24 bg-[#FFF9F5] border-b border-[#F5E6DA]">
      <div class="max-w-7xl mx-auto px-4 lg:px-8">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div class="glass-panel p-8 border-[#0556F3]/20 bg-[#F0F5FF]/80 rounded-2xl shadow-sm space-y-4 hover:shadow-md transition-all">
            <span class="text-xs font-extrabold text-[#0556F3] uppercase tracking-wider">For Car Owners</span>
            <h3 class="text-2xl font-extrabold text-[#0A1329]">Why Car Owners Choose JeeDrive</h3>
            <ul class="space-y-3 text-xs md:text-sm text-[#3B4758] font-medium">
              <li class="flex items-center gap-2"><span class="text-[#0556F3] font-bold">✓</span> Background-verified drivers with Aadhaar, PAN, and DL checks</li>
              <li class="flex items-center gap-2"><span class="text-[#0556F3] font-bold">✓</span> Manual, Automatic, Luxury & SUV vehicle versatility</li>
              <li class="flex items-center gap-2"><span class="text-[#0556F3] font-bold">✓</span> Upfront pricing rules with zero hidden extras</li>
            </ul>
          </div>
          <div class="glass-panel p-8 border-[#F58220]/20 bg-[#FFF3E8]/80 rounded-2xl shadow-sm space-y-4 hover:shadow-md transition-all">
            <span class="text-xs font-extrabold text-[#F58220] uppercase tracking-wider">For Driver Partners</span>
            <h3 class="text-2xl font-extrabold text-[#0A1329]">Empowering Professional Chauffeurs</h3>
            <ul class="space-y-3 text-xs md:text-sm text-[#3B4758] font-medium">
              <li class="flex items-center gap-2"><span class="text-[#F58220] font-bold">★</span> Verified Driver ID generated on admin approval</li>
              <li class="flex items-center gap-2"><span class="text-[#F58220] font-bold">★</span> Duty preferences: Airport, Outstation, and Home Ride support</li>
              <li class="flex items-center gap-2"><span class="text-[#F58220] font-bold">★</span> Fast mobile application registration & approval</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Trip Types -->
    <section id="trip-types" class="py-16 md:py-24 bg-[#FFF2E8] border-b border-[#F5E6DA]">
      <div class="max-w-7xl mx-auto px-4 lg:px-8 text-center">
        <h2 class="text-2xl md:text-4xl font-extrabold text-[#0A1329] mb-3">Available <span class="gradient-text">Trip Types</span></h2>
        <p class="text-[#3B4758] text-xs md:text-sm font-medium mb-10">Supported across Bengaluru and Outstation routes</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-5 text-center">
          <div class="glass-panel p-5 border-[#FCE8D8] bg-white/80 hover:bg-white hover:border-[#0556F3]/40 shadow-sm hover:shadow-md transition-all rounded-2xl">
            <div class="text-[#0556F3] font-extrabold text-xl mb-1.5">→</div>
            <div class="text-sm font-bold text-[#0A1329]">One Way</div>
            <div class="text-[11px] text-[#3B4758] mt-1">Point-to-point within Bengaluru</div>
          </div>
          <div class="glass-panel p-5 border-[#FCE8D8] bg-white/80 hover:bg-white hover:border-[#0556F3]/40 shadow-sm hover:shadow-md transition-all rounded-2xl">
            <div class="text-[#0556F3] font-extrabold text-xl mb-1.5">⇄</div>
            <div class="text-sm font-bold text-[#0A1329]">Round Trip</div>
            <div class="text-[11px] text-[#3B4758] mt-1">Return trips & multi-stop duties</div>
          </div>
          <div class="glass-panel p-5 border-[#FCE8D8] bg-white/80 hover:bg-white hover:border-[#0556F3]/40 shadow-sm hover:shadow-md transition-all rounded-2xl">
            <div class="text-[#0556F3] font-extrabold text-xl mb-1.5">✈</div>
            <div class="text-sm font-bold text-[#0A1329]">Airport</div>
            <div class="text-[11px] text-[#3B4758] mt-1">Dedicated Kempegowda BLR transfers</div>
          </div>
          <div class="glass-panel p-5 border-[#FCE8D8] bg-white/80 hover:bg-white hover:border-[#F58220]/40 shadow-sm hover:shadow-md transition-all rounded-2xl">
            <div class="text-[#F58220] font-extrabold text-xl mb-1.5">🏞</div>
            <div class="text-sm font-bold text-[#0A1329]">Outstation</div>
            <div class="text-[11px] text-[#3B4758] mt-1">Same-day & highway trips</div>
          </div>
          <div class="glass-panel p-5 border-[#FCE8D8] bg-white/80 hover:bg-white hover:border-[#F58220]/40 shadow-sm hover:shadow-md transition-all rounded-2xl">
            <div class="text-[#F58220] font-extrabold text-xl mb-1.5">🏠</div>
            <div class="text-sm font-bold text-[#0A1329]">Home Ride</div>
            <div class="text-[11px] text-[#3B4758] mt-1">Safe late-night home drop preferences</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Driver Registration Section -->
    <section id="driver-registration" class="py-16 md:py-24 bg-[#FFF9F5]">
      <div class="max-w-4xl mx-auto px-4 text-center">
        <div class="glass-panel p-10 max-w-4xl mx-auto border-[#0556F3]/15 bg-white/90 shadow-xl rounded-3xl space-y-5 text-center">
          <h2 class="text-2xl md:text-3xl font-extrabold text-[#0A1329]">Driver Registration Process</h2>
          <p class="text-xs md:text-sm text-[#3B4758] max-w-xl mx-auto font-medium leading-relaxed">
            Drivers register through the <strong>JeeDrive Mobile App</strong>. All driver profiles and identity documents are reviewed by Admins in the Supabase schema database before activation.
          </p>
          <div class="flex items-center justify-center gap-3 pt-3">
            <a href="tel:${SUPPORT_PHONE_NUMBER}" class="support-call-btn" aria-label="Call Driver Helpdesk" title="Call Driver Helpdesk">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </a>
            <span class="text-xs md:text-sm text-[#0A1329] font-semibold">Tap phone icon to call Driver Helpdesk</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-[#1E293B] bg-[#0A1329] py-10 text-xs text-slate-400">
      <div class="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div class="flex items-center gap-3">
          <img src="./assets/logo.png" alt="JEE DRIVE" class="h-9 w-auto object-contain bg-white p-1 rounded-md">
          <span>© 2026 JEE DRIVE Bengaluru. All rights reserved.</span>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-slate-300 font-semibold tracking-wide">Your Drive Our Priority</span>
          <a href="tel:${SUPPORT_PHONE_NUMBER}" class="support-call-btn" aria-label="Call Support" title="Call Support">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
          </a>
        </div>
      </div>
    </footer>
  `;
}


// Secret Admin Login Form (Authenticates live against Supabase admin_users)
function renderAdminLogin() {
  return `
    <div class="min-h-[80vh] flex items-center justify-center p-4">
      <div class="glass-panel max-w-md w-full p-8 border-[#0556F3]/30 bg-[#0A1329]/95 space-y-6 shadow-2xl rounded-2xl">
        <div class="text-center space-y-2">
          <img src="./assets/logo.png" alt="JEE DRIVE Logo" class="h-12 w-auto mx-auto mb-2 object-contain bg-white p-1.5 rounded-xl border border-slate-700">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F58220]/15 border border-[#F58220]/40 text-[#F58220] text-[11px] font-bold">
            <span>🔒</span> Secret Admin Access
          </div>
          <h2 class="text-xl font-bold text-white tracking-tight">JEE DRIVE Admin Portal</h2>
          <p class="text-slate-400 text-xs">Authenticates live against Supabase database</p>
        </div>

        ${state.loginError ? `
          <div class="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <div>${state.loginError}</div>
          </div>
        ` : ''}

        <form onsubmit="window.handleAdminLogin(event);" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Username / Admin Email</label>
            <input type="text" id="adminUsername" placeholder="e.g. NeemBaba" required
              class="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#0556F3] font-medium transition-colors">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Password</label>
            <input type="password" id="adminPassword" placeholder="••••••••" required
              class="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#0556F3] font-medium transition-colors">
          </div>
          <button type="submit" class="btn-orange w-full text-xs py-3 mt-2 shadow-lg shadow-orange-500/20" ${state.isLoggingIn ? 'disabled' : ''}>
            ${state.isLoggingIn ? 'Verifying with Supabase...' : 'Verify & Unlock Admin Panel'}
          </button>
        </form>

        <div class="text-center text-[11px] text-slate-500 pt-2 border-t border-slate-800/80">
          Supabase Table: <span class="font-mono text-[#0556F3] font-semibold">public.admin_users</span>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// DASHBOARD VIEW (Metric Stat Cards, Quick Links & Recent Activity)
// -------------------------------------------------------------

function renderDashboard() {
  const counts = state.tablesCounts;

  const ownersCount = counts['owners'] || 0;
  const bookingsCount = counts['bookings'] || 0;
  const driversCount = counts['driver_profiles'] || 0;
  const ticketsCount = counts['driver_support_tickets'] || 0;
  const auditCount = counts['admin_audit_logs'] || 0;
  const docsCount = counts['driver_documents'] || 0;

  const recentBookings = (state.tablesData['bookings'] || []).slice(0, 5);
  const recentAudit = (state.tablesData['admin_audit_logs'] || []).slice(0, 5);

  return `
    <div class="space-y-6">
      
      <!-- Dashboard Top Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 class="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>📊</span> Executive Admin Dashboard
          </h2>
          <p class="text-slate-400 text-xs mt-1">
            Real-time overview of JeeDrive platform stats across all 9 database tables
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button onclick="window.refreshAllDashboardData();" class="btn-primary text-xs py-2 px-4 shadow-lg shadow-cyan-500/20">
            🔄 Refresh All Dashboard Data
          </button>
        </div>
      </div>

      <!-- Key Metric Stat Cards Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        
        <div class="glass-panel p-4 border-teal-500/30 relative overflow-hidden">
          <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Owners</div>
          <div class="text-3xl font-black text-white mt-1">${ownersCount}</div>
          <div class="text-[11px] text-teal-400 font-semibold mt-1">👥 Vehicle Owners</div>
        </div>

        <div class="glass-panel p-4 border-cyan-500/30 relative overflow-hidden">
          <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Bookings</div>
          <div class="text-3xl font-black text-cyan-400 mt-1">${bookingsCount}</div>
          <div class="text-[11px] text-cyan-300 font-semibold mt-1">📅 Total Requests</div>
        </div>

        <div class="glass-panel p-4 border-blue-500/30 relative overflow-hidden">
          <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Driver Profiles</div>
          <div class="text-3xl font-black text-blue-400 mt-1">${driversCount}</div>
          <div class="text-[11px] text-blue-300 font-semibold mt-1">🚘 Active Drivers</div>
        </div>

        <div class="glass-panel p-4 border-amber-500/30 relative overflow-hidden">
          <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Support Tickets</div>
          <div class="text-3xl font-black text-amber-400 mt-1">${ticketsCount}</div>
          <div class="text-[11px] text-amber-300 font-semibold mt-1">🎫 Driver Tickets</div>
        </div>

        <div class="glass-panel p-4 border-emerald-500/30 relative overflow-hidden">
          <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Driver Docs</div>
          <div class="text-3xl font-black text-emerald-400 mt-1">${docsCount}</div>
          <div class="text-[11px] text-emerald-300 font-semibold mt-1">📁 Uploaded Docs</div>
        </div>

        <div class="glass-panel p-4 border-purple-500/30 relative overflow-hidden">
          <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Audit Log Items</div>
          <div class="text-3xl font-black text-purple-400 mt-1">${auditCount}</div>
          <div class="text-[11px] text-purple-300 font-semibold mt-1">📜 Activity Log</div>
        </div>

      </div>

      <!-- Quick Navigation Grid (All 9 Non-Pricing Tables) -->
      <div class="space-y-3">
        <h3 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <span>⚡</span> All Database Tables Quick Access
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          ${TABLES_REGISTRY.map(table => {
    const icon = TABLE_ICONS[table.id] || "📄";
    const count = counts[table.id] || 0;
    return `
              <button onclick="window.switchAdminTable('${table.id}');"
                class="glass-panel p-4 text-left hover:border-cyan-400/50 transition-all group flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="text-2xl group-hover:scale-110 transition-transform">${icon}</span>
                  <div>
                    <div class="font-bold text-white text-xs group-hover:text-cyan-300 transition-colors">${table.name}</div>
                    <div class="text-[10px] font-mono text-slate-500">public.${table.dbTable}</div>
                  </div>
                </div>
                <div class="text-right">
                  <span class="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                    ${count} records
                  </span>
                </div>
              </button>
            `;
  }).join('')}
        </div>
      </div>

      <!-- Two-Column Section: Recent Bookings & Recent Audit Activity -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <!-- Recent Bookings Summary -->
        <div class="lg:col-span-7 glass-panel p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 class="font-bold text-white text-sm flex items-center gap-2">
              <span>📅</span> Recent Bookings Overview
            </h3>
            <button onclick="window.switchAdminTable('bookings');" class="text-xs text-cyan-400 hover:underline font-semibold">
              View All Bookings →
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-300">
              <thead class="bg-slate-900/80 uppercase text-[10px] text-slate-400">
                <tr>
                  <th class="py-2.5 px-3">Booking ID</th>
                  <th class="py-2.5 px-3">Trip Type</th>
                  <th class="py-2.5 px-3">Status</th>
                  <th class="py-2.5 px-3">Estimated Fare</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60">
                ${recentBookings.length === 0 ? `
                  <tr><td colspan="4" class="py-6 text-center text-slate-500">No bookings available</td></tr>
                ` : recentBookings.map(b => `
                  <tr class="hover:bg-slate-800/30">
                    <td class="py-2.5 px-3 font-mono text-[11px] text-cyan-300 font-bold">${String(b.id).substring(0, 8)}...</td>
                    <td class="py-2.5 px-3">${b.trip_type || 'STANDARD'}</td>
                    <td class="py-2.5 px-3">${renderCellContent(b.booking_status || b.status, 'text')}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-emerald-400">₹${b.estimated_fare || b.total_fare || '0'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Recent Audit Log Activity Feed -->
        <div class="lg:col-span-5 glass-panel p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 class="font-bold text-white text-sm flex items-center gap-2">
              <span>📜</span> Recent Admin Audit Logs
            </h3>
            <button onclick="window.switchAdminTable('admin_audit_logs');" class="text-xs text-cyan-400 hover:underline font-semibold">
              View Full Logs →
            </button>
          </div>

          <div class="space-y-2.5">
            ${recentAudit.length === 0 ? `
              <div class="text-center py-6 text-slate-500 text-xs">No recent admin audit logs</div>
            ` : recentAudit.map(log => `
              <div class="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs flex items-center justify-between">
                <div>
                  <div class="font-bold text-slate-200 text-[11px]">${log.action || 'ADMIN_ACTION'}</div>
                  <div class="text-[10px] text-slate-400">${log.admin_id || log.admin_email || 'admin@drivemate.in'}</div>
                </div>
                <div class="text-right">
                  <span class="text-[10px] font-mono text-cyan-400">${new Date(log.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>

    </div>
  `;
}

// -------------------------------------------------------------
// SECURE ADMIN PANEL (Dashboard & Table Canvas)
// -------------------------------------------------------------

function renderAdminPanel() {
  // If active view is Dashboard, render Dashboard
  if (state.activeTableId === 'dashboard') {
    return `
      <div class="admin-dark-theme min-h-[calc(100vh-60px)] flex flex-col md:flex-row bg-[#070B14]">
        ${renderAdminSidebar()}
        <section class="flex-1 p-4 lg:p-7 overflow-x-hidden flex flex-col bg-[#070B14]">
          ${renderDashboard()}
        </section>
      </div>
    `;
  }

  const currentTable = TABLES_REGISTRY.find(t => t.id === state.activeTableId) || TABLES_REGISTRY[0];
  const allRecords = state.tablesData[state.activeTableId] || [];

  // Get Dynamic Filter Options for Current Table
  const filterOptions = getFilterOptionsForTable(currentTable, allRecords);

  // Filter records by search query AND selected dropdown filter
  const query = state.searchQuery.trim().toLowerCase();
  const activeFilter = state.tableFilter;

  const filteredRecords = allRecords.filter(rec => {
    // 1. Search Query filter
    const matchesSearch = !query || Object.values(rec).some(val => {
      if (val === null || val === undefined) return false;
      return String(val).toLowerCase().includes(query);
    });

    // 2. Dropdown Filter
    let matchesFilter = true;
    if (activeFilter && activeFilter !== 'ALL') {
      matchesFilter = Object.values(rec).some(val => {
        if (val === null || val === undefined) return false;
        return String(val).toUpperCase() === activeFilter.toUpperCase();
      });
    }

    return matchesSearch && matchesFilter;
  });

  // Pagination calculations
  const totalRecords = filteredRecords.length;
  const totalPages = Math.ceil(totalRecords / state.pageSize) || 1;
  const startIndex = (state.currentPage - 1) * state.pageSize;
  const pageRecords = filteredRecords.slice(startIndex, startIndex + state.pageSize);

  // Visible columns for the preview table (clean 6 columns)
  const previewColumns = currentTable.columns.filter(c => c.name !== 'password_hash' && !c.isPrivate).slice(0, 6);

  return `
    <div class="admin-dark-theme min-h-[calc(100vh-60px)] flex flex-col md:flex-row bg-[#070B14]">
      
      <!-- LEFT SIDEBAR -->
      ${renderAdminSidebar()}

      <!-- MAIN TABLE CANVAS -->
      <section class="flex-1 p-4 lg:p-7 overflow-x-hidden flex flex-col bg-[#070B14]">
        
        <!-- Table Header & Controls Bar -->
        <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-800/80">
          <div>
            <div class="flex items-center gap-2.5 flex-wrap">
              <span class="text-2xl">${TABLE_ICONS[currentTable.id] || "📄"}</span>
              <h2 class="text-xl lg:text-2xl font-black text-white tracking-tight">${currentTable.name}</h2>
              <span class="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-md border border-cyan-500/30">
                public.${currentTable.dbTable}
              </span>
              <span class="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                PK: ${currentTable.primaryKey}
              </span>
            </div>
            <p class="text-slate-400 text-xs mt-1">
              ${totalRecords} records matching criteria • Schema-verified table
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            
            <!-- Table Specific Dynamic Filter Dropdown -->
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-slate-400 font-semibold hidden sm:inline">Filter:</span>
              <select id="adminTableFilterSelect" onchange="window.handleFilterChange(this.value);"
                class="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-400 font-medium">
                ${filterOptions.map(opt => `
                  <option value="${opt.value}" ${state.tableFilter === opt.value ? 'selected' : ''}>
                    ${opt.label}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- Search Bar (with static ID to preserve focus) -->
            <div class="relative flex-1 sm:w-64">
              <input type="text" id="adminSearchInput" placeholder="Search ${currentTable.name.toLowerCase()}..."
                value="${state.searchQuery}"
                oninput="window.handleSearchInput(this.value);"
                class="w-full pl-8 pr-7 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-400">
              <svg class="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              ${state.searchQuery ? `
                <button onclick="window.handleSearchInput('');" class="absolute right-2.5 top-2.5 text-slate-400 hover:text-white text-xs font-bold">✕</button>
              ` : ''}
            </div>

            <!-- Refresh Button -->
            <button onclick="window.refreshActiveTable();" class="btn-secondary text-xs py-2 px-3.5" title="Refresh Live Data">
              🔄 Refresh
            </button>

            <!-- Add Record Button -->
            ${currentTable.canAdd ? `
              <button onclick="window.openAddModal();" class="btn-primary text-xs py-2 px-4 shadow-lg shadow-cyan-500/20">
                + Add Record
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Table Error Notification Banner -->
        ${state.tableError ? `
          <div class="p-3.5 mb-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-base">⚠️</span>
              <div><strong>Database Error:</strong> ${state.tableError}</div>
            </div>
            <button onclick="window.refreshActiveTable();" class="underline font-bold text-xs ml-4">Retry Query</button>
          </div>
        ` : ''}

        <!-- Records Table Grid -->
        <div class="glass-panel overflow-hidden border-slate-800 flex-1 flex flex-col">
          
          <div class="overflow-x-auto flex-1">
            <table class="w-full text-left text-xs text-slate-300">
              <thead class="bg-slate-900 uppercase text-[10px] tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  ${previewColumns.map(col => `
                    <th class="py-3 px-4 font-bold whitespace-nowrap">${col.label}</th>
                  `).join('')}
                  <th class="py-3 px-4 text-right font-bold whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/70">
                ${state.isLoadingTable ? `
                  <tr>
                    <td colspan="${previewColumns.length + 1}" class="py-14 text-center text-slate-400">
                      <div class="inline-block w-7 h-7 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-2"></div>
                      <div class="text-xs font-semibold">Loading data from public.${currentTable.dbTable}...</div>
                    </td>
                  </tr>
                ` : pageRecords.length === 0 ? `
                  <tr>
                    <td colspan="${previewColumns.length + 1}" class="py-14 text-center text-slate-500">
                      <div class="text-2xl mb-1">📭</div>
                      <div>No matching records found in public.${currentTable.dbTable}</div>
                    </td>
                  </tr>
                ` : pageRecords.map(record => `
                  <tr class="hover:bg-slate-800/40 transition-colors">
                    ${previewColumns.map(col => {
    const val = record[col.name];
    return `
                        <td class="py-3 px-4 whitespace-nowrap max-w-xs truncate">
                          ${renderCellContent(val, col.type)}
                        </td>
                      `;
  }).join('')}
                    <td class="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                      <button onclick="window.openViewModal('${escapeAttr(record[currentTable.primaryKey])}');"
                        class="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 text-[11px] font-medium transition-colors">
                        👁 View
                      </button>

                      ${currentTable.canEdit ? `
                        <button onclick="window.openEditModal('${escapeAttr(record[currentTable.primaryKey])}');"
                          class="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 text-[11px] font-bold transition-colors">
                          ✏ Edit
                        </button>
                      ` : ''}

                      ${currentTable.canDelete ? `
                        <button onclick="window.openDeleteModal('${escapeAttr(record[currentTable.primaryKey])}');"
                          class="px-2.5 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40 text-[11px] font-medium transition-colors">
                          🗑 Delete
                        </button>
                      ` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Pagination Bar -->
          <div class="p-3.5 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing <span class="font-bold text-white">${totalRecords > 0 ? startIndex + 1 : 0}</span> to 
              <span class="font-bold text-white">${Math.min(startIndex + state.pageSize, totalRecords)}</span> of 
              <span class="font-bold text-white">${totalRecords}</span> entries
            </div>

            <div class="flex items-center gap-1.5">
              <button onclick="window.changePage(${state.currentPage - 1});"
                ${state.currentPage <= 1 ? 'disabled' : ''}
                class="px-3 py-1 rounded-lg bg-slate-800 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 font-medium">
                Previous
              </button>
              <span class="px-2.5 py-1 text-slate-300 font-mono font-bold">${state.currentPage} / ${totalPages}</span>
              <button onclick="window.changePage(${state.currentPage + 1});"
                ${state.currentPage >= totalPages ? 'disabled' : ''}
                class="px-3 py-1 rounded-lg bg-slate-800 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 font-medium">
                Next
              </button>
            </div>
          </div>

        </div>

      </section>

    </div>
  `;
}

// Render Admin Sidebar with Dashboard + 9 Non-Pricing Tables
function renderAdminSidebar() {
  const isDashboardActive = state.activeTableId === 'dashboard';

  return `
    <aside class="w-full md:w-64 bg-[#090E1B] border-r border-slate-800 shrink-0 flex flex-col">
      <div class="p-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <img src="./assets/logo.png" alt="JEE DRIVE" class="h-7 w-auto object-contain mb-1">
          <div class="text-[10px] text-slate-400">Dashboard & 9 Schema Tables</div>
        </div>
        <button onclick="window.refreshActiveTable();" class="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-cyan-400 hover:border-cyan-400/40 transition-colors" title="Refresh Table">
          🔄
        </button>
      </div>

      <nav class="p-2 space-y-1 overflow-y-auto max-h-[calc(100vh-145px)]">
        
        <!-- Dashboard Button -->
        <button onclick="window.switchAdminTable('dashboard');"
          class="w-full px-3 py-2.5 rounded-lg text-left text-xs flex items-center justify-between transition-all ${isDashboardActive ? 'sidebar-item-active' : 'text-slate-300 hover:bg-slate-900/80 hover:text-white'}">
          <div class="flex items-center gap-2.5 truncate">
            <span class="text-[14px]">📊</span>
            <span class="font-bold tracking-tight">Executive Dashboard</span>
          </div>
        </button>

        <div class="pt-2 pb-1 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Database Tables
        </div>

        ${TABLES_REGISTRY.map((table, index) => {
    const isActive = table.id === state.activeTableId;
    const count = state.tablesCounts[table.id];
    const icon = TABLE_ICONS[table.id] || "📄";
    const num = (index + 1).toString().padStart(2, '0');
    return `
            <button onclick="window.switchAdminTable('${table.id}');"
              class="w-full px-3 py-2.5 rounded-lg text-left text-xs flex items-center justify-between transition-all ${isActive ? 'sidebar-item-active' : 'text-slate-300 hover:bg-slate-900/80 hover:text-white'}">
              <div class="flex items-center gap-2.5 truncate">
                <span class="text-[13px]">${icon}</span>
                <div class="truncate">
                  <span class="text-slate-500 font-mono text-[10px] mr-1">${num}.</span>
                  <span class="font-semibold text-slate-200 tracking-tight">${table.name}</span>
                </div>
              </div>
              ${count !== undefined ? `
                <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}">
                  ${count}
                </span>
              ` : ''}
            </button>
          `;
  }).join('')}
      </nav>

      <div class="p-3 mt-auto border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between bg-slate-950/60">
        <span class="truncate">Admin: <strong class="text-slate-200">${state.adminAuth.userEmail}</strong></span>
        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
      </div>
    </aside>
  `;
}

// Generate Dynamic Filter Options for Selected Table
function getFilterOptionsForTable(tableConfig, records) {
  const options = [{ value: 'ALL', label: 'All Records (Show All)' }];
  if (!tableConfig || !records) return options;

  const foundValues = new Set();

  records.forEach(r => {
    Object.keys(r).forEach(key => {
      if (['status', 'booking_status', 'role', 'type', 'ticket_type', 'priority', 'document_type', 'is_verified', 'is_active', 'is_approved'].includes(key)) {
        const val = r[key];
        if (val !== null && val !== undefined && val !== '') {
          foundValues.add(String(val).toUpperCase());
        }
      }
    });
  });

  // Default values per table if dataset is fresh
  if (foundValues.size === 0) {
    if (tableConfig.id === 'owners') ['ACTIVE', 'BLOCKED', 'SUSPENDED'].forEach(v => foundValues.add(v));
    if (tableConfig.id === 'bookings') ['PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED'].forEach(v => foundValues.add(v));
    if (tableConfig.id === 'driver_support_tickets') ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].forEach(v => foundValues.add(v));
    if (tableConfig.id === 'driver_documents') ['PENDING', 'VERIFIED', 'REJECTED'].forEach(v => foundValues.add(v));
  }

  Array.from(foundValues).sort().forEach(val => {
    options.push({ value: val, label: `Filter by: ${val}` });
  });

  return options;
}

// Format Cell Content with Clarity
function renderCellContent(val, type) {
  if (val === null || val === undefined) return '<span class="text-slate-600 italic font-mono text-[11px]">null</span>';

  if (type === 'boolean') {
    return `<span class="badge ${val ? 'badge-true' : 'badge-false'}">${val ? 'TRUE' : 'FALSE'}</span>`;
  }

  const strVal = String(val).toUpperCase();
  if (['ACTIVE', 'APPROVED', 'COMPLETED', 'VERIFIED', 'RESOLVED'].includes(strVal)) {
    return `<span class="badge badge-active">${val}</span>`;
  }
  if (['PENDING', 'OPEN', 'IN_PROGRESS'].includes(strVal)) {
    return `<span class="badge badge-pending">${val}</span>`;
  }
  if (['BLOCKED', 'SUSPENDED', 'REJECTED', 'CANCELLED', 'CLOSED'].includes(strVal)) {
    return `<span class="badge badge-rejected">${val}</span>`;
  }

  if (type === 'datetime') {
    const d = new Date(val);
    return `<span class="font-mono text-[11px] text-slate-300">${d.toLocaleDateString()} <span class="text-slate-500">${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>`;
  }

  if (type === 'uuid') {
    return `<span class="font-mono text-[11px] text-cyan-300" title="${val}">${String(val).substring(0, 8)}...</span>`;
  }

  if (type === 'json') {
    return `<span class="font-mono text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{...}</span>`;
  }

  return `<span class="text-slate-200 font-medium">${String(val)}</span>`;
}

// -------------------------------------------------------------
// MODALS: VIEW DETAILS, ADD RECORD, EDIT RECORD, DELETE CONFIRM
// -------------------------------------------------------------

function renderViewModal() {
  const record = state.viewModalRecord;
  if (!record) return '';
  const currentTable = TABLES_REGISTRY.find(t => t.id === state.activeTableId);

  return `
    <div class="modal-overlay" onclick="if(event.target === this) window.closeModals();">
      <div class="modal-content p-6 space-y-5">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">${TABLE_ICONS[currentTable.id] || "📄"}</span>
            <div>
              <h3 class="text-lg font-bold text-white">${currentTable.name} Details</h3>
              <p class="text-xs text-slate-400">Schema Table: <span class="font-mono text-cyan-400">public.${currentTable.dbTable}</span></p>
            </div>
          </div>
          <button onclick="window.closeModals();" class="text-slate-400 hover:text-white text-xl font-bold">&times;</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
          ${currentTable.columns.map(col => {
    if (col.name === 'password_hash') {
      return `
                <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div class="text-slate-400 font-semibold mb-1">${col.label}</div>
                  <div class="text-slate-500 italic font-mono text-[11px]">Protected (Hidden for Security)</div>
                </div>
              `;
    }
    if (col.isPrivate) {
      return `
                <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                  <div class="text-slate-400 font-semibold">${col.label}</div>
                  <div class="font-mono text-emerald-400 font-semibold">${record[col.name]}</div>
                  <div class="text-[10px] text-slate-500 italic">Private Storage Path (No Public URL Generated)</div>
                </div>
              `;
    }
    const val = record[col.name];
    return `
              <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                <div class="text-slate-400 font-semibold flex items-center justify-between">
                  <span>${col.label}</span>
                  <span class="font-mono text-[10px] text-slate-500">${col.name}</span>
                </div>
                <div class="font-medium text-white break-words">
                  ${col.type === 'json' ? `<pre class="bg-slate-950 p-2.5 rounded-lg text-[10px] font-mono text-cyan-300 overflow-x-auto border border-slate-800">${JSON.stringify(val, null, 2)}</pre>` : renderCellContent(val, col.type)}
                </div>
              </div>
            `;
  }).join('')}
        </div>

        <div class="flex justify-end pt-2 border-t border-slate-800">
          <button onclick="window.closeModals();" class="btn-secondary text-xs py-2 px-6">Close</button>
        </div>
      </div>
    </div>
  `;
}

function renderAddModal() {
  if (!state.addModalOpen) return '';
  const currentTable = TABLES_REGISTRY.find(t => t.id === state.activeTableId);

  return `
    <div class="modal-overlay" onclick="if(event.target === this) window.closeModals();">
      <div class="modal-content p-6 space-y-5">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">${TABLE_ICONS[currentTable.id] || "📄"}</span>
            <div>
              <h3 class="text-lg font-bold text-white">Add ${currentTable.name} Record</h3>
              <p class="text-xs text-slate-400">Insert into <span class="font-mono text-cyan-400">public.${currentTable.dbTable}</span></p>
            </div>
          </div>
          <button onclick="window.closeModals();" class="text-slate-400 hover:text-white text-xl font-bold">&times;</button>
        </div>

        ${state.modalFormError ? `
          <div class="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <div>${state.modalFormError}</div>
          </div>
        ` : ''}

        <form onsubmit="window.submitAddRecord(event);" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            ${currentTable.columns.map(col => {
    if (col.readOnly && col.name === 'id') return '';
    if (col.readOnly && (col.name === 'created_at' || col.name === 'updated_at')) return '';
    if (col.name === 'password_hash') return '';

    return renderFormField(col, null);
  }).join('')}
          </div>

          <div class="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button type="button" onclick="window.closeModals();" class="btn-secondary text-xs py-2 px-4">Cancel</button>
            <button type="submit" class="btn-primary text-xs py-2 px-5" ${state.isSaving ? 'disabled' : ''}>
              ${state.isSaving ? 'Saving to Database...' : 'Save Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderEditModal() {
  const record = state.editModalRecord;
  if (!record) return '';
  const currentTable = TABLES_REGISTRY.find(t => t.id === state.activeTableId);

  return `
    <div class="modal-overlay" onclick="if(event.target === this) window.closeModals();">
      <div class="modal-content p-6 space-y-5">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">${TABLE_ICONS[currentTable.id] || "📄"}</span>
            <div>
              <h3 class="text-lg font-bold text-white">Edit ${currentTable.name} Record</h3>
              <p class="text-xs text-slate-400">
                Updating <span class="font-mono text-slate-300">${currentTable.primaryKey}</span>: <span class="font-mono text-cyan-400 font-bold">${record[currentTable.primaryKey]}</span>
              </p>
            </div>
          </div>
          <button onclick="window.closeModals();" class="text-slate-400 hover:text-white text-xl font-bold">&times;</button>
        </div>

        ${state.modalFormError ? `
          <div class="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <div>${state.modalFormError}</div>
          </div>
        ` : ''}

        <form onsubmit="window.submitEditRecord(event);" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            ${currentTable.columns.map(col => {
    if (col.name === 'password_hash') return '';
    const val = record[col.name];
    const isPKey = col.name === currentTable.primaryKey;
    return renderFormField(col, val, isPKey);
  }).join('')}
          </div>

          <div class="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button type="button" onclick="window.closeModals();" class="btn-secondary text-xs py-2 px-4">Cancel</button>
            <button type="submit" class="btn-primary text-xs py-2 px-5" ${state.isSaving ? 'disabled' : ''}>
              ${state.isSaving ? 'Updating Database...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderDeleteModal() {
  const record = state.deleteModalRecord;
  if (!record) return '';
  const currentTable = TABLES_REGISTRY.find(t => t.id === state.activeTableId);
  const pKeyVal = record[currentTable.primaryKey];

  return `
    <div class="modal-overlay" onclick="if(event.target === this) window.closeModals();">
      <div class="modal-content max-w-md p-6 space-y-4">
        <h3 class="text-lg font-bold text-white flex items-center gap-2">
          <span>🗑️</span> Delete Record
        </h3>
        <p class="text-xs text-slate-300">
          Are you sure you want to delete this row from <strong>public.${currentTable.dbTable}</strong>?
        </p>
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-red-400 break-all">
          ${currentTable.primaryKey}: ${pKeyVal}
        </div>
        <p class="text-[11px] text-slate-500">
          This operation will immediately delete the row in the live Supabase database.
        </p>
        <div class="flex justify-end gap-3 pt-2">
          <button onclick="window.closeModals();" class="btn-secondary text-xs py-2 px-4">Cancel</button>
          <button onclick="window.submitDeleteRecord();" class="btn-danger text-xs py-2 px-5" ${state.isSaving ? 'disabled' : ''}>
            ${state.isSaving ? 'Deleting...' : 'Confirm Delete'}
          </button>
        </div>
      </div>
    </div>
  `;
}

// Form Field Renderer with High Clarity
function renderFormField(col, existingValue, isLocked = false) {
  const isReadOnly = isLocked || col.readOnly;
  const isRequired = col.isRequired && !isReadOnly;

  if (col.type === 'boolean') {
    const isChecked = existingValue !== null ? Boolean(existingValue) : Boolean(col.default);
    return `
      <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div>
          <label class="font-semibold text-slate-200">${col.label}</label>
          <div class="text-[10px] text-slate-500 font-mono">${col.name}</div>
        </div>
        <label class="switch-container">
          <input type="checkbox" name="${col.name}" class="switch-input" ${isChecked ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''}>
          <div class="switch-track"><div class="switch-thumb"></div></div>
        </label>
      </div>
    `;
  }

  if (col.type === 'select') {
    const currentVal = existingValue !== null ? String(existingValue) : (col.default || '');
    return `
      <div class="space-y-1">
        <label class="font-semibold text-slate-200 flex items-center gap-1">
          ${col.label} ${isRequired ? '<span class="text-red-400 font-bold">*</span>' : ''}
          <span class="text-[10px] text-slate-500 font-mono">(${col.name})</span>
        </label>
        <select name="${col.name}" ${isRequired ? 'required' : ''} ${isReadOnly ? 'disabled' : ''}
          class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none">
          ${col.options.map(opt => `
            <option value="${opt}" ${opt === currentVal ? 'selected' : ''}>${opt}</option>
          `).join('')}
        </select>
      </div>
    `;
  }

  if (col.type === 'textarea') {
    return `
      <div class="space-y-1 col-span-1 md:col-span-2">
        <label class="font-semibold text-slate-200 flex items-center gap-1">
          ${col.label} ${isRequired ? '<span class="text-red-400 font-bold">*</span>' : ''}
        </label>
        <textarea name="${col.name}" rows="3" ${isRequired ? 'required' : ''} ${isReadOnly ? 'readonly' : ''}
          class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none">${existingValue || ''}</textarea>
      </div>
    `;
  }

  if (col.type === 'json') {
    const jsonStr = existingValue ? JSON.stringify(existingValue, null, 2) : '{}';
    return `
      <div class="space-y-1 col-span-1 md:col-span-2">
        <label class="font-semibold text-slate-200 flex items-center gap-1">
          ${col.label} (JSON)
        </label>
        <textarea name="${col.name}" rows="3" ${isReadOnly ? 'readonly' : ''}
          class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300 font-mono text-xs focus:outline-none">${jsonStr}</textarea>
      </div>
    `;
  }

  const inputType = col.type === 'number' ? 'number' :
    col.type === 'date' ? 'date' :
      col.type === 'time' ? 'time' :
        col.type === 'tel' ? 'tel' :
          col.type === 'email' ? 'email' : 'text';

  const valStr = existingValue !== null && existingValue !== undefined ? String(existingValue) : (col.default !== undefined ? String(col.default) : '');

  return `
    <div class="space-y-1">
      <label class="font-semibold text-slate-200 flex items-center gap-1">
        ${col.label} ${isRequired ? '<span class="text-red-400 font-bold">*</span>' : ''}
        <span class="text-[10px] text-slate-500 font-mono">(${col.name})</span>
      </label>
      <input type="${inputType}" name="${col.name}" value="${escapeAttr(valStr)}"
        ${col.step ? `step="${col.step}"` : ''}
        ${isRequired ? 'required' : ''}
        ${isReadOnly ? 'readonly class="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-500 text-xs cursor-not-allowed font-mono"' : 'class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none font-medium"'}>
    </div>
  `;
}

function escapeAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/"/g, '&quot;');
}

// Toast Component
function renderNotification() {
  if (!state.notification) return '';
  const { message, type } = state.notification;
  return `
    <div class="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl bg-slate-900 border ${type === 'danger' ? 'border-red-500' : 'border-cyan-500/40'} text-white text-xs font-semibold shadow-2xl flex items-center gap-3 animate-bounce">
      <span class="w-2.5 h-2.5 rounded-full ${type === 'danger' ? 'bg-red-400' : 'bg-cyan-400'}"></span>
      ${message}
    </div>
  `;
}

// Root Application Renderer (With Input Focus Preservation)
function renderApp() {
  const app = document.getElementById('app');
  if (!app) return;

  // Preserve active input focus & cursor selection position before innerHTML update
  const activeEl = document.activeElement;
  const activeId = activeEl ? activeEl.id : null;
  const selectionStart = activeEl && typeof activeEl.selectionStart === 'number' ? activeEl.selectionStart : null;
  const selectionEnd = activeEl && typeof activeEl.selectionEnd === 'number' ? activeEl.selectionEnd : null;

  let mainContent = '';
  if (state.currentView === 'website') {
    mainContent = renderPublicWebsite();
  } else if (state.currentView === 'admin_login') {
    mainContent = renderAdminLogin();
  } else if (state.currentView === 'admin_panel') {
    mainContent = renderAdminPanel();
  }

  app.innerHTML = `
    ${renderHeader()}
    <main>
      ${mainContent}
    </main>
    ${renderViewModal()}
    ${renderAddModal()}
    ${renderEditModal()}
    ${renderDeleteModal()}
    ${renderNotification()}
  `;

  // Restore focus & cursor position if active element existed
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el && typeof el.focus === 'function') {
      el.focus();
      if (selectionStart !== null && selectionEnd !== null && typeof el.setSelectionRange === 'function') {
        try {
          el.setSelectionRange(selectionStart, selectionEnd);
        } catch (e) {
          // ignore non-text inputs
        }
      }
    }
  }
}

// -------------------------------------------------------------
// Global Window Event Handlers
// -------------------------------------------------------------

// Secret 5-Click Logo Handler
window.handleLogoClick = function () {
  state.logoClickCount = (state.logoClickCount || 0) + 1;

  if (state.logoClickTimer) {
    clearTimeout(state.logoClickTimer);
  }

  if (state.logoClickCount >= 5) {
    state.logoClickCount = 0;
    state.logoClickTimer = null;
    if (state.adminAuth.isAuthenticated) {
      window.navigateTo('admin_panel');
    } else {
      window.navigateTo('admin_login');
    }
    showToast('🔒 Secret Admin Access Triggered! Please enter Admin credentials.', 'info');
    return;
  }

  state.logoClickTimer = setTimeout(() => {
    state.logoClickCount = 0;
    state.logoClickTimer = null;
  }, 3000);
};

window.navigateTo = function (view) {
  state.currentView = view;
  if (view === 'admin_panel' && !state.adminAuth.isAuthenticated) {
    state.currentView = 'admin_login';
  }
  if (state.currentView === 'admin_panel') {
    loadActiveTableData();
  }
  renderApp();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.handleAdminLogin = async function (e) {
  e.preventDefault();
  const usernameInput = document.getElementById('adminUsername');
  const passwordInput = document.getElementById('adminPassword');

  const username = usernameInput ? usernameInput.value : '';
  const password = passwordInput ? passwordInput.value : '';

  state.isLoggingIn = true;
  state.loginError = null;
  renderApp();

  const authResult = await authenticateAdminUser(username, password);

  state.isLoggingIn = false;

  if (authResult.success) {
    const adminUser = authResult.user;
    state.adminAuth = {
      isAuthenticated: true,
      userEmail: adminUser.email || adminUser.username,
      username: adminUser.username,
      role: adminUser.role || 'SUPER_ADMIN'
    };
    state.currentView = 'admin_panel';
    state.activeTableId = 'dashboard';
    showToast(`Welcome ${adminUser.full_name || adminUser.username}! Authenticated via Supabase.`, 'success');
    loadAllTablesData(true);
  } else {
    state.loginError = authResult.error;
    showToast(authResult.error, 'danger');
    renderApp();
  }
};

window.logoutAdmin = function () {
  state.adminAuth.isAuthenticated = false;
  state.currentView = 'website';
  showToast('Logged out of Admin Panel.', 'info');
  renderApp();
};

window.switchAdminTable = function (tableId) {
  state.activeTableId = tableId;
  state.searchQuery = '';
  state.tableFilter = 'ALL';
  state.currentPage = 1;
  loadActiveTableData();
};

window.refreshActiveTable = function () {
  loadActiveTableData(true);
  showToast('Data refreshed from Supabase.', 'info');
};

window.refreshAllDashboardData = function () {
  loadAllTablesData(true);
  showToast('All 9 table datasets refreshed!', 'success');
};

window.handleSearchInput = function (query) {
  state.searchQuery = query;
  state.currentPage = 1;
  renderApp();
};

window.handleFilterChange = function (filterVal) {
  state.tableFilter = filterVal;
  state.currentPage = 1;
  renderApp();
};

window.changePage = function (page) {
  state.currentPage = page;
  renderApp();
};

window.openViewModal = function (idVal) {
  const tableConfig = TABLES_REGISTRY.find(t => t.id === state.activeTableId);
  const record = (state.tablesData[state.activeTableId] || []).find(r => String(r[tableConfig.primaryKey]) === String(idVal));
  if (record) {
    state.viewModalRecord = record;
    renderApp();
  }
};

window.openAddModal = function () {
  state.modalFormError = null;
  state.addModalOpen = true;
  renderApp();
};

window.openEditModal = function (idVal) {
  const tableConfig = TABLES_REGISTRY.find(t => t.id === state.activeTableId);
  const record = (state.tablesData[state.activeTableId] || []).find(r => String(r[tableConfig.primaryKey]) === String(idVal));
  if (record) {
    state.modalFormError = null;
    state.editModalRecord = record;
    renderApp();
  }
};

window.openDeleteModal = function (idVal) {
  const tableConfig = TABLES_REGISTRY.find(t => t.id === state.activeTableId);
  const record = (state.tablesData[state.activeTableId] || []).find(r => String(r[tableConfig.primaryKey]) === String(idVal));
  if (record) {
    state.deleteModalRecord = record;
    renderApp();
  }
};

window.closeModals = function () {
  state.viewModalRecord = null;
  state.addModalOpen = false;
  state.editModalRecord = null;
  state.deleteModalRecord = null;
  state.modalFormError = null;
  renderApp();
};

window.submitAddRecord = handleAddRecord;
window.submitEditRecord = handleEditRecord;
window.submitDeleteRecord = confirmDeleteRecord;

// Initial App Boot
document.addEventListener('DOMContentLoaded', () => {
  renderApp();
  loadAllTablesData();
});


