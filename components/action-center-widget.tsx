"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAdminSession } from "@/hooks/use-admin-session";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Clock,
  Package,
  Receipt,
  Route,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActionCenterItem {
  id: string;
  code: string;
  category: string;
  title: string;
  body: string | null;
  severity: "critical" | "high" | "medium" | "low";
  resolution_url: string | null;
  first_seen_at: string;
}

interface ActionCenterStats {
  total: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  assigned_to_me: number;
}

const SEVERITY_CONFIG = {
  critical: { label: "Critical", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  high: { label: "High", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  medium: { label: "Medium", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  low: { label: "Low", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

const CATEGORY_ICONS: Record<string, typeof Package> = {
  orders: Package,
  trips: Route,
  finance: Receipt,
};

interface ActionCenterWidgetProps {
  /** Max items to show in the widget */
  limit?: number;
  /** Filter to only show items assigned to current user */
  showMyItemsOnly?: boolean;
  /** Compact mode - smaller footprint */
  compact?: boolean;
}

export function ActionCenterWidget({
  limit = 5,
  showMyItemsOnly = false,
  compact = false,
}: ActionCenterWidgetProps) {
  const { session: adminSession } = useAdminSession();
  const [items, setItems] = useState<ActionCenterItem[]>([]);
  const [stats, setStats] = useState<ActionCenterStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!adminSession?.id) return;

    const params = new URLSearchParams({
      admin_id: adminSession.id,
      status: "open",
    });

    if (showMyItemsOnly && adminSession.user_id) {
      params.set("assignee_user_id", adminSession.user_id);
    }

    // Fetch items
    const itemsRes = await fetch(`/api/admin/action-center/items?${params}`);
    const itemsData = await itemsRes.json();
    setItems((itemsData.items || []).slice(0, limit));

    // Fetch stats
    const statsParams = new URLSearchParams({ admin_id: adminSession.id });
    if (adminSession.user_id) {
      statsParams.set("user_id", adminSession.user_id);
    }
    const statsRes = await fetch(`/api/admin/action-center/stats?${statsParams}`);
    const statsData = await statsRes.json();
    setStats(statsData.stats || null);

    setLoading(false);
  }, [adminSession?.id, adminSession?.user_id, limit, showMyItemsOnly]);

  useEffect(() => {
    if (adminSession?.id) {
      fetchData();
    }
  }, [adminSession?.id, fetchData]);

  // Realtime subscription
  useEffect(() => {
    if (!adminSession?.id) return;

    const supabase = createClient();
    const channel = supabase
      .channel("action-center-widget")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "action_center_items",
          filter: `admin_id=eq.${adminSession.id}`,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminSession?.id, fetchData]);

  if (loading) {
    return (
      <Card className={compact ? "h-full" : ""}>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            <div className="h-12 bg-muted animate-pulse rounded" />
            <div className="h-12 bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const criticalCount = stats?.by_severity?.critical || 0;
  const highCount = stats?.by_severity?.high || 0;
  const totalActive = stats?.total || 0;

  if (compact) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Action Center</span>
            </div>
            {totalActive > 0 && (
              <Badge variant="outline" className="text-xs">
                {totalActive}
              </Badge>
            )}
          </div>

          {totalActive === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">
              All clear!
            </p>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                {criticalCount > 0 && (
                  <Badge variant="outline" className={SEVERITY_CONFIG.critical.color}>
                    {criticalCount} Critical
                  </Badge>
                )}
                {highCount > 0 && (
                  <Badge variant="outline" className={SEVERITY_CONFIG.high.color}>
                    {highCount} High
                  </Badge>
                )}
              </div>
              <Link href="/admin/action-center">
                <Button variant="outline" size="sm" className="w-full">
                  View All
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Action Center
          </CardTitle>
          <Link href="/admin/action-center">
            <Button variant="ghost" size="sm" className="text-xs">
              View All
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>

        {/* Stats summary */}
        {stats && totalActive > 0 && (
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-xs text-muted-foreground">
                {criticalCount} critical
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-orange-500" />
              <span className="text-xs text-muted-foreground">
                {highCount} high
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {totalActive} total
              </span>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-6">
            <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">All clear!</p>
            <p className="text-xs text-muted-foreground/60">
              No items need your attention
            </p>
          </div>
        ) : (
          items.map((item) => {
            const config = SEVERITY_CONFIG[item.severity];
            const CategoryIcon = CATEGORY_ICONS[item.category] || Bell;

            return (
              <Link
                key={item.id}
                href={item.resolution_url || `/admin/action-center?item=${item.id}`}
                className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className={`p-1.5 rounded-md ${config.color.split(" ")[0]}`}>
                  <CategoryIcon className={`h-3.5 w-3.5 ${config.color.split(" ")[1]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  {item.body && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {item.body}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className={`text-[10px] ${config.color}`}>
                      {config.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(item.first_seen_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
