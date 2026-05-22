"use client";

import React from "react"

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAdminSession } from "@/hooks/use-admin-session";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Wrench,
  Calendar,
  Gauge,
  Clock,
  Car,
  Container,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Filter,
  X,
  Upload,
  FileText,
  DollarSign,
  Trash2,
  Settings,
  Pencil,
  Eye,
  Camera,
  ImageIcon,
} from "lucide-react";
import type {
  MaintenanceType,
  MaintenanceRecord,
  MaintenanceCost,
  Vehicle,
  MaintenanceStatus,
} from "@/lib/types";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface Trailer {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  trailer_type: string | null;
  traccar_device_id: string | null;
  is_active: boolean;
}

interface MaintenanceRecordWithDetails extends MaintenanceRecord {
  vehicle: Vehicle | null;
  trailer: Trailer | null;
  maintenance_type: MaintenanceType;
  maintenance_costs: MaintenanceCost[];
}

export default function MaintenancePage() {
  const { session: adminSession } = useAdminSession();
  const [records, setRecords] = useState<MaintenanceRecordWithDetails[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState<MaintenanceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MaintenanceRecordWithDetails | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState("all");
  const [selectedAssetType, setSelectedAssetType] = useState<"all" | "vehicle" | "trailer">("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  // Form state for new record
  const [formData, setFormData] = useState({
    asset_type: "vehicle" as "vehicle" | "trailer",
    vehicle_id: "",
    trailer_id: "",
    maintenance_type_id: "",
    scheduled_date: "",
    due_mileage: "",
    due_engine_hours: "",
    starting_odometer: "",
    starting_engine_hours: "",
    notes: "",
  });
  
  // GPS odometer data for selected vehicle
  const [gpsOdometer, setGpsOdometer] = useState<{ mileage: number | null; hours: number | null } | null>(null);
  const [loadingGps, setLoadingGps] = useState(false);

// Complete form state
  const [completeData, setCompleteData] = useState({
  completed_date: new Date().toISOString().split("T")[0],
  completed_mileage: "",
  completed_engine_hours: "",
  notes: "",
  costs: [] as { description: string; amount: string; currency: string; invoice_url: string }[],
  });
  const [completionPhotos, setCompletionPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [completeGpsOdometer, setCompleteGpsOdometer] = useState<{ mileage: number | null; hours: number | null } | null>(null);
  const [loadingCompleteGps, setLoadingCompleteGps] = useState(false);

  // Drivers for assignment
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<MaintenanceRecordWithDetails | null>(null);
  const [editData, setEditData] = useState({
    status: "",
    maintenance_type_id: "",
    due_mileage_km: "",
    due_engine_hours: "",
    due_date: "",
    remind_mileage_km: "",
    remind_engine_hours: "",
    remind_date: "",
    scheduled_start_time: "",
    scheduled_end_time: "",
    assigned_driver_id: "",
    appointment_location: "",
    notes: "",
  });

  const fetchData = async () => {
    if (!adminSession?.id) return;

    setLoading(true);
    const supabase = createClient();

// Fetch maintenance records with details (vehicles and trailers)
  const { data: recordsData } = await supabase
  .from("maintenance_records")
  .select(`
  *,
  vehicle:vehicles(*),
  trailer:trailers(*),
  maintenance_type:maintenance_types(*),
  maintenance_costs(*),
  reported_by_driver:drivers!requested_by_driver_id(id, name)
  `)
  .eq("admin_id", adminSession.id)
  .order("created_at", { ascending: false });

    if (recordsData) {
      // Use the status directly from the database - the cron job handles status updates
      // Don't override status client-side as it causes inconsistencies
      setRecords(recordsData as MaintenanceRecordWithDetails[]);
    }

    // Fetch vehicles
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select("*")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("plate_number");

    if (vehiclesData) {
      setVehicles(vehiclesData);
    }

    // Fetch trailers
    const { data: trailersData } = await supabase
      .from("trailers")
      .select("*")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("plate_number");

    if (trailersData) {
      setTrailers(trailersData);
    }

    // Fetch drivers
    const { data: driversData } = await supabase
      .from("drivers")
      .select("id, name")
      .eq("admin_id", adminSession.id)
      .order("name");

    if (driversData) {
      setDrivers(driversData);
    }

    // Fetch maintenance types
    const { data: typesData } = await supabase
      .from("maintenance_types")
      .select("*")
      .eq("admin_id", adminSession.id)
      .eq("is_active", true)
      .order("name");

    if (typesData) {
      setMaintenanceTypes(typesData);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [adminSession?.id]);

  const resetForm = () => {
    setFormData({
      asset_type: "vehicle",
      vehicle_id: "",
      trailer_id: "",
      maintenance_type_id: "",
      scheduled_date: "",
      due_mileage: "",
      due_engine_hours: "",
      starting_odometer: "",
      starting_engine_hours: "",
      notes: "",
    });
    setGpsOdometer(null);
  };

  // Fetch GPS odometer data for a vehicle or trailer
  const fetchAssetGpsData = async (assetType: "vehicle" | "trailer", assetId: string) => {
    if (!adminSession?.id) return;
    
    let traccarDeviceId: string | null = null;
    
    if (assetType === "vehicle") {
      const vehicle = vehicles.find((v) => v.id === assetId) as any;
      traccarDeviceId = vehicle?.traccar_device_id;
    } else {
      const trailer = trailers.find((t) => t.id === assetId);
      traccarDeviceId = trailer?.traccar_device_id || null;
    }
    
    if (!traccarDeviceId) {
      setGpsOdometer(null);
      return;
    }
    
    setLoadingGps(true);
    try {
      const response = await fetch(
        `/api/traccar?action=vehicle-data&adminId=${adminSession.id}&deviceId=${traccarDeviceId}`
      );
      const data = await response.json();
      
      if (response.ok) {
        setGpsOdometer({
          mileage: data.totalDistance,
          hours: data.engineHours,
        });
        // Auto-fill starting values
        setFormData((prev) => ({
          ...prev,
          starting_odometer: data.totalDistance ? Math.round(data.totalDistance).toString() : "",
          starting_engine_hours: data.engineHours ? Math.round(data.engineHours).toString() : "",
        }));
      } else {
        setGpsOdometer(null);
      }
    } catch {
      setGpsOdometer(null);
    }
    setLoadingGps(false);
  };
  
  // Legacy alias for vehicle GPS data
  const fetchVehicleGpsData = (vehicleId: string) => fetchAssetGpsData("vehicle", vehicleId);

  // Fetch GPS data when completing a maintenance (for vehicles or trailers)
  const fetchCompleteGpsData = async (record: MaintenanceRecordWithDetails) => {
    if (!adminSession?.id) return;
    
    let traccarDeviceId: string | null = null;
    
    if (record.vehicle_id) {
      const vehicle = vehicles.find((v) => v.id === record.vehicle_id) as any;
      traccarDeviceId = vehicle?.traccar_device_id;
    } else if (record.trailer_id) {
      const trailer = trailers.find((t) => t.id === record.trailer_id);
      traccarDeviceId = trailer?.traccar_device_id || null;
    }
    
    if (!traccarDeviceId) {
      setCompleteGpsOdometer(null);
      return;
    }
    
    setLoadingCompleteGps(true);
    try {
      const response = await fetch(
        `/api/traccar?action=vehicle-data&adminId=${adminSession.id}&deviceId=${traccarDeviceId}`
      );
      const data = await response.json();
      
      if (response.ok) {
        setCompleteGpsOdometer({
          mileage: data.totalDistance,
          hours: data.engineHours,
        });
        // Auto-fill completed values
        setCompleteData((prev) => ({
          ...prev,
          completed_mileage: data.totalDistance ? Math.round(data.totalDistance).toString() : prev.completed_mileage,
          completed_engine_hours: data.engineHours ? Math.round(data.engineHours).toString() : prev.completed_engine_hours,
        }));
      } else {
        setCompleteGpsOdometer(null);
      }
    } catch {
      setCompleteGpsOdometer(null);
    }
    setLoadingCompleteGps(false);
  };

  const handleCreate = async () => {
    const assetId = formData.asset_type === "vehicle" ? formData.vehicle_id : formData.trailer_id;
    if (!adminSession?.id || !assetId || !formData.maintenance_type_id) return;

    const supabase = createClient();

    // Calculate remind values from maintenance type
    const maintenanceType = maintenanceTypes.find((t) => t.id === formData.maintenance_type_id) as any;
    
    const dueMileage = formData.due_mileage ? parseInt(formData.due_mileage) : null;
    const dueEngineHours = formData.due_engine_hours ? parseInt(formData.due_engine_hours) : null;
    const dueDate = formData.scheduled_date || null;
    
    // Calculate remind thresholds
    let remindMileageKm = null;
    let remindEngineHours = null;
    let remindDate = null;
    
    if (dueMileage && maintenanceType?.mileage_remind_km) {
      remindMileageKm = dueMileage - maintenanceType.mileage_remind_km;
    }
    
    if (dueEngineHours && maintenanceType?.engine_hours_remind) {
      remindEngineHours = dueEngineHours - maintenanceType.engine_hours_remind;
    }
    
    if (dueDate && maintenanceType?.date_remind_days) {
      const dueDateObj = new Date(dueDate);
      dueDateObj.setDate(dueDateObj.getDate() - maintenanceType.date_remind_days);
      remindDate = dueDateObj.toISOString().split("T")[0];
    }

    // Use the correct database column names
    const insertData: any = {
      admin_id: adminSession.id,
      maintenance_type_id: formData.maintenance_type_id,
      status: "scheduled",
      due_date: dueDate,
      due_mileage_km: dueMileage,
      due_engine_hours: dueEngineHours,
      remind_date: remindDate,
      remind_mileage_km: remindMileageKm,
      remind_engine_hours: remindEngineHours,
      starting_odometer: formData.starting_odometer ? parseInt(formData.starting_odometer) : null,
      starting_engine_hours: formData.starting_engine_hours ? parseInt(formData.starting_engine_hours) : null,
      starting_date: new Date().toISOString().split("T")[0],
      notes: formData.notes || null,
    };
    
    // Set the correct asset ID based on type
    if (formData.asset_type === "vehicle") {
      insertData.vehicle_id = formData.vehicle_id;
    } else {
      insertData.trailer_id = formData.trailer_id;
    }

    const { error } = await supabase.from("maintenance_records").insert(insertData);
    
    if (error) {
      alert("Failed to save maintenance: " + error.message);
      return;
    }

    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const openCompleteDialog = (record: MaintenanceRecordWithDetails) => {
    setSelectedRecord(record);
    setCompleteData({
      completed_date: new Date().toISOString().split("T")[0],
      completed_mileage: "",
      completed_engine_hours: "",
      notes: record.notes || "",
      costs: [],
    });
    setCompleteGpsOdometer(null);
    setCompleteDialogOpen(true);
    // Fetch GPS data for the vehicle or trailer
    fetchCompleteGpsData(record);
  };

  const addCost = () => {
    setCompleteData({
      ...completeData,
      costs: [...completeData.costs, { description: "", amount: "", currency: "EUR", invoice_url: "" }],
    });
  };

  const updateCost = (index: number, field: string, value: string) => {
    const newCosts = [...completeData.costs];
    newCosts[index] = { ...newCosts[index], [field]: value };
    setCompleteData({ ...completeData, costs: newCosts });
  };

  const removeCost = (index: number) => {
    setCompleteData({
      ...completeData,
      costs: completeData.costs.filter((_, i) => i !== index),
    });
  };

  const handleComplete = async () => {
    if (!selectedRecord || !adminSession?.id) return;

    const supabase = createClient();
    const completedDate = new Date(completeData.completed_date).toISOString();

    // Upload completion photos
    setUploadingPhotos(true);
    const photoUrls: string[] = [];
    for (const photo of completionPhotos) {
      const fileName = `completion/${selectedRecord.id}/${Date.now()}-${photo.file.name}`;
      const { data, error } = await supabase.storage
        .from("maintenance-photos")
        .upload(fileName, photo.file);

      if (data && !error) {
        const { data: urlData } = supabase.storage
          .from("maintenance-photos")
          .getPublicUrl(fileName);
        photoUrls.push(urlData.publicUrl);
      }
    }
    setUploadingPhotos(false);

    // Update the record with correct column names
    await supabase
      .from("maintenance_records")
      .update({
        status: "completed",
        completed_at: completedDate,
        completed_date: completedDate,
        completed_odometer: completeData.completed_mileage ? parseInt(completeData.completed_mileage) : null,
        completed_engine_hours: completeData.completed_engine_hours ? parseInt(completeData.completed_engine_hours) : null,
        notes: completeData.notes || null,
        completion_photos: photoUrls.length > 0 ? photoUrls : null,
      })
      .eq("id", selectedRecord.id);

    // Log activity
    await supabase.from("maintenance_activity_log").insert({
      maintenance_record_id: selectedRecord.id,
      action: "status_changed",
      details: { from: selectedRecord.status, to: "completed" },
      performed_by_type: "admin",
      performed_by_admin_id: adminSession.id,
    });

    // Insert costs
    if (completeData.costs.length > 0) {
      const costsToInsert = completeData.costs
        .filter((c) => c.amount)
        .map((c) => ({
          maintenance_record_id: selectedRecord.id,
          description: c.description || null,
          cost: parseFloat(c.amount),
          cost_currency: c.currency || "EUR",
          invoice_url: c.invoice_url || null,
        }));

      if (costsToInsert.length > 0) {
        await supabase.from("maintenance_costs").insert(costsToInsert);
      }
    }

    // Check if auto-repeat is enabled
    if (selectedRecord.maintenance_type?.auto_repeat) {
      const maintenanceType = selectedRecord.maintenance_type as any;
      
      // Calculate new due dates based on intervals (using correct column names)
      let newDueDate = null;
      let newDueMileageKm = null;
      let newDueEngineHours = null;
      let newRemindDate = null;
      let newRemindMileageKm = null;
      let newRemindEngineHours = null;

      if (maintenanceType.interval_by_date && maintenanceType.date_interval_months) {
        const baseDate = new Date(completeData.completed_date);
        baseDate.setMonth(baseDate.getMonth() + maintenanceType.date_interval_months);
        newDueDate = baseDate.toISOString().split("T")[0];
        
        // Calculate remind date
        if (maintenanceType.date_remind_days) {
          const remindDateObj = new Date(baseDate);
          remindDateObj.setDate(remindDateObj.getDate() - maintenanceType.date_remind_days);
          newRemindDate = remindDateObj.toISOString().split("T")[0];
        }
      }

      if (maintenanceType.interval_by_mileage && maintenanceType.mileage_interval_km) {
        const baseMileage = completeData.completed_mileage ? parseInt(completeData.completed_mileage) : 0;
        newDueMileageKm = baseMileage + maintenanceType.mileage_interval_km;
        
        // Calculate remind mileage
        if (maintenanceType.mileage_remind_km) {
          newRemindMileageKm = newDueMileageKm - maintenanceType.mileage_remind_km;
        }
      }

      if (maintenanceType.interval_by_engine_hours && maintenanceType.engine_hours_interval) {
        const baseHours = completeData.completed_engine_hours ? parseInt(completeData.completed_engine_hours) : 0;
        newDueEngineHours = baseHours + maintenanceType.engine_hours_interval;
        
        // Calculate remind engine hours
        if (maintenanceType.engine_hours_remind) {
          newRemindEngineHours = newDueEngineHours - maintenanceType.engine_hours_remind;
        }
      }

      // Create new scheduled record with all fields including remind values
      const newRecordData: any = {
        admin_id: adminSession.id,
        maintenance_type_id: selectedRecord.maintenance_type_id,
        status: "scheduled",
        due_date: newDueDate,
        due_mileage_km: newDueMileageKm,
        due_engine_hours: newDueEngineHours,
        remind_date: newRemindDate,
        remind_mileage_km: newRemindMileageKm,
        remind_engine_hours: newRemindEngineHours,
        starting_odometer: completeData.completed_mileage ? parseInt(completeData.completed_mileage) : null,
        starting_engine_hours: completeData.completed_engine_hours ? parseInt(completeData.completed_engine_hours) : null,
        starting_date: completeData.completed_date,
      };
      
      // Set vehicle or trailer ID based on original record
      if (selectedRecord.vehicle_id) {
        newRecordData.vehicle_id = selectedRecord.vehicle_id;
      } else if (selectedRecord.trailer_id) {
        newRecordData.trailer_id = selectedRecord.trailer_id;
      }
      
      await supabase.from("maintenance_records").insert(newRecordData);
    }

setCompleteDialogOpen(false);
  setSelectedRecord(null);
  // Clear completion photos
  completionPhotos.forEach(p => URL.revokeObjectURL(p.preview));
  setCompletionPhotos([]);
  fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this maintenance record?")) return;

    const supabase = createClient();
    await supabase.from("maintenance_records").delete().eq("id", id);
    fetchData();
  };

  const openEditDialog = (record: MaintenanceRecordWithDetails) => {
    setEditRecord(record);
setEditData({
    status: record.status || "",
    maintenance_type_id: record.maintenance_type_id || "",
    due_mileage_km: (record as any).due_mileage_km?.toString() || "",
    due_engine_hours: (record as any).due_engine_hours?.toString() || "",
    due_date: (record as any).due_date || "",
    remind_mileage_km: (record as any).remind_mileage_km?.toString() || "",
    remind_engine_hours: (record as any).remind_engine_hours?.toString() || "",
    remind_date: (record as any).remind_date || "",
    scheduled_start_time: (record as any).scheduled_start_time ? new Date((record as any).scheduled_start_time).toISOString().slice(0, 16) : "",
    scheduled_end_time: (record as any).scheduled_end_time ? new Date((record as any).scheduled_end_time).toISOString().slice(0, 16) : "",
    assigned_driver_id: (record as any).assigned_driver_id || "",
    appointment_location: (record as any).appointment_location || "",
    notes: record.notes || "",
  });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editRecord) return;

    const supabase = createClient();
    
    // Prepare update data
    const updateData: any = {
      notes: editData.notes || null,
    };
    
    // Update maintenance type if changed (for requests that need to be classified)
    if (editData.maintenance_type_id && editData.maintenance_type_id !== editRecord.maintenance_type_id) {
      updateData.maintenance_type_id = editData.maintenance_type_id;
    }
    
    if (editData.due_mileage_km) updateData.due_mileage_km = parseInt(editData.due_mileage_km);
    if (editData.due_engine_hours) updateData.due_engine_hours = parseInt(editData.due_engine_hours);
    if (editData.due_date) updateData.due_date = editData.due_date;
    if (editData.remind_mileage_km) updateData.remind_mileage_km = parseInt(editData.remind_mileage_km);
    if (editData.remind_engine_hours) updateData.remind_engine_hours = parseInt(editData.remind_engine_hours);
    if (editData.remind_date) updateData.remind_date = editData.remind_date;
    
    // Scheduling/Planning fields
    updateData.scheduled_start_time = editData.scheduled_start_time || null;
    updateData.scheduled_end_time = editData.scheduled_end_time || null;
    updateData.assigned_driver_id = editData.assigned_driver_id && editData.assigned_driver_id !== "none" ? editData.assigned_driver_id : null;
    updateData.appointment_location = editData.appointment_location || null;
    
    // Handle status transitions for "reported" records (driver-reported issues)
    if (editRecord.status === "reported") {
      // Auto-determine status based on what admin filled in
      if (editData.scheduled_start_time) {
        // If appointment scheduled → "scheduled"
        updateData.status = "scheduled";
      } else if (editData.due_date || editData.due_mileage_km || editData.due_engine_hours) {
        // If due thresholds set but no appointment → "due"
        updateData.status = "due";
      } else if (editData.status && editData.status !== "reported") {
        // Admin explicitly selected a status (diagnose, completed)
        updateData.status = editData.status;
      }
      // Otherwise keep as "reported" if nothing substantial was changed
    } else {
      // Auto-calculate correct status based on current odometer vs due values
      const currentOdometer = (editRecord as any).current_odometer;
      const dueMileage = updateData.due_mileage_km || (editRecord as any).due_mileage_km;
      const remindKm = updateData.remind_mileage_km ?? (editRecord as any).remind_mileage_km;
      
      // Only auto-calculate status if we have odometer data and due mileage
      // Don't auto-calculate for diagnose/in_progress/completed statuses (those are manual workflow steps)
      if (currentOdometer && dueMileage && !["diagnose", "in_progress", "completed"].includes(editRecord.status)) {
        if (currentOdometer >= dueMileage) {
          // Past due point = expired
          updateData.status = "expired";
          if (!updateData.expired_at && editRecord.status !== "expired") {
            updateData.expired_at = new Date().toISOString();
          }
        } else if (remindKm && currentOdometer >= (dueMileage + remindKm)) {
          // Reached remind threshold (remindKm is negative) = due
          updateData.status = "due";
          updateData.expired_at = null;
        } else {
          // Not yet at remind threshold = scheduled
          updateData.status = "scheduled";
          updateData.expired_at = null;
        }
      }
    }

    await supabase
      .from("maintenance_records")
      .update(updateData)
      .eq("id", editRecord.id);

    // Create notification if driver is assigned with a scheduled time
    const driverId = updateData.assigned_driver_id;
    const scheduledTime = updateData.scheduled_start_time;
    const location = updateData.appointment_location;
    
    if (driverId && scheduledTime) {
      const notificationBody = location 
        ? `You have been assigned to bring a vehicle for maintenance on ${new Date(scheduledTime).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} at ${new Date(scheduledTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}. Location: ${location}`
        : `You have been assigned to bring a vehicle for maintenance on ${new Date(scheduledTime).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} at ${new Date(scheduledTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;

      // Send push notification and create in-app notification via API
      try {
        await fetch("/api/notifications/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_id: adminSession.id,
            driver_id: driverId,
            title: "You are planned for Maintenance",
            body: notificationBody,
            data: { type: "maintenance_appointment", recordId: editRecord.id, scheduled_for: scheduledTime },
          }),
        });
      } catch (e) {
        console.error("Failed to send notification:", e);
      }
    }

    // Log activity
    if (updateData.status && updateData.status !== editRecord.status) {
      await supabase.from("maintenance_activity_log").insert({
        maintenance_record_id: editRecord.id,
        action: "status_changed",
        details: { from: editRecord.status, to: updateData.status },
        performed_by_type: "admin",
        performed_by_admin_id: adminSession.id,
      });
    }

    if (driverId && driverId !== (editRecord as any).assigned_driver_id) {
      const driverName = drivers.find(d => d.id === driverId)?.name;
      await supabase.from("maintenance_activity_log").insert({
        maintenance_record_id: editRecord.id,
        action: "driver_assigned",
        details: { driver_id: driverId, driver_name: driverName },
        performed_by_type: "admin",
        performed_by_admin_id: adminSession.id,
      });
    }

    if (scheduledTime && scheduledTime !== (editRecord as any).scheduled_start_time) {
      await supabase.from("maintenance_activity_log").insert({
        maintenance_record_id: editRecord.id,
        action: "appointment_scheduled",
        details: { scheduled_for: scheduledTime, location: updateData.appointment_location },
        performed_by_type: "admin",
        performed_by_admin_id: adminSession.id,
      });
    }

    setEditDialogOpen(false);
    setEditRecord(null);
    fetchData();
  };

  const getStatusIcon = (status: MaintenanceStatus) => {
    switch (status) {
case "reported":
  return <AlertTriangle className="h-5 w-5 text-orange-400" />;
  case "diagnose":
        return <Wrench className="h-5 w-5 text-purple-400" />;
case "scheduled":
  return <Calendar className="h-5 w-5 text-blue-400" />;
  case "in_progress":
  return <Wrench className="h-5 w-5 text-cyan-400" />;
  case "due":
        return <AlertTriangle className="h-5 w-5 text-yellow-400" />;
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case "expired":
        return <XCircle className="h-5 w-5 text-red-400" />;
    }
  };

const getStatusColor = (status: MaintenanceStatus) => {
  switch (status) {
  case "reported":
  return "bg-orange-500/20 text-orange-400";
  case "diagnose":
        return "bg-purple-500/20 text-purple-400";
case "scheduled":
  return "bg-blue-500/20 text-blue-400";
  case "in_progress":
  return "bg-cyan-500/20 text-cyan-400";
  case "due":
        return "bg-yellow-500/20 text-yellow-400";
      case "completed":
        return "bg-green-500/20 text-green-400";
      case "expired":
        return "bg-red-500/20 text-red-400";
    }
  };

  // Filter records
  const filteredRecords = records.filter((record) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const plateNumber = record.vehicle?.plate_number || record.trailer?.plate_number || "";
      if (
        !plateNumber.toLowerCase().includes(query) &&
        !record.maintenance_type?.name?.toLowerCase().includes(query)
      ) {
        return false;
      }
    }
    // Filter by asset type
    if (selectedAssetType === "vehicle" && !record.vehicle_id) return false;
    if (selectedAssetType === "trailer" && !record.trailer_id) return false;
    
    if (selectedVehicle !== "all") {
      if (record.vehicle_id !== selectedVehicle && record.trailer_id !== selectedVehicle) {
        return false;
      }
    }
    if (selectedStatus !== "all" && record.status !== selectedStatus) {
      return false;
    }
    return true;
  });

// Group by status
  const groupedRecords = {
  reported: filteredRecords.filter((r) => r.status === "reported"),
  diagnose: filteredRecords.filter((r) => r.status === "diagnose"),
  due: filteredRecords.filter((r) => r.status === "due"),
  scheduled: filteredRecords.filter((r) => r.status === "scheduled"),
  in_progress: filteredRecords.filter((r) => r.status === "in_progress"),
  completed: filteredRecords.filter((r) => r.status === "completed"),
  expired: filteredRecords.filter((r) => r.status === "expired"),
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedVehicle("all");
    setSelectedAssetType("all");
    setSelectedStatus("all");
  };

  const hasActiveFilters = searchQuery || selectedVehicle !== "all" || selectedAssetType !== "all" || selectedStatus !== "all";

  // Get selected maintenance type for interval info
  const selectedMaintenanceType = maintenanceTypes.find((t) => t.id === formData.maintenance_type_id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Maintenance</h1>
          <p className="text-muted-foreground">Track and manage vehicle and trailer maintenance schedules</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/maintenance/planning">
            <Button variant="outline" className="bg-transparent">
              <Calendar className="h-4 w-4 mr-2" />
              Planning
            </Button>
          </Link>
          {(adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["maintenance:types:manage"]) && (
            <Link href="/admin/maintenance-types">
              <Button variant="outline" className="bg-transparent">
                <Settings className="h-4 w-4 mr-2" />
                Types
              </Button>
            </Link>
          )}
          {(adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["maintenance:costs:view"]) && (
            <Link href="/admin/reports/maintenance-costs">
              <Button variant="outline" className="bg-transparent">
                <FileText className="h-4 w-4 mr-2" />
                Cost Reports
              </Button>
            </Link>
          )}
          {(adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["maintenance:create"]) && (
            <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Schedule Maintenance
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {groupedRecords.reported.length > 0 && (
          <Card className="border-orange-500/30 cursor-pointer hover:bg-orange-500/5" onClick={() => setSelectedStatus("reported")}>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-orange-400">{groupedRecords.reported.length}</p>
              <p className="text-sm text-muted-foreground">Driver Reported</p>
            </CardContent>
          </Card>
        )}
        {groupedRecords.diagnose.length > 0 && (
          <Card className="border-purple-500/30">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-purple-400">{groupedRecords.diagnose.length}</p>
              <p className="text-sm text-muted-foreground">Diagnosis</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-yellow-400">{groupedRecords.due.length}</p>
            <p className="text-sm text-muted-foreground">Due Now</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-400">{groupedRecords.scheduled.length}</p>
            <p className="text-sm text-muted-foreground">Scheduled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{groupedRecords.completed.length}</p>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-red-400">{groupedRecords.expired.length}</p>
            <p className="text-sm text-muted-foreground">Expired</p>
          </CardContent>
        </Card>
        {/* Planning status */}
        {(() => {
          const activeMaintenance = filteredRecords.filter(r => r.status !== "completed");
          const planned = activeMaintenance.filter(r => (r as any).scheduled_start_time).length;
          const notPlanned = activeMaintenance.length - planned;
          return (
            <>
              <Card className="border-green-500/30">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-green-400">{planned}</p>
                  <p className="text-sm text-muted-foreground">Planned</p>
                </CardContent>
              </Card>
              {notPlanned > 0 && (
                <Card className="border-muted-foreground/30">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-muted-foreground">{notPlanned}</p>
                    <p className="text-sm text-muted-foreground">Not Planned</p>
                  </CardContent>
                </Card>
              )}
            </>
          );
        })()}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by vehicle or maintenance type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          className="bg-transparent"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {hasActiveFilters && <Badge className="ml-2 bg-primary text-primary-foreground">Active</Badge>}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" onClick={clearFilters}>
            <X className="h-4 w-4 mr-2" />
            Clear
          </Button>
        )}
      </div>

      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Asset Type</Label>
                <Select value={selectedAssetType} onValueChange={(v) => setSelectedAssetType(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Assets" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Assets</SelectItem>
                    <SelectItem value="vehicle">Vehicles Only</SelectItem>
                    <SelectItem value="trailer">Trailers Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vehicle / Trailer</Label>
                <SearchableSelect
                  value={selectedVehicle}
                  onValueChange={setSelectedVehicle}
                  placeholder="All"
                  searchPlaceholder="Search..."
                  emptyText="No asset found."
                  options={[
                    { value: "all", label: "All" },
                    ...vehicles.map((v) => ({
                      value: v.id,
                      label: v.plate_number,
                      sublabel: `Vehicle${v.model ? ` - ${v.model}` : ""}`,
                    })),
                    ...trailers.map((t) => ({
                      value: t.id,
                      label: t.plate_number,
                      sublabel: `Trailer${t.trailer_type ? ` - ${t.trailer_type}` : ""}`,
                    })),
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="reported">Driver Reported</SelectItem>
                    <SelectItem value="diagnose">Diagnosis</SelectItem>
                    <SelectItem value="due">Due</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Records List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : filteredRecords.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {records.length === 0
                ? "No maintenance records yet. Schedule your first maintenance."
                : "No records match your filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Driver Requests - Priority Section */}
{groupedRecords.reported.length > 0 && (
  <div>
  <h3 className="text-sm font-medium text-orange-400 mb-3 flex items-center gap-2">
  <AlertTriangle className="h-4 w-4" />
  Driver Reported ({groupedRecords.reported.length})
  </h3>
  <div className="grid gap-3">
  {groupedRecords.reported.map((record) => (
                  <MaintenanceCard
                    key={record.id}
                    record={record}
                    onComplete={() => openCompleteDialog(record)}
                    onEdit={() => openEditDialog(record)}
                    onDelete={() => handleDelete(record.id)}
                    getStatusIcon={getStatusIcon}
                    getStatusColor={getStatusColor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Under Diagnosis */}
          {groupedRecords.diagnose.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Under Diagnosis ({groupedRecords.diagnose.length})
              </h3>
              <div className="grid gap-3">
                {groupedRecords.diagnose.map((record) => (
                  <MaintenanceCard
                    key={record.id}
                    record={record}
                    onComplete={() => openCompleteDialog(record)}
                    onEdit={() => openEditDialog(record)}
                    onDelete={() => handleDelete(record.id)}
                    getStatusIcon={getStatusIcon}
                    getStatusColor={getStatusColor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Due Now - Priority Section */}
          {groupedRecords.due.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-yellow-400 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Due Now ({groupedRecords.due.length})
              </h3>
              <div className="grid gap-3">
                {groupedRecords.due.map((record) => (
                  <MaintenanceCard
                    key={record.id}
                    record={record}
                    onComplete={() => openCompleteDialog(record)}
                    onEdit={() => openEditDialog(record)}
                    onDelete={() => handleDelete(record.id)}
                    getStatusIcon={getStatusIcon}
                    getStatusColor={getStatusColor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Scheduled */}
          {groupedRecords.scheduled.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-blue-400 mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Scheduled ({groupedRecords.scheduled.length})
              </h3>
              <div className="grid gap-3">
                {groupedRecords.scheduled.map((record) => (
                  <MaintenanceCard
                    key={record.id}
                    record={record}
                    onComplete={() => openCompleteDialog(record)}
                    onEdit={() => openEditDialog(record)}
                    onDelete={() => handleDelete(record.id)}
                    getStatusIcon={getStatusIcon}
                    getStatusColor={getStatusColor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Expired */}
          {groupedRecords.expired.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                Expired ({groupedRecords.expired.length})
              </h3>
              <div className="grid gap-3">
                {groupedRecords.expired.map((record) => (
                  <MaintenanceCard
                    key={record.id}
                    record={record}
                    onComplete={() => openCompleteDialog(record)}
                    onEdit={() => openEditDialog(record)}
                    onDelete={() => handleDelete(record.id)}
                    getStatusIcon={getStatusIcon}
                    getStatusColor={getStatusColor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {groupedRecords.completed.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-green-400 mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Completed ({groupedRecords.completed.length})
              </h3>
              <div className="grid gap-3">
                {groupedRecords.completed.map((record) => (
                  <MaintenanceCard
                    key={record.id}
                    record={record}
                    onDelete={() => handleDelete(record.id)}
                    getStatusIcon={getStatusIcon}
                    getStatusColor={getStatusColor}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule Maintenance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Asset Type Selector */}
            <div className="space-y-2">
              <Label>Asset Type *</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={formData.asset_type === "vehicle" ? "default" : "outline"}
                  className={formData.asset_type === "vehicle" ? "" : "bg-transparent"}
                  onClick={() => setFormData({ ...formData, asset_type: "vehicle", vehicle_id: "", trailer_id: "" })}
                >
                  <Car className="h-4 w-4 mr-2" />
                  Vehicle
                </Button>
                <Button
                  type="button"
                  variant={formData.asset_type === "trailer" ? "default" : "outline"}
                  className={formData.asset_type === "trailer" ? "" : "bg-transparent"}
                  onClick={() => setFormData({ ...formData, asset_type: "trailer", vehicle_id: "", trailer_id: "" })}
                >
                  <Container className="h-4 w-4 mr-2" />
                  Trailer
                </Button>
              </div>
            </div>
            
            {/* Vehicle or Trailer Selector */}
            <div className="space-y-2">
              <Label>{formData.asset_type === "vehicle" ? "Vehicle" : "Trailer"} *</Label>
              {formData.asset_type === "vehicle" ? (
                <SearchableSelect
                  value={formData.vehicle_id}
                  onValueChange={(value) => {
                    setFormData({ ...formData, vehicle_id: value });
                    fetchVehicleGpsData(value);
                  }}
                  placeholder="Select vehicle"
                  searchPlaceholder="Search vehicles..."
                  emptyText="No vehicle found."
                  options={vehicles.map((v) => ({
                    value: v.id,
                    label: v.plate_number,
                    sublabel: v.model || undefined,
                  }))}
                />
              ) : (
                <SearchableSelect
                  value={formData.trailer_id}
                  onValueChange={(value) => {
                    setFormData({ ...formData, trailer_id: value });
                    // Fetch GPS data for trailers using the same fetchAssetGpsData function
                    fetchAssetGpsData("trailer", value);
                  }}
                  placeholder="Select trailer"
                  searchPlaceholder="Search trailers..."
                  emptyText="No trailer found."
                  options={trailers.map((t) => ({
                    value: t.id,
                    label: t.plate_number,
                    sublabel: t.trailer_type || undefined,
                  }))}
                />
              )}
              {loadingGps && (
                <p className="text-xs text-muted-foreground">Loading GPS data...</p>
              )}
              {gpsOdometer && (
                <div className="text-xs p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <p className="text-green-400 font-medium">GPS Data Available</p>
                  {gpsOdometer.mileage !== null && (
                    <p>Current Odometer: {gpsOdometer.mileage.toLocaleString()} km</p>
                  )}
                  {gpsOdometer.hours !== null && (
                    <p>Engine Hours: {gpsOdometer.hours.toLocaleString()} hrs</p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Maintenance Type *</Label>
              <Select
                value={formData.maintenance_type_id}
                onValueChange={(value) => setFormData({ ...formData, maintenance_type_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {maintenanceTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedMaintenanceType && (
              <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                <p className="font-medium mb-2">Service intervals:</p>
                <div className="space-y-1">
                  {selectedMaintenanceType.interval_by_date && (
                    <p>Every {selectedMaintenanceType.date_interval_months} month(s)</p>
                  )}
                  {selectedMaintenanceType.interval_by_mileage && (
                    <p>Every {selectedMaintenanceType.mileage_interval_km?.toLocaleString()} km</p>
                  )}
                  {selectedMaintenanceType.interval_by_engine_hours && (
                    <p>Every {selectedMaintenanceType.engine_hours_interval} engine hours</p>
                  )}
                </div>
              </div>
            )}

            {selectedMaintenanceType?.interval_by_date && (
              <div className="space-y-2">
                <Label>Scheduled Date</Label>
                <Input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                />
              </div>
            )}

            {selectedMaintenanceType?.interval_by_mileage && (
              <div className="space-y-2">
                <Label>Due at Mileage (km)</Label>
                <Input
                  type="number"
                  value={formData.due_mileage}
                  onChange={(e) => setFormData({ ...formData, due_mileage: e.target.value })}
                  placeholder="e.g., 50000"
                />
              </div>
            )}

            {selectedMaintenanceType?.interval_by_engine_hours && (
              <div className="space-y-2">
                <Label>Due at Engine Hours</Label>
                <Input
                  type="number"
                  value={formData.due_engine_hours}
                  onChange={(e) => setFormData({ ...formData, due_engine_hours: e.target.value })}
                  placeholder="e.g., 500"
                />
              </div>
            )}

            {/* Starting Odometer Section */}
            {(selectedMaintenanceType?.interval_by_mileage || selectedMaintenanceType?.interval_by_engine_hours) && (
              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-medium mb-3">Starting Values {gpsOdometer && <span className="text-green-400">(Pre-filled from GPS)</span>}</p>
                <div className="grid grid-cols-2 gap-4">
                  {selectedMaintenanceType?.interval_by_mileage && (
                    <div className="space-y-2">
                      <Label>Starting Odometer (km)</Label>
                      <Input
                        type="number"
                        value={formData.starting_odometer}
                        onChange={(e) => setFormData({ ...formData, starting_odometer: e.target.value })}
                        placeholder={gpsOdometer?.mileage ? `GPS: ${gpsOdometer.mileage.toLocaleString()}` : "Current mileage"}
                      />
                    </div>
                  )}
                  {selectedMaintenanceType?.interval_by_engine_hours && (
                    <div className="space-y-2">
                      <Label>Starting Engine Hours</Label>
                      <Input
                        type="number"
                        value={formData.starting_engine_hours}
                        onChange={(e) => setFormData({ ...formData, starting_engine_hours: e.target.value })}
                        placeholder={gpsOdometer?.hours ? `GPS: ${gpsOdometer.hours.toLocaleString()}` : "Current hours"}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="bg-transparent">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                (formData.asset_type === "vehicle" ? !formData.vehicle_id : !formData.trailer_id) || 
                !formData.maintenance_type_id
              }
            >
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete Maintenance</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium">{selectedRecord.maintenance_type?.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedRecord.vehicle?.plate_number} - {selectedRecord.vehicle?.model}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Completion Date *</Label>
                <Input
                  type="date"
                  value={completeData.completed_date}
                  onChange={(e) => setCompleteData({ ...completeData, completed_date: e.target.value })}
                />
              </div>

              {/* GPS Data Display */}
              {loadingCompleteGps && (
                <p className="text-xs text-muted-foreground">Loading GPS data...</p>
              )}
              {completeGpsOdometer && (
                <div className="text-xs p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <p className="text-green-400 font-medium">GPS Data (Pre-filled below, you can modify)</p>
                  {completeGpsOdometer.mileage !== null && (
                    <p>Current Odometer: {completeGpsOdometer.mileage.toLocaleString()} km</p>
                  )}
                  {completeGpsOdometer.hours !== null && (
                    <p>Engine Hours: {completeGpsOdometer.hours.toLocaleString()} hrs</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Current Mileage (km) {completeGpsOdometer && <span className="text-green-400 text-xs">(from GPS)</span>}</Label>
                <Input
                  type="number"
                  value={completeData.completed_mileage}
                  onChange={(e) => setCompleteData({ ...completeData, completed_mileage: e.target.value })}
                  placeholder={completeGpsOdometer?.mileage ? `GPS: ${completeGpsOdometer.mileage.toLocaleString()}` : "e.g., 50000"}
                />
              </div>

              <div className="space-y-2">
                <Label>Current Engine Hours {completeGpsOdometer && <span className="text-green-400 text-xs">(from GPS)</span>}</Label>
                <Input
                  type="number"
                  value={completeData.completed_engine_hours}
                  onChange={(e) => setCompleteData({ ...completeData, completed_engine_hours: e.target.value })}
                  placeholder={completeGpsOdometer?.hours ? `GPS: ${completeGpsOdometer.hours.toLocaleString()}` : "e.g., 500"}
                />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={completeData.notes}
                  onChange={(e) => setCompleteData({ ...completeData, notes: e.target.value })}
                  placeholder="Optional notes..."
                />
              </div>

              {/* Completion Photos */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Completion Photos (Mechanic)
                </Label>
                <div className="flex flex-wrap gap-2">
                  {completionPhotos.map((photo, index) => (
                    <div key={index} className="relative w-20 h-20">
                      <img
                        src={photo.preview}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(photo.preview);
                          setCompletionPhotos(prev => prev.filter((_, i) => i !== index));
                        }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground mt-1">Add</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const newPhotos = files.map(file => ({
                          file,
                          preview: URL.createObjectURL(file),
                        }));
                        setCompletionPhotos(prev => [...prev, ...newPhotos]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Upload photos of completed work, replaced parts, etc.
                </p>
              </div>

              {/* Costs Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Costs & Invoices</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addCost} className="bg-transparent">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Cost
                  </Button>
                </div>
                {completeData.costs.map((cost, index) => (
                  <Card key={index}>
                    <CardContent className="p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Cost #{index + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => removeCost(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        placeholder="Description (e.g., Parts, Labor)"
                        value={cost.description}
                        onChange={(e) => updateCost(index, "description", e.target.value)}
                      />
<div className="flex gap-2">
  <Input
  type="number"
  placeholder="Amount"
  value={cost.amount}
  onChange={(e) => updateCost(index, "amount", e.target.value)}
  className="flex-1"
  />
  <Select
  value={cost.currency || "EUR"}
  onValueChange={(v) => updateCost(index, "currency", v)}
  >
  <SelectTrigger className="w-24">
  <SelectValue />
  </SelectTrigger>
  <SelectContent>
  <SelectItem value="EUR">EUR</SelectItem>
  <SelectItem value="RON">RON</SelectItem>
  <SelectItem value="GBP">GBP</SelectItem>
  <SelectItem value="USD">USD</SelectItem>
  </SelectContent>
  </Select>
  </div>
  <Input
                        placeholder="Invoice URL (optional)"
                        value={cost.invoice_url}
                        onChange={(e) => updateCost(index, "invoice_url", e.target.value)}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>

              {selectedRecord.maintenance_type?.auto_repeat && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm">
                  <p className="text-blue-400">
                    Auto-repeat is enabled. A new maintenance will be scheduled automatically.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)} className="bg-transparent">
              Cancel
            </Button>
            <Button onClick={handleComplete}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Maintenance Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Maintenance</DialogTitle>
          </DialogHeader>
          {editRecord && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {editRecord.vehicle?.plate_number}
                {editRecord.vehicle?.model && ` - ${editRecord.vehicle.model}`}
              </div>

              {/* Current status badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge className={getStatusColor(editRecord.status)}>
                  {editRecord.status.charAt(0).toUpperCase() + editRecord.status.slice(1)}
                </Badge>
                <span className="text-xs text-muted-foreground">(auto-calculated)</span>
              </div>

{/* Driver request info */}
  {(editRecord as any).request_description && (
  <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
  <div className="flex items-center justify-between mb-2">
  <p className="text-xs font-medium text-orange-400">Driver Reported Issue</p>
  {(editRecord as any).reported_by_driver?.name && (
  <span className="text-xs text-muted-foreground">by {(editRecord as any).reported_by_driver.name}</span>
  )}
  </div>
  <p className="text-sm">{(editRecord as any).request_description}</p>
  {(editRecord as any).request_photos && (editRecord as any).request_photos.length > 0 && (
  <div className="flex gap-2 mt-2">
  {(editRecord as any).request_photos.map((photo: string, i: number) => (
  <a key={i} href={photo} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded overflow-hidden bg-muted block">
  <img src={photo} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
  </a>
  ))}
  </div>
  )}
  </div>
  )}

              {/* Status selector for reported records */}
              {editRecord.status === "reported" && (
                <div className="space-y-2">
                  <Label>Action / Status</Label>
                  <Select 
                    value={editData.status} 
                    onValueChange={(v) => setEditData({ ...editData, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reported">Keep as Reported (Pending Review)</SelectItem>
                      <SelectItem value="diagnose">Move to Diagnosis (Needs Investigation)</SelectItem>
                      <SelectItem value="scheduled">Schedule Appointment (set date/time below)</SelectItem>
                      <SelectItem value="due">Convert to Preventive (set due thresholds below)</SelectItem>
                      <SelectItem value="completed">Mark as Completed (False alarm / Already fixed)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Status will auto-update: Set appointment time → Scheduled, Set due date/mileage → Due
                  </p>
                </div>
              )}
              
              {/* Maintenance Type */}
              <div className="space-y-2">
                <Label>Maintenance Type</Label>
                <Select 
                  value={editData.maintenance_type_id} 
                  onValueChange={(v) => setEditData({ ...editData, maintenance_type_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {maintenanceTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Planning Section */}
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 space-y-3">
                <p className="text-sm font-medium text-green-400">Planning (Service Appointment)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Appointment Start</Label>
                    <Input
                      type="datetime-local"
                      value={editData.scheduled_start_time}
                      onChange={(e) => setEditData({ ...editData, scheduled_start_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Appointment End</Label>
                    <Input
                      type="datetime-local"
                      value={editData.scheduled_end_time}
                      onChange={(e) => setEditData({ ...editData, scheduled_end_time: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Assigned Driver</Label>
                  <Select 
                    value={editData.assigned_driver_id} 
                    onValueChange={(v) => setEditData({ ...editData, assigned_driver_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select driver (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No driver assigned</SelectItem>
                      {drivers.map((driver) => (
                        <SelectItem key={driver.id} value={driver.id}>
                          {driver.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Location (optional)</Label>
                  <Input
                    value={editData.appointment_location}
                    onChange={(e) => setEditData({ ...editData, appointment_location: e.target.value })}
                    placeholder="e.g., Main Workshop, 123 Service Road"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Due Mileage (km)</Label>
                  <Input
                    type="number"
                    value={editData.due_mileage_km}
                    onChange={(e) => setEditData({ ...editData, due_mileage_km: e.target.value })}
                    placeholder="e.g., 50000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Due Engine Hours</Label>
                  <Input
                    type="number"
                    value={editData.due_engine_hours}
                    onChange={(e) => setEditData({ ...editData, due_engine_hours: e.target.value })}
                    placeholder="e.g., 500"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={editData.due_date}
                  onChange={(e) => setEditData({ ...editData, due_date: e.target.value })}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Remind at Mileage (km)</Label>
                  <Input
                    type="number"
                    value={editData.remind_mileage_km}
                    onChange={(e) => setEditData({ ...editData, remind_mileage_km: e.target.value })}
                    placeholder="e.g., -500 (before due)"
                  />
                  <p className="text-xs text-muted-foreground">Negative = before due</p>
                </div>
                <div className="space-y-2">
                  <Label>Remind at Engine Hours</Label>
                  <Input
                    type="number"
                    value={editData.remind_engine_hours}
                    onChange={(e) => setEditData({ ...editData, remind_engine_hours: e.target.value })}
                    placeholder="e.g., -50"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Remind Date</Label>
                <Input
                  type="date"
                  value={editData.remind_date}
                  onChange={(e) => setEditData({ ...editData, remind_date: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={editData.notes}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  placeholder="Additional notes..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="bg-transparent">
              Cancel
            </Button>
            <Button onClick={handleEditSubmit}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Maintenance Card Component
function MaintenanceCard({
  record,
  onComplete,
  onEdit,
  onDelete,
  getStatusIcon,
  getStatusColor,
}: {
  record: MaintenanceRecordWithDetails;
  onComplete?: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  getStatusIcon: (status: MaintenanceStatus) => React.ReactNode;
  getStatusColor: (status: MaintenanceStatus) => string;
}) {
  const totalCost = record.maintenance_costs?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0;
  
  // Calculate days since expired
  const getExpiredDays = () => {
    const expiredAt = (record as any).expired_at;
    if (record.status === "expired" && expiredAt) {
      const days = Math.floor((Date.now() - new Date(expiredAt).getTime()) / (1000 * 60 * 60 * 24));
      return days;
    }
    return null;
  };
  const expiredDays = getExpiredDays();

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${getStatusColor(record.status).split(" ")[0]}`}>
              {getStatusIcon(record.status)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono">#{(record as any).maintenance_number || "—"}</span>
                <span className="font-semibold">{record.maintenance_type?.name || "Reported Issue"}</span>
                <Badge className={getStatusColor(record.status)}>
                  {record.status === "reported" ? "Driver Reported" : record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                </Badge>
                {(record as any).scheduled_start_time ? (
                  <Badge className="bg-green-500/20 text-green-400">
                    Planned
                  </Badge>
                ) : record.status !== "completed" && (
                  <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">
                    Not Planned
                  </Badge>
                )}
                {expiredDays !== null && (
                  <span className="text-xs text-red-400">
                    ({expiredDays === 0 ? "Today" : `${expiredDays} day${expiredDays !== 1 ? "s" : ""} ago`})
                  </span>
                )}
              </div>
              {/* Show scheduled time if planned */}
              {(record as any).scheduled_start_time && (
                <div className="flex items-center gap-2 text-xs text-green-400 mt-1">
                  <Calendar className="h-3 w-3" />
                  {new Date((record as any).scheduled_start_time).toLocaleDateString("en-US", { 
                    weekday: "short", month: "short", day: "numeric" 
                  })} at {new Date((record as any).scheduled_start_time).toLocaleTimeString("en-US", { 
                    hour: "2-digit", minute: "2-digit" 
                  })}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                {record.trailer_id ? <Container className="h-3 w-3" /> : <Car className="h-3 w-3" />}
                {record.vehicle?.plate_number || record.trailer?.plate_number}
                {(record.vehicle?.model || record.trailer?.trailer_type) && ` - ${record.vehicle?.model || record.trailer?.trailer_type}`}
              </div>
{/* Driver request description */}
  {(record as any).request_description && (
  <div className="mt-2 p-2 rounded bg-orange-500/10 border border-orange-500/20">
  <div className="flex items-center gap-2 text-xs text-orange-400 mb-1">
  <AlertTriangle className="h-3 w-3" />
  <span>Reported by {(record as any).reported_by_driver?.name || "Driver"}</span>
  </div>
  <p className="text-sm text-muted-foreground line-clamp-2">
  {(record as any).request_description}
  </p>
  </div>
  )}
              {/* Driver request photos */}
              {(record as any).request_photos && (record as any).request_photos.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {((record as any).request_photos as string[]).slice(0, 4).map((photo, i) => (
                    <a
                      key={i}
                      href={photo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-12 h-12 rounded-lg overflow-hidden bg-muted hover:opacity-80 transition-opacity"
                    >
                      <img
                        src={photo || "/placeholder.svg"}
                        alt={`Request photo ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                  {(record as any).request_photos.length > 4 && (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      +{(record as any).request_photos.length - 4}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                {(record as any).due_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Due: {new Date((record as any).due_date).toLocaleDateString()}
                  </span>
                )}
                {(record as any).due_mileage_km && (
                  <span className="flex items-center gap-1">
                    <Gauge className="h-3 w-3" />
                    Due: {(record as any).due_mileage_km.toLocaleString()} km
                  </span>
                )}
                {(record as any).due_engine_hours && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Due: {(record as any).due_engine_hours} hrs
                  </span>
                )}
                {record.status === "completed" && totalCost > 0 && (
                  <span className="flex items-center gap-1 text-green-400">
                    <DollarSign className="h-3 w-3" />
                    {totalCost.toFixed(2)}
                  </span>
                )}
              </div>
              {/* Current odometer from GPS */}
              {record.status !== "completed" && (record as any).current_odometer && (
                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                  <span className="flex items-center gap-1 bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                    <Gauge className="h-3 w-3" />
                    Current: {(record as any).current_odometer.toLocaleString()} km
                  </span>
                  {(record as any).current_engine_hours && (
                    <span className="flex items-center gap-1 bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                      <Clock className="h-3 w-3" />
                      Current: {(record as any).current_engine_hours} hrs
                    </span>
                  )}
                </div>
              )}
              {/* Starting values and remind thresholds */}
              {record.status !== "completed" && ((record as any).starting_odometer || (record as any).remind_mileage_km) && (
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground/70">
                  {(record as any).starting_odometer && (
                    <span>Start: {(record as any).starting_odometer.toLocaleString()} km</span>
                  )}
                  {(record as any).remind_mileage_km && (
                    <span>Remind at: {(record as any).remind_mileage_km.toLocaleString()} km</span>
                  )}
                  {(record as any).remind_engine_hours && (
                    <span>Remind at: {(record as any).remind_engine_hours} hrs</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/admin/maintenance/${record.id}`}>
              <Button variant="outline" size="sm">
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
            </Link>
            {onComplete && record.status !== "completed" && (
              <Button size="sm" onClick={onComplete}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Complete
              </Button>
            )}
            {onEdit && record.status !== "completed" && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
