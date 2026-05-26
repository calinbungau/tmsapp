"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminSession } from "@/hooks/use-admin-session";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Inbox,
  MoreVertical,
  Package,
  Receipt,
  RefreshCw,
  Route,
  Search,
  Settings,
  Truck,
  User,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow, addDays, addHours } from "date-fns";

interface ActionCenterItem {
  id: string;
  admin_id: string;
  definition_id: string;
  code: string;
  category: string;
  subject_type: string;
  subject_id: string;
  scope_key: string;
  title: string;
  body: string | null;
  payload: Record<string, any>;
  severity: "critical" | "high" | "medium" | "low";
  status: "open" | "snoozed" | "done" | "dismissed" | "auto_resolved";
  assignee_user_id: string | null;
  assignee_role: string | null;
  due_at: string | null;
  snoozed_until: string | null;
  dismissed_reason: string | null;
  resolution_url: string | null;
  first_seen_at: string;
  last_seen_at: string;
  completed_at: string | null;
  completed_by: string | null;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
  assignee?: { id: string; email: string; employee?: { first_name: string | null; last_name: string | null } | null } | null;
}

const SEVERITY_CONFIG = {
  critical: { label: "Critical", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertTriangle },
  high: { label: "High", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: AlertTriangle },
  medium: { label: "Medium", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Clock },
  low: { label: "Low", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Bell },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Package }> = {
  orders: { label: "Orders", icon: Package },
  trips: { label: "Trips", icon: Route },
  finance: { label: "Finance", icon: Receipt },
  fleet: { label: "Fleet", icon: Truck },
};

