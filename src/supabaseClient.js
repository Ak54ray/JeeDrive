// Supabase Live Schema & CRUD Service for JeeDrive Admin Panel

export const SUPABASE_URL = "https://edvjkqfjqisdewtqelhe.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkdmprcWZqcWlzZGV3dHFlbGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzY0NTAsImV4cCI6MjEwMjExMjQ1MH0.GXmqxA16FHo6SysbRGK2fKFwdNn85yLthWxt-RZHs68";

// STRICT ALLOWLIST: Exactly the 9 authorized non-pricing Supabase schema tables
export const ALLOWED_TABLES = new Set([
  "owners",
  "bookings",
  "driver_profiles",
  "driver_preferences",
  "driver_notifications",
  "driver_support_tickets",
  "admin_audit_logs",
  "driver_documents",
  "owner_notifications"
]);

const headers = {
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation"
};

function assertTableAllowed(table) {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Security Error: Access to table '${table}' is unauthorized and rejected.`);
  }
}

// Live Supabase Authentication for Admin Users against public.admin_users
export async function authenticateAdminUser(usernameOrEmail, password) {
  try {
    const input = (usernameOrEmail || '').trim();
    if (!input || !password) {
      return { success: false, error: 'Username/Email and Password are required.' };
    }

    const isEmail = input.includes('@');
    const filterCol = isEmail ? 'email' : 'username';

    const url = `${SUPABASE_URL}/rest/v1/admin_users?select=*&${filterCol}=eq.${encodeURIComponent(input)}&password_hash=eq.${encodeURIComponent(password)}&is_active=eq.true&limit=1`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Database query failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return { success: true, user: data[0] };
    }

    return { success: false, error: 'Invalid Admin Username/Email or Password in Supabase database.' };
  } catch (err) {
    console.error('Supabase authenticateAdminUser error:', err);
    return { success: false, error: err.message || 'Supabase authentication failed.' };
  }
}

// Generic Fetch Table Records
export async function fetchTableRecords(table, orderBy = 'created_at.desc', limit = 150) {
  assertTableAllowed(table);
  try {
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
    if (orderBy) {
      url += `&order=${orderBy}`;
    }
    if (limit) {
      url += `&limit=${limit}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errText = await res.text();
      // Retry without order if table lacks the order column (e.g. driver_preferences)
      if (errText.includes('does not exist')) {
        const fallbackRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${limit}`, { headers });
        if (fallbackRes.ok) return await fallbackRes.json();
      }
      throw new Error(`Supabase Error (${res.status}): ${errText}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`fetchTableRecords [${table}] error:`, err);
    throw err;
  }
}

// Generic Insert Record
export async function insertTableRecord(table, recordData) {
  assertTableAllowed(table);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(recordData)
    });
    if (!res.ok) {
      const errText = await res.text();
      let parsedMsg = errText;
      try {
        const parsedJson = JSON.parse(errText);
        parsedMsg = parsedJson.message || parsedJson.details || errText;
      } catch {}
      throw new Error(`Insert failed: ${parsedMsg}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  } catch (err) {
    console.error(`insertTableRecord [${table}] error:`, err);
    throw err;
  }
}

// Generic Update Record
export async function updateTableRecord(table, primaryKeyCol, primaryKeyValue, updateData) {
  assertTableAllowed(table);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${primaryKeyCol}=eq.${encodeURIComponent(primaryKeyValue)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updateData)
    });
    if (!res.ok) {
      const errText = await res.text();
      let parsedMsg = errText;
      try {
        const parsedJson = JSON.parse(errText);
        parsedMsg = parsedJson.message || parsedJson.details || errText;
      } catch {}
      throw new Error(`Update failed: ${parsedMsg}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  } catch (err) {
    console.error(`updateTableRecord [${table}] error:`, err);
    throw err;
  }
}

// Generic Delete Record
export async function deleteTableRecord(table, primaryKeyCol, primaryKeyValue) {
  assertTableAllowed(table);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${primaryKeyCol}=eq.${encodeURIComponent(primaryKeyValue)}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      const errText = await res.text();
      let parsedMsg = errText;
      try {
        const parsedJson = JSON.parse(errText);
        parsedMsg = parsedJson.message || parsedJson.details || errText;
      } catch {}
      throw new Error(`Delete failed: ${parsedMsg}`);
    }
    return true;
  } catch (err) {
    console.error(`deleteTableRecord [${table}] error:`, err);
    throw err;
  }
}

