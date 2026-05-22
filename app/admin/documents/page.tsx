"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAdminSession } from "@/hooks/use-admin-session";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  User,
  Car,
  AlertTriangle,
  Clock,
  CheckCircle,
  Search,
  Calendar,
  ExternalLink,
  Download,
  Filter,
  UserCircle,
  Container,
} from "lucide-react";
import type { Driver, Vehicle } from "@/lib/types";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  employee_type: string;
}

interface Trailer {
  id: string;
  plate_number: string;
  trailer_type: string | null;
  make: string | null;
  model: string | null;
}

interface DocumentType {
  id: string;
  name: string;
  applies_to: string;
  requires_expiry: boolean;
}

interface Document {
  id: string;
  document_type_id: string;
  document_type: DocumentType;
  driver_id: string | null;
  vehicle_id: string | null;
  employee_id: string | null;
  trailer_id: string | null;
  file_url: string;
  file_name: string;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
  driver?: Driver;
  vehicle?: Vehicle;
  employee?: Employee;
  trailer?: Trailer;
}

export default function DocumentsOverviewPage() {
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedEntityType, setSelectedEntityType] = useState("all");

  useEffect(() => {
    if (adminSession?.id) {
      fetchData();
    }
  }, [adminSession?.id]);

  const fetchData = async () => {
    const supabase = createClient();

    // Fetch document types
    const { data: typesData } = await supabase
      .from("document_types")
      .select("*")
      .eq("admin_id", adminSession!.id)
      .order("name");

    if (typesData) {
      setDocumentTypes(typesData);
    }

    // Fetch drivers
    const { data: driversData } = await supabase
      .from("drivers")
      .select("*")
      .eq("admin_id", adminSession!.id);

    if (driversData) {
      setDrivers(driversData);
    }

    // Fetch vehicles
    const { data: vehiclesData } = await supabase
      .from("vehicles")
      .select("*")
      .eq("admin_id", adminSession!.id);

    if (vehiclesData) {
      setVehicles(vehiclesData);
    }

    // Fetch employees (non-drivers only - drivers use driver_id)
    const { data: employeesData } = await supabase
      .from("employees")
      .select("id, first_name, last_name, email, employee_type")
      .eq("admin_id", adminSession!.id)
      .neq("employee_type", "driver");

    if (employeesData) {
      setEmployees(employeesData);
    }

    // Fetch trailers
    const { data: trailersData } = await supabase
      .from("trailers")
      .select("id, plate_number, trailer_type, make, model")
      .eq("admin_id", adminSession!.id);

    if (trailersData) {
      setTrailers(trailersData);
    }

    // Fetch all documents
    const { data: docsData } = await supabase
      .from("documents")
      .select("*, document_type:document_types(*)")
      .eq("admin_id", adminSession!.id)
      .order("expiry_date", { ascending: true, nullsFirst: false });

    if (docsData) {
      // Attach entity data
      const enrichedDocs = docsData.map((doc) => ({
        ...doc,
        driver: doc.driver_id ? driversData?.find((d) => d.id === doc.driver_id) : undefined,
        vehicle: doc.vehicle_id ? vehiclesData?.find((v) => v.id === doc.vehicle_id) : undefined,
        employee: doc.employee_id ? employeesData?.find((e) => e.id === doc.employee_id) : undefined,
        trailer: doc.trailer_id ? trailersData?.find((t) => t.id === doc.trailer_id) : undefined,
      }));
      setDocuments(enrichedDocs as Document[]);
    }

    setLoading(false);
  };

  const getDocumentStatus = (doc: Document) => {
    if (!doc.document_type?.requires_expiry || !doc.expiry_date) {
      return { status: "valid", label: "Valid", color: "bg-green-500/20 text-green-400", priority: 3 };
    }

    const today = new Date();
    const expiry = new Date(doc.expiry_date);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { status: "expired", label: "Expired", color: "bg-red-500/20 text-red-400", priority: 1 };
    } else if (daysUntilExpiry <= 30) {
      return { status: "expiring", label: `${daysUntilExpiry}d`, color: "bg-yellow-500/20 text-yellow-400", priority: 2 };
    }
    return { status: "valid", label: "Valid", color: "bg-green-500/20 text-green-400", priority: 3 };
  };

  const filteredDocuments = documents.filter((doc) => {
    const status = getDocumentStatus(doc);
    
    // Status filter
    if (selectedStatus !== "all" && status.status !== selectedStatus) return false;
    
    // Type filter
    if (selectedType !== "all" && doc.document_type_id !== selectedType) return false;
    
    // Entity type filter
    if (selectedEntityType === "driver" && !doc.driver_id) return false;
    if (selectedEntityType === "vehicle" && !doc.vehicle_id) return false;
    if (selectedEntityType === "employee" && !doc.employee_id) return false;
    if (selectedEntityType === "trailer" && !doc.trailer_id) return false;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const driverName = doc.driver?.name?.toLowerCase() || "";
      const vehiclePlate = doc.vehicle?.plate_number?.toLowerCase() || "";
      const employeeName = doc.employee ? `${doc.employee.first_name} ${doc.employee.last_name}`.toLowerCase() : "";
      const trailerPlate = doc.trailer?.plate_number?.toLowerCase() || "";
      const typeName = doc.document_type?.name?.toLowerCase() || "";
      const notes = doc.notes?.toLowerCase() || "";
      
      if (!driverName.includes(query) && !vehiclePlate.includes(query) && !employeeName.includes(query) && !trailerPlate.includes(query) && !typeName.includes(query) && !notes.includes(query)) {
        return false;
      }
    }
    
    return true;
  });

  const expiredDocs = documents.filter((d) => getDocumentStatus(d).status === "expired");
  const expiringDocs = documents.filter((d) => getDocumentStatus(d).status === "expiring");
  const validDocs = documents.filter((d) => getDocumentStatus(d).status === "valid");

  // Helper to get entity info
  const getEntityInfo = (doc: Document) => {
    if (doc.driver_id) {
      return { type: "driver", id: doc.driver_id, name: doc.driver?.name };
    }
    if (doc.vehicle_id) {
      return { type: "vehicle", id: doc.vehicle_id, name: doc.vehicle?.plate_number };
    }
    if (doc.trailer_id) {
      return { type: "trailer", id: doc.trailer_id, name: doc.trailer?.plate_number };
    }
    if (doc.employee_id) {
      return { type: "employee", id: doc.employee_id, name: doc.employee ? `${doc.employee.first_name} ${doc.employee.last_name}` : undefined };
    }
    return { type: "unknown", id: "", name: undefined };
  };

  // Group by entity for the alerts view
  const expiredByEntity = expiredDocs.reduce((acc, doc) => {
    const entity = getEntityInfo(doc);
    const key = `${entity.type}-${entity.id}`;
    if (!acc[key]) {
      acc[key] = {
        entity_type: entity.type,
        entity_id: entity.id,
        entity_name: entity.name,
        documents: [],
      };
    }
    acc[key].documents.push(doc);
    return acc;
  }, {} as Record<string, { entity_type: string; entity_id: string; entity_name?: string; documents: Document[] }>);

  const expiringByEntity = expiringDocs.reduce((acc, doc) => {
    const entity = getEntityInfo(doc);
    const key = `${entity.type}-${entity.id}`;
    if (!acc[key]) {
      acc[key] = {
        entity_type: entity.type,
        entity_id: entity.id,
        entity_name: entity.name,
        documents: [],
      };
    }
    acc[key].documents.push(doc);
    return acc;
  }, {} as Record<string, { entity_type: string; entity_id: string; entity_name?: string; documents: Document[] }>);

  if (sessionLoading || loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents Overview</h1>
          <p className="text-muted-foreground">
            Monitor document status across all drivers and vehicles
          </p>
        </div>
        {adminSession?.permissions?.["documents:types:manage"] !== false && (adminSession?.isOwner || !adminSession?.user_id || adminSession?.permissions?.["documents:types:manage"]) && (
          <Link href="/admin/document-types">
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Manage Document Types
            </Button>
          </Link>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{documents.length}</p>
                <p className="text-sm text-muted-foreground">Total Documents</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <CheckCircle className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">{validDocs.length}</p>
                <p className="text-sm text-muted-foreground">Valid</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-yellow-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/20">
                <Clock className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-400">{expiringDocs.length}</p>
                <p className="text-sm text-muted-foreground">Expiring Soon</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">{expiredDocs.length}</p>
                <p className="text-sm text-muted-foreground">Expired</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      {(expiredDocs.length > 0 || expiringDocs.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Expired */}
          {Object.keys(expiredByEntity).length > 0 && (
            <Card className="border-red-500/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  Expired Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.values(expiredByEntity).map((entity) => (
                  <Link
                    key={`${entity.entity_type}-${entity.entity_id}`}
                    href={entity.entity_type === "employee" ? `/admin/employees` : `/admin/${entity.entity_type}s/${entity.entity_id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-red-500/20 hover:bg-red-500/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {entity.entity_type === "driver" ? (
                        <User className="h-5 w-5 text-muted-foreground" />
                      ) : entity.entity_type === "employee" ? (
                        <UserCircle className="h-5 w-5 text-muted-foreground" />
                      ) : entity.entity_type === "trailer" ? (
                        <Container className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <Car className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{entity.entity_name}</p>
                        <p className="text-sm text-red-400">
                          {entity.documents.length} expired document{entity.documents.length > 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Expiring Soon */}
          {Object.keys(expiringByEntity).length > 0 && (
            <Card className="border-yellow-500/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-yellow-400">
                  <Clock className="h-4 w-4" />
                  Expiring Soon (30 days)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.values(expiringByEntity).map((entity) => (
                  <Link
                    key={`${entity.entity_type}-${entity.entity_id}`}
                    href={entity.entity_type === "employee" ? `/admin/employees` : `/admin/${entity.entity_type}s/${entity.entity_id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-yellow-500/20 hover:bg-yellow-500/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {entity.entity_type === "driver" ? (
                        <User className="h-5 w-5 text-muted-foreground" />
                      ) : entity.entity_type === "employee" ? (
                        <UserCircle className="h-5 w-5 text-muted-foreground" />
                      ) : entity.entity_type === "trailer" ? (
                        <Container className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <Car className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{entity.entity_name}</p>
                        <p className="text-sm text-yellow-400">
                          {entity.documents.length} expiring document{entity.documents.length > 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* All Documents Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Documents</CardTitle>
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, plate, document..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="valid">Valid</SelectItem>
                <SelectItem value="expiring">Expiring</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedEntityType} onValueChange={setSelectedEntityType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                <SelectItem value="driver">Drivers</SelectItem>
                <SelectItem value="vehicle">Vehicles</SelectItem>
                <SelectItem value="trailer">Trailers</SelectItem>
                <SelectItem value="employee">Employees</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Document Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {documentTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No documents found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDocuments.map((doc) => {
                const status = getDocumentStatus(doc);
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-muted">
                        {doc.driver_id ? (
                          <User className="h-5 w-5" />
                        ) : doc.employee_id ? (
                          <UserCircle className="h-5 w-5" />
                        ) : doc.trailer_id ? (
                          <Container className="h-5 w-5" />
                        ) : (
                          <Car className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={doc.driver_id ? `/admin/drivers/${doc.driver_id}` : doc.employee_id ? `/admin/employees` : doc.trailer_id ? `/admin/trailers/${doc.trailer_id}` : `/admin/vehicles/${doc.vehicle_id}`}
                            className="font-medium hover:underline"
                          >
                            {doc.driver?.name || (doc.employee ? `${doc.employee.first_name} ${doc.employee.last_name}` : doc.trailer?.plate_number || doc.vehicle?.plate_number)}
                          </Link>
                          <Badge variant="outline" className="text-xs">
                            {doc.driver_id ? "driver" : doc.employee_id ? "employee" : doc.trailer_id ? "trailer" : "vehicle"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{doc.document_type?.name}</span>
                          {doc.notes && (
                            <>
                              <span>•</span>
                              <span>{doc.notes}</span>
                            </>
                          )}
                        </div>
                        {doc.expiry_date && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <Calendar className="h-3 w-3" />
                            Expires: {new Date(doc.expiry_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={status.color}>{status.label}</Badge>
                      <a href={doc.file_url} download={doc.file_name}>
                        <Button variant="ghost" size="icon">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                      <Link href={doc.driver_id ? `/admin/drivers/${doc.driver_id}` : doc.employee_id ? `/admin/employees` : doc.trailer_id ? `/admin/trailers/${doc.trailer_id}` : `/admin/vehicles/${doc.vehicle_id}`}>
                        <Button variant="ghost" size="icon">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