export default function ActionCenterPage() {
  const { session: adminSession, loading: sessionLoading } = useAdminSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<ActionCenterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [snoozeTarget, setSnoozeTarget] = useState<string | "bulk" | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("open");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [selectedAssignee, setSelectedAssignee] = useState<string>("all");

  // Stats
  const [stats, setStats] = useState<{
    total: number;
    by_severity: Record<string, number>;
    by_category: Record<string, number>;
  } | null>(null);

  const fetchItems = useCallback(async () => {
    if (!adminSession?.id) return;

    const params = new URLSearchParams({
      admin_id: adminSession.id,
    });

    if (selectedStatus !== "all") {
      params.set("status", selectedStatus);
    }
    if (selectedCategory !== "all") {
      params.set("category", selectedCategory);
    }
    if (selectedSeverity !== "all") {
      params.set("severity", selectedSeverity);
    }
    if (selectedAssignee === "me" && adminSession.user_id) {
      params.set("assignee_user_id", adminSession.user_id);
    } else if (selectedAssignee === "unassigned") {
      params.set("assignee_user_id", "unassigned");
    }

    const res = await fetch(`/api/admin/action-center/items?${params}`);
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }, [adminSession?.id, adminSession?.user_id, selectedStatus, selectedCategory, selectedSeverity, selectedAssignee]);

  const fetchStats = useCallback(async () => {
    if (!adminSession?.id) return;
    const params = new URLSearchParams({ admin_id: adminSession.id });
    if (adminSession.user_id) {
      params.set("user_id", adminSession.user_id);
    }
    const res = await fetch(`/api/admin/action-center/stats?${params}`);
    const data = await res.json();
    setStats(data.stats || null);
  }, [adminSession?.id, adminSession?.user_id]);

  useEffect(() => {
    if (adminSession?.id) {
      fetchItems();
      fetchStats();
    }
  }, [adminSession?.id, fetchItems, fetchStats]);

  // Realtime subscription
  useEffect(() => {
    if (!adminSession?.id) return;

    const supabase = createClient();
    const channel = supabase
      .channel("action-center-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "action_center_items",
          filter: `admin_id=eq.${adminSession.id}`,
        },
        () => {
          // Refetch on any change
          fetchItems();
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminSession?.id, fetchItems, fetchStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Trigger detector run
    await fetch(`/api/admin/action-center/items?admin_id=${adminSession?.id}`, {
      method: "POST",
    });
    await fetchItems();
    await fetchStats();
    setRefreshing(false);
  };

  const handleAction = async (itemId: string, action: string, extra?: Record<string, any>) => {
    if (!adminSession?.id) return;

    const params = new URLSearchParams({ admin_id: adminSession.id });
    if (adminSession.user_id) {
      params.set("user_id", adminSession.user_id);
    }

    await fetch(`/api/admin/action-center/items/${itemId}?${params}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });

    await fetchItems();
    await fetchStats();
  };

  const handleBulkAction = async (action: string, extra?: Record<string, any>) => {
    if (!adminSession?.id || selectedItems.size === 0) return;

    const params = new URLSearchParams({ admin_id: adminSession.id });
    if (adminSession.user_id) {
      params.set("user_id", adminSession.user_id);
    }

    await fetch(`/api/admin/action-center/bulk?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_ids: Array.from(selectedItems),
        action,
        ...extra,
      }),
    });

    setSelectedItems(new Set());
    await fetchItems();
    await fetchStats();
  };

  const handleSnooze = async (duration: string) => {
    let snoozeUntil: Date;
    switch (duration) {
      case "1h":
        snoozeUntil = addHours(new Date(), 1);
        break;
      case "4h":
        snoozeUntil = addHours(new Date(), 4);
        break;
      case "1d":
        snoozeUntil = addDays(new Date(), 1);
        break;
      case "1w":
        snoozeUntil = addDays(new Date(), 7);
        break;
      default:
        snoozeUntil = addDays(new Date(), 1);
    }

    if (snoozeTarget === "bulk") {
      await handleBulkAction("snooze", { snooze_until: snoozeUntil.toISOString() });
    } else if (snoozeTarget) {
      await handleAction(snoozeTarget, "snooze", { snooze_until: snoozeUntil.toISOString() });
    }

    setSnoozeDialogOpen(false);
    setSnoozeTarget(null);
  };

  const filteredItems = items.filter((item) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !item.title.toLowerCase().includes(q) &&
        !item.body?.toLowerCase().includes(q) &&
        !item.code.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  // Group by severity for kanban view
  const itemsBySeverity = {
    critical: filteredItems.filter((i) => i.severity === "critical"),
    high: filteredItems.filter((i) => i.severity === "high"),
    medium: filteredItems.filter((i) => i.severity === "medium"),
    low: filteredItems.filter((i) => i.severity === "low"),
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const toggleSelectItem = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedItems(newSet);
  };

  if (sessionLoading || loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="h-96 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Action Center</h1>
          <p className="text-muted-foreground">
            Proactive alerts and tasks that need your attention
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link href="/admin/settings/action-center">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Configure Rules
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">{stats?.by_severity?.critical || 0}</p>
                <p className="text-sm text-muted-foreground">Critical</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <AlertTriangle className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-400">{stats?.by_severity?.high || 0}</p>
                <p className="text-sm text-muted-foreground">High</p>
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
                <p className="text-2xl font-bold text-yellow-400">{stats?.by_severity?.medium || 0}</p>
                <p className="text-sm text-muted-foreground">Medium</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Bell className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-400">{stats?.by_severity?.low || 0}</p>
                <p className="text-sm text-muted-foreground">Low</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search alerts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="snoozed">Snoozed</SelectItem>
            <SelectItem value="open,snoozed">All Active</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
            <SelectItem value="auto_resolved">Auto-resolved</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="orders">Orders</SelectItem>
            <SelectItem value="trips">Trips</SelectItem>
            <SelectItem value="finance">Finance</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="me">Assigned to Me</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Actions */}
      {selectedItems.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg border">
          <span className="text-sm font-medium">{selectedItems.size} selected</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSnoozeTarget("bulk");
                setSnoozeDialogOpen(true);
              }}
            >
              <Clock className="h-4 w-4 mr-1" />
              Snooze
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction("complete")}>
              <Check className="h-4 w-4 mr-1" />
              Done
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction("dismiss")}>
              <XCircle className="h-4 w-4 mr-1" />
              Dismiss
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSelectedItems(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Items List */}
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">List View</TabsTrigger>
          <TabsTrigger value="kanban">Severity Kanban</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardContent className="p-0">
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                  <p className="text-lg font-medium">All clear!</p>
                  <p className="text-muted-foreground">No items need your attention right now.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {/* Header */}
                  <div className="flex items-center gap-4 p-4 bg-muted/30">
                    <Checkbox
                      checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                    <span className="text-sm text-muted-foreground">
                      {filteredItems.length} items
                    </span>
                  </div>

                  {/* Items */}
                  {filteredItems.map((item) => (
                    <ActionCenterItemRow
                      key={item.id}
                      item={item}
                      selected={selectedItems.has(item.id)}
                      onSelect={() => toggleSelectItem(item.id)}
                      onAction={(action, extra) => handleAction(item.id, action, extra)}
                      onSnooze={() => {
                        setSnoozeTarget(item.id);
                        setSnoozeDialogOpen(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kanban">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(["critical", "high", "medium", "low"] as const).map((severity) => {
              const config = SEVERITY_CONFIG[severity];
              const severityItems = itemsBySeverity[severity];
              return (
                <div key={severity} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={config.color}>
                      {config.label}
                    </Badge>
                    <span className="text-sm text-muted-foreground">({severityItems.length})</span>
                  </div>
                  <div className="space-y-2">
                    {severityItems.map((item) => (
                      <Card key={item.id} className="p-3">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{item.title}</p>
                            {item.body && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.body}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {CATEGORY_CONFIG[item.category]?.label || item.category}
                              </Badge>
                              {item.due_at && (
                                <span className="text-xs text-muted-foreground">
                                  Due {formatDistanceToNow(new Date(item.due_at), { addSuffix: true })}
                                </span>
                              )}
                            </div>
                          </div>
                          {item.resolution_url && (
                            <Link href={item.resolution_url}>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </Card>
                    ))}
                    {severityItems.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No items
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Snooze Dialog */}
      <Dialog open={snoozeDialogOpen} onOpenChange={setSnoozeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Snooze Alert</DialogTitle>
            <DialogDescription>
              Choose how long to snooze {snoozeTarget === "bulk" ? "selected alerts" : "this alert"}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <Button variant="outline" onClick={() => handleSnooze("1h")}>
              1 hour
            </Button>
            <Button variant="outline" onClick={() => handleSnooze("4h")}>
              4 hours
            </Button>
            <Button variant="outline" onClick={() => handleSnooze("1d")}>
              1 day
            </Button>
            <Button variant="outline" onClick={() => handleSnooze("1w")}>
              1 week
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ActionCenterItemRowProps {
  item: ActionCenterItem;
  selected: boolean;
  onSelect: () => void;
  onAction: (action: string, extra?: Record<string, any>) => void;
  onSnooze: () => void;
}

function ActionCenterItemRow({ item, selected, onSelect, onAction, onSnooze }: ActionCenterItemRowProps) {
  const config = SEVERITY_CONFIG[item.severity];
  const categoryConfig = CATEGORY_CONFIG[item.category];
  const CategoryIcon = categoryConfig?.icon || Package;

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
      <Checkbox checked={selected} onCheckedChange={onSelect} />

      <div className={`p-2 rounded-lg ${config.color.split(" ")[0]}`}>
        <config.icon className={`h-4 w-4 ${config.color.split(" ")[1]}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{item.title}</p>
          {item.status === "snoozed" && (
            <Badge variant="outline" className="text-xs">
              <EyeOff className="h-3 w-3 mr-1" />
              Snoozed
            </Badge>
          )}
        </div>
        {item.body && (
          <p className="text-sm text-muted-foreground line-clamp-1">{item.body}</p>
        )}
        <div className="flex items-center gap-3 mt-1">
          <Badge variant="outline" className="text-xs">
            <CategoryIcon className="h-3 w-3 mr-1" />
            {categoryConfig?.label || item.category}
          </Badge>
          <span className="text-xs text-muted-foreground">
            First seen {formatDistanceToNow(new Date(item.first_seen_at), { addSuffix: true })}
          </span>
          {item.due_at && (
            <span className="text-xs text-muted-foreground">
              Due {formatDistanceToNow(new Date(item.due_at), { addSuffix: true })}
            </span>
          )}
          {item.assignee && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" />
              {[item.assignee.employee?.first_name, item.assignee.employee?.last_name].filter(Boolean).join(" ") || item.assignee.email}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {item.resolution_url && (
          <Link href={item.resolution_url}>
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-1" />
              Open
            </Button>
          </Link>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onSnooze}>
              <Clock className="h-4 w-4 mr-2" />
              Snooze
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("complete")}>
              <Check className="h-4 w-4 mr-2" />
              Mark as Done
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("dismiss")}>
              <XCircle className="h-4 w-4 mr-2" />
              Dismiss
            </DropdownMenuItem>
            {item.status !== "open" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onAction("reopen")}>
                  <Eye className="h-4 w-4 mr-2" />
                  Reopen
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
