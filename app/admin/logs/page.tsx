"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Play, CheckCircle, XCircle, AlertTriangle, Clock, ChevronDown, ChevronRight } from "lucide-react";

interface CronLog {
  id: string;
  job_name: string;
  status: "success" | "error" | "partial" | "running";
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  details: {
    logs?: string[];
    errors?: string[];
    vehiclesProcessed?: number;
    maintenanceUpdated?: number;
  } | null;
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<CronLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningJob, setRunningJob] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => {
    const adminSession = localStorage.getItem("admin_session");
    if (!adminSession) {
      router.push("/admin/login");
      return;
    }
    fetchLogs();
  }, [router]);

  const fetchLogs = async () => {
    setLoading(true);
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from("cron_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100);

    if (!error && data) {
      setLogs(data);
    }
    setLoading(false);
  };

  const runMaintenanceCheck = async () => {
    const adminSession = localStorage.getItem("admin_session");
    if (!adminSession) {
      alert("Not logged in");
      return;
    }
    const admin = JSON.parse(adminSession);
    
    setRunningJob(true);
    try {
      const response = await fetch("/api/admin/run-maintenance-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_id: admin.id }),
      });
      const result = await response.json();
      
      if (response.ok) {
        alert(`Job completed!\nVehicles processed: ${result.vehiclesProcessed}\nMaintenance updated: ${result.maintenanceUpdated}`);
      } else {
        alert(`Job failed: ${result.error}\n\nLogs:\n${result.logs?.join('\n') || 'No logs'}\n\nErrors:\n${result.errors?.join('\n') || 'No errors'}`);
      }
      
      fetchLogs();
    } catch (error) {
      alert("Failed to run job");
    } finally {
      setRunningJob(false);
    }
  };

  const toggleExpanded = (logId: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle className="h-3 w-3 mr-1" />Success</Badge>;
      case "error":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20"><XCircle className="h-3 w-3 mr-1" />Error</Badge>;
      case "partial":
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20"><AlertTriangle className="h-3 w-3 mr-1" />Partial</Badge>;
      case "running":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Clock className="h-3 w-3 mr-1" />Running</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getJobDisplayName = (jobName: string) => {
    switch (jobName) {
      case "maintenance_check":
        return "Maintenance Status Check";
      default:
        return jobName;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Background Job Logs</h1>
          <p className="text-muted-foreground">Monitor and manage scheduled background jobs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Manual Job Runners */}
      <Card>
        <CardHeader>
          <CardTitle>Run Jobs Manually</CardTitle>
          <CardDescription>Trigger background jobs manually for testing or immediate execution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={runMaintenanceCheck} disabled={runningJob}>
              <Play className="h-4 w-4 mr-2" />
              {runningJob ? "Running..." : "Run Maintenance Check"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            The maintenance check job fetches current odometer/engine hours from Traccar and updates maintenance status accordingly.
            It should be scheduled to run every 30 minutes via Vercel Cron.
          </p>
        </CardContent>
      </Card>

      {/* Cron Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Cron Setup</CardTitle>
          <CardDescription>Configure automatic job scheduling</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Add to vercel.json:</p>
            <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
{`{
  "crons": [
    {
      "path": "/api/cron/maintenance-check",
      "schedule": "*/30 * * * *"
    }
  ]
}`}
            </pre>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Environment Variable (optional for security):</p>
            <pre className="bg-muted p-3 rounded-md text-xs">
              CRON_SECRET=your-secret-here
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Execution History</CardTitle>
          <CardDescription>Last 100 job executions</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No job executions yet</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="border rounded-lg">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleExpanded(log.id)}
                  >
                    <div className="flex items-center gap-4">
                      {expandedLogs.has(log.id) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{getJobDisplayName(log.job_name)}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.started_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        {formatDuration(log.duration_ms)}
                      </span>
                      {getStatusBadge(log.status)}
                    </div>
                  </div>
                  
                  {expandedLogs.has(log.id) && log.details && (
                    <div className="border-t p-4 bg-muted/30">
                      {log.details.vehiclesProcessed !== undefined && (
                        <div className="flex gap-6 mb-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Vehicles Processed:</span>{" "}
                            <span className="font-medium">{log.details.vehiclesProcessed}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Maintenance Updated:</span>{" "}
                            <span className="font-medium">{log.details.maintenanceUpdated}</span>
                          </div>
                        </div>
                      )}
                      
                      {log.details.logs && log.details.logs.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-medium mb-2">Logs:</p>
                          <pre className="bg-background p-3 rounded-md text-xs max-h-60 overflow-auto whitespace-pre-wrap">
                            {log.details.logs.join("\n")}
                          </pre>
                        </div>
                      )}
                      
                      {log.details.errors && log.details.errors.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2 text-red-500">Errors:</p>
                          <pre className="bg-red-500/10 p-3 rounded-md text-xs max-h-40 overflow-auto whitespace-pre-wrap text-red-500">
                            {log.details.errors.join("\n")}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