// Strict Schema Definitions for ONLY the 14 Allowed Tables
export const TABLES_REGISTRY = [
  {
    id: "owners",
    name: "Owners",
    dbTable: "owners",
    primaryKey: "id",
    orderBy: "created_at.desc",
    canAdd: true,
    canEdit: true,
    canDelete: true,
    columns: [
      { name: "id", label: "Owner ID", type: "uuid", readOnly: true },
      { name: "full_name", label: "Full Name", type: "text", isRequired: true },
      { name: "mobile_number", label: "Mobile Number", type: "tel", isRequired: true },
      { name: "nickname", label: "Nickname", type: "text", isRequired: false },
      { name: "role", label: "Role", type: "select", options: ["OWNER"], isRequired: true, default: "OWNER" },
      { name: "status", label: "Status", type: "select", options: ["ACTIVE", "BLOCKED", "SUSPENDED"], isRequired: true, default: "ACTIVE" },
      { name: "created_at", label: "Created At", type: "datetime", readOnly: true },
      { name: "updated_at", label: "Updated At", type: "datetime", readOnly: true }
    ]
  },
  {
    id: "bookings",
    name: "Bookings",
    dbTable: "bookings",
    primaryKey: "id",
    orderBy: "created_at.desc",
    canAdd: true,
    canEdit: true,
    canDelete: true,
    columns: [
      { name: "id", label: "Booking ID", type: "uuid", readOnly: true },
      { name: "owner_id", label: "Owner ID", type: "uuid", isRequired: false },
      { name: "owner_name", label: "Owner Name", type: "text", isRequired: true },
      { name: "owner_phone", label: "Owner Phone", type: "tel", isRequired: true },
      { name: "trip_type", label: "Trip Type", type: "select", options: ["ONE_WAY", "ROUND_TRIP", "AIRPORT", "OUTSTATION", "HOME_RIDE"], isRequired: true },
      { name: "duration_value", label: "Duration Value", type: "number", step: "0.1" },
      { name: "duration_unit", label: "Duration Unit", type: "select", options: ["HOURS", "DAYS", "MINUTES"] },
      { name: "pickup_location", label: "Pickup Location", type: "text", isRequired: true },
      { name: "pickup_latitude", label: "Pickup Latitude", type: "number", step: "any" },
      { name: "pickup_longitude", label: "Pickup Longitude", type: "number", step: "any" },
      { name: "destination", label: "Destination", type: "text", isRequired: true },
      { name: "destination_latitude", label: "Destination Latitude", type: "number", step: "any" },
      { name: "destination_longitude", label: "Destination Longitude", type: "number", step: "any" },
      { name: "scheduled_date", label: "Scheduled Date", type: "date", isRequired: true },
      { name: "scheduled_time", label: "Scheduled Time", type: "time", isRequired: true },
      { name: "base_fare", label: "Base Fare", type: "number", isRequired: true, step: "0.01" },
      { name: "distance_charge", label: "Distance Charge", type: "number", step: "0.01", default: 0 },
      { name: "time_charge", label: "Time Charge", type: "number", step: "0.01", default: 0 },
      { name: "night_surcharge", label: "Night Surcharge", type: "number", step: "0.01", default: 0 },
      { name: "platform_fee", label: "Platform Fee", type: "number", step: "0.01", default: 0 },
      { name: "discount", label: "Discount", type: "number", step: "0.01", default: 0 },
      { name: "total_fare", label: "Total Fare", type: "number", isRequired: true, step: "0.01" },
      { name: "driver_earnings", label: "Driver Earnings", type: "number", isRequired: true, step: "0.01" },
      { name: "platform_earnings", label: "Platform Earnings", type: "number", step: "0.01", default: 0 },
      { name: "currency", label: "Currency", type: "text", default: "INR" },
      { name: "booking_status", label: "Booking Status", type: "select", options: ["PENDING", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"], isRequired: true, default: "PENDING" },
      { name: "created_at", label: "Created At", type: "datetime", readOnly: true },
      { name: "updated_at", label: "Updated At", type: "datetime", readOnly: true },
      { name: "additional_time_charge", label: "Additional Time Charge", type: "number", step: "0.01", default: 0 },
      { name: "estimated_distance", label: "Estimated Distance", type: "number", step: "any", default: 0 },
      { name: "estimated_travel_time", label: "Estimated Travel Time", type: "text" },
      { name: "vehicle_type", label: "Vehicle Type", type: "select", options: ["NORMAL", "LUXURY", "Hatchback", "Sedan", "SUV"], isRequired: true },
      { name: "pricing_base_fare", label: "Pricing Base Fare", type: "number", step: "0.01" },
      { name: "pricing_15_min_rate", label: "Pricing 15-Min Rate", type: "number", step: "0.01" },
      { name: "pricing_night_surcharge", label: "Pricing Night Surcharge", type: "number", step: "0.01" },
      { name: "driver_id", label: "Driver UUID", type: "uuid" },
      { name: "selected_duration", label: "Selected Duration", type: "text" },
      { name: "pricing_15min_rate", label: "Pricing 15Min Rate (Alt)", type: "number", step: "0.01" },
      { name: "pricing_type", label: "Pricing Type", type: "text" },
      { name: "calendar_days", label: "Calendar Days", type: "number", default: 1 },
      { name: "duty_start_date", label: "Duty Start Date", type: "text" },
      { name: "duty_start_time", label: "Duty Start Time", type: "text" },
      { name: "duty_end_date", label: "Duty End Date", type: "text" },
      { name: "duty_end_time", label: "Duty End Time", type: "text" },
      { name: "duration_minutes", label: "Duration Minutes", type: "number", default: 0 },
      { name: "additional_minutes", label: "Additional Minutes", type: "number", default: 0 },
      { name: "driver_name", label: "Driver Name", type: "text" },
      { name: "driver_phone", label: "Driver Phone", type: "tel" },
      { name: "accepted_at", label: "Accepted At", type: "datetime" },
      { name: "scheduled_time_display", label: "Scheduled Time Display", type: "text" },
      { name: "assigned_driver_id", label: "Assigned Driver ID", type: "text" },
      { name: "status", label: "Status", type: "select", options: ["pending", "accepted", "in_progress", "completed", "cancelled"], isRequired: true, default: "pending" },
      { name: "started_at", label: "Started At", type: "datetime" },
      { name: "completed_at", label: "Completed At", type: "datetime" },
      { name: "original_booked_fare", label: "Original Booked Fare", type: "number", step: "0.01" },
      { name: "extra_duration_minutes", label: "Extra Duration Minutes", type: "number", default: 0 },
      { name: "extra_fare", label: "Extra Fare", type: "number", step: "0.01", default: 0 }
    ]
  },
  {
    id: "driver_profiles",
    name: "Driver Profiles",
    dbTable: "driver_profiles",
    primaryKey: "id",
    orderBy: "created_at.desc",
    canAdd: true,
    canEdit: true,
    canDelete: true,
    columns: [
      { name: "id", label: "Profile UUID", type: "uuid", readOnly: true },
      { name: "driver_id", label: "Driver ID (e.g. DRV10001)", type: "text" },
      { name: "full_name", label: "Full Name", type: "text", isRequired: true },
      { name: "mobile_number", label: "Mobile Number", type: "tel", isRequired: true },
      { name: "email", label: "Email", type: "email" },
      { name: "city", label: "City", type: "text", default: "Bengaluru", isRequired: true },
      { name: "area_locality", label: "Area / Locality", type: "text", isRequired: true },
      { name: "landmark", label: "Landmark", type: "text" },
      { name: "pincode", label: "PIN Code", type: "text", isRequired: true },
      { name: "referral_code", label: "Referral Code", type: "text" },
      { name: "dl_number", label: "DL Number", type: "text", isRequired: true },
      { name: "aadhaar_number", label: "Aadhaar Number", type: "text", isRequired: true },
      { name: "pan_number", label: "PAN Number", type: "text", isRequired: true },
      { name: "transmission_type", label: "Transmission Type", type: "select", options: ["Both Manual & Automatic", "Manual Only", "Automatic Only"], isRequired: true },
      { name: "vehicle_types", label: "Vehicle Types", type: "text", default: "Hatchback, Sedan, SUV" },
      { name: "experience_years", label: "Experience (Years)", type: "number", default: 2 },
      { name: "status", label: "Status", type: "select", options: ["PENDING", "APPROVED", "REJECTED"], isRequired: true, default: "PENDING" },
      { name: "application_status", label: "Application Status", type: "select", options: ["PENDING", "APPROVED", "REJECTED"], isRequired: true, default: "PENDING" },
      { name: "rejection_reason", label: "Rejection Reason", type: "text" },
      { name: "profile_photo_url", label: "Profile Photo URL", type: "text" },
      { name: "auth_user_id", label: "Auth User ID", type: "uuid" },
      { name: "terms_accepted", label: "Terms Accepted", type: "boolean", default: true },
      { name: "terms_accepted_at", label: "Terms Accepted At", type: "datetime" },
      { name: "approved_at", label: "Approved At", type: "datetime" },
      { name: "approved_by", label: "Approved By", type: "text" },
      { name: "created_at", label: "Created At", type: "datetime", readOnly: true },
      { name: "updated_at", label: "Updated At", type: "datetime", readOnly: true }
    ]
  },
  {
    id: "driver_preferences",
    name: "Driver Preferences",
    dbTable: "driver_preferences",
    primaryKey: "driver_id",
    orderBy: "",
    canAdd: true,
    canEdit: true,
    canDelete: true,
    columns: [
      { name: "driver_id", label: "Driver ID (e.g. DRV10001)", type: "text", isRequired: true },
      { name: "auth_user_id", label: "Auth User UUID", type: "uuid" },
      { name: "outstation_duty", label: "Outstation Duty", type: "boolean", default: true },
      { name: "airport_duty", label: "Airport Duty", type: "boolean", default: true },
      { name: "pickup_drop_duty", label: "Pickup / Drop Duty", type: "boolean", default: true },
      { name: "one_way_duty", label: "One Way Duty", type: "boolean", default: true },
      { name: "round_trip_duty", label: "Round Trip Duty", type: "boolean", default: true },
      { name: "home_ride_duty", label: "Home Ride Duty", type: "boolean", default: false },
      { name: "is_online", label: "Is Online", type: "boolean", default: false },
      { name: "updated_at", label: "Updated At", type: "datetime", readOnly: true }
    ]
  },
  {
    id: "driver_notifications",
    name: "Driver Notifications",
    dbTable: "driver_notifications",
    primaryKey: "id",
    orderBy: "created_at.desc",
    canAdd: true,
    canEdit: true,
    canDelete: true,
    columns: [
      { name: "id", label: "Notification ID", type: "uuid", readOnly: true },
      { name: "driver_id", label: "Driver ID", type: "text", isRequired: true },
      { name: "auth_user_id", label: "Auth User ID", type: "uuid" },
      { name: "title", label: "Title", type: "text", isRequired: true },
      { name: "message", label: "Message", type: "textarea", isRequired: true },
      { name: "type", label: "Notification Type", type: "select", options: ["ACCOUNT", "DUTY", "ALERT", "PAYMENT", "SYSTEM"], isRequired: true, default: "ACCOUNT" },
      { name: "is_read", label: "Is Read", type: "boolean", default: false },
      { name: "created_at", label: "Created At", type: "datetime", readOnly: true }
    ]
  },
  {
    id: "driver_support_tickets",
    name: "Driver Support Tickets",
    dbTable: "driver_support_tickets",
    primaryKey: "id",
    orderBy: "created_at.desc",
    canAdd: true,
    canEdit: true,
    canDelete: true,
    columns: [
      { name: "id", label: "Ticket ID", type: "uuid", readOnly: true },
      { name: "driver_id", label: "Driver ID", type: "text", isRequired: true },
      { name: "category", label: "Category", type: "select", options: ["PAYMENT", "APP_ISSUE", "BOOKING", "PROFILE", "OTHER"], isRequired: true },
      { name: "description", label: "Description", type: "textarea", isRequired: true },
      { name: "status", label: "Status", type: "select", options: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"], isRequired: true, default: "OPEN" },
      { name: "created_at", label: "Created At", type: "datetime", readOnly: true }
    ]
  },
  {
    id: "admin_audit_logs",
    name: "Admin Audit Logs",
    dbTable: "admin_audit_logs",
    primaryKey: "id",
    orderBy: "created_at.desc",
    canAdd: false,
    canEdit: false,
    canDelete: false, // Strictly VIEW ONLY
    columns: [
      { name: "id", label: "Log ID", type: "uuid", readOnly: true },
      { name: "admin_email", label: "Admin Email", type: "text", readOnly: true },
      { name: "action", label: "Action", type: "text", readOnly: true },
      { name: "target_driver_id", label: "Target Driver ID", type: "text", readOnly: true },
      { name: "target_auth_user_id", label: "Target Auth User ID", type: "text", readOnly: true },
      { name: "details", label: "Details (JSON)", type: "json", readOnly: true },
      { name: "created_at", label: "Logged At", type: "datetime", readOnly: true }
    ]
  },
  {
    id: "driver_documents",
    name: "Driver Documents",
    dbTable: "driver_documents",
    primaryKey: "id",
    orderBy: "uploaded_at.desc",
    canAdd: true,
    canEdit: true,
    canDelete: true,
    columns: [
      { name: "id", label: "Document ID", type: "uuid", readOnly: true },
      { name: "driver_profile_id", label: "Driver Profile UUID", type: "uuid", isRequired: true },
      { name: "auth_user_id", label: "Auth User UUID", type: "uuid" },
      { name: "document_type", label: "Document Type", type: "select", options: ["DRIVING_LICENCE", "AADHAAR_FRONT", "AADHAAR_BACK", "PAN_CARD", "PROFILE_PHOTO"], isRequired: true },
      { name: "document_number", label: "Document Number", type: "text" },
      { name: "storage_path", label: "Storage Path (Private)", type: "text", isRequired: true, isPrivate: true },
      { name: "verification_status", label: "Verification Status", type: "select", options: ["PENDING", "VERIFIED", "REJECTED"], isRequired: true, default: "PENDING" },
      { name: "rejection_reason", label: "Rejection Reason", type: "text" },
      { name: "verified_at", label: "Verified At", type: "datetime" },
      { name: "verified_by", label: "Verified By", type: "text" },
      { name: "uploaded_at", label: "Uploaded At", type: "datetime", readOnly: true }
    ]
  },
  {
    id: "owner_notifications",
    name: "Owner Notifications",
    dbTable: "owner_notifications",
    primaryKey: "id",
    orderBy: "created_at.desc",
    canAdd: true,
    canEdit: true,
    canDelete: true,
    columns: [
      { name: "id", label: "Notification ID", type: "uuid", readOnly: true },
      { name: "owner_id", label: "Owner UUID", type: "uuid", isRequired: true },
      { name: "booking_id", label: "Booking UUID", type: "uuid" },
      { name: "title", label: "Title", type: "text", isRequired: true },
      { name: "message", label: "Message", type: "textarea", isRequired: true },
      { name: "type", label: "Notification Type", type: "select", options: ["DRIVER_ASSIGNED", "TRIP_STARTED", "TRIP_COMPLETED", "BOOKING_ALERT", "PAYMENT"], isRequired: true, default: "DRIVER_ASSIGNED" },
      { name: "is_read", label: "Is Read", type: "boolean", default: false },
      { name: "created_at", label: "Created At", type: "datetime", readOnly: true }
    ]
  }
];

// Helper to log Admin actions to public.admin_audit_logs
export async function logAdminAction(adminEmail, action, targetDriverId, details) {
  try {
    await insertTableRecord("admin_audit_logs", {
      admin_email: adminEmail,
      action: action,
      target_driver_id: targetDriverId || null,
      details: details || {}
    });
  } catch (err) {
    console.warn("Audit log insert skipped:", err.message);
  }
}
