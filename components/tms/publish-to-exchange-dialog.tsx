"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Globe,
  Users,
  Lock,
  Send,
  Folder,
  Sparkles,
} from "lucide-react";

interface CarrierGroup {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  group_type: "static" | "dynamic";
  member_count?: number;
}

interface PublishToExchangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offerId: string;
  offerReference: string;
  adminId: string;
  onPublished?: () => void;
}

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  green: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  red: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
};

export function PublishToExchangeDialog({
  open,
  onOpenChange,
  offerId,
  offerReference,
  adminId,
  onPublished,
}: PublishToExchangeDialogProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [groups, setGroups] = useState<CarrierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [publishPublic, setPublishPublic] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  const fetchGroups = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);
    try {
      const { data: groupsData, error } = await supabase
        .from("carrier_groups")
        .select("*")
        .eq("admin_id", adminId)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;

      // member counts for static groups
      const { data: membersData } = await supabase
        .from("carrier_group_members")
        .select("group_id");
      const memberCounts: Record<string, number> = {};
      membersData?.forEach((m: { group_id: string }) => {
        memberCounts[m.group_id] = (memberCounts[m.group_id] || 0) + 1;
      });

      setGroups(
        (groupsData || []).map((g: CarrierGroup) => ({
          ...g,
          member_count: memberCounts[g.id] || 0,
        }))
      );
    } catch (err) {
      console.error("Failed to load carrier groups:", err);
      toast({
        title: "Error",
        description: "Failed to load carrier groups",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [adminId, supabase, toast]);

  // Load existing active distributions to pre-select
  const fetchExisting = useCallback(async () => {
    if (!offerId) return;
    const { data } = await supabase
      .from("freight_offer_distributions")
      .select("channel, group_id")
      .eq("offer_id", offerId)
      .eq("status", "active");
    if (data) {
      setSelectedGroupIds(
        data.filter((d: { group_id: string | null }) => d.group_id).map((d: { group_id: string }) => d.group_id)
      );
      setPublishPublic(data.some((d: { channel: string }) => d.channel === "public"));
    }
  }, [offerId, supabase]);

  useEffect(() => {
    if (open) {
      fetchGroups();
      fetchExisting();
    } else {
      setSelectedGroupIds([]);
      setPublishPublic(false);
      setExpiresAt("");
    }
  }, [open, fetchGroups, fetchExisting]);

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const totalTargets = selectedGroupIds.length + (publishPublic ? 1 : 0);

  const handlePublish = async () => {
    if (totalTargets === 0) {
      toast({
        title: "Select a destination",
        description: "Choose at least one carrier group or the public board.",
        variant: "destructive",
      });
      return;
    }

    setPublishing(true);
    try {
      // Build distribution rows
      const rows: Array<{
        admin_id: string;
        offer_id: string;
        channel: string;
        group_id: string | null;
        tier: number;
      }> = [];

      selectedGroupIds.forEach((gid, idx) => {
        rows.push({
          admin_id: adminId,
          offer_id: offerId,
          channel: "group",
          group_id: gid,
          tier: idx + 1,
        });
      });

      if (publishPublic) {
        rows.push({
          admin_id: adminId,
          offer_id: offerId,
          channel: "public",
          group_id: null,
          tier: selectedGroupIds.length + 1,
        });
      }

      // Upsert: remove existing active distributions first, then insert fresh
      await supabase
        .from("freight_offer_distributions")
        .delete()
        .eq("offer_id", offerId);

      const { error: insertError } = await supabase
        .from("freight_offer_distributions")
        .insert(rows);
      if (insertError) throw insertError;

      // Update offer: status -> published, visibility, published_at, expires_at
      const visibility = publishPublic ? "public" : "private";
      const update: Record<string, unknown> = {
        status: "published",
        visibility,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (expiresAt) update.expires_at = new Date(expiresAt).toISOString();

      const { error: offerError } = await supabase
        .from("freight_offers")
        .update(update)
        .eq("id", offerId);
      if (offerError) throw offerError;

      toast({
        title: "Offer published",
        description: `${offerReference} published to ${totalTargets} destination${totalTargets > 1 ? "s" : ""}.`,
      });
      onOpenChange(false);
      onPublished?.();
    } catch (err) {
      console.error("Failed to publish offer:", err);
      toast({
        title: "Error",
        description: "Failed to publish offer. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Publish to Freight Exchange
          </DialogTitle>
          <DialogDescription>
            Choose where to publish offer{" "}
            <span className="font-mono font-medium text-foreground">{offerReference}</span>.
            Private groups stay within your network; Public is visible to all carriers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Public board option */}
          <button
            type="button"
            onClick={() => setPublishPublic((v) => !v)}
            className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
              publishPublic
                ? "border-blue-500/40 bg-blue-500/5"
                : "border-border/60 hover:border-border"
            }`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Globe className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Public Board</p>
              <p className="text-xs text-muted-foreground">
                Visible to all TMS users and carriers on the exchange
              </p>
            </div>
            <Checkbox checked={publishPublic} className="pointer-events-none" />
          </button>

          <div className="flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" /> Private groups
            </span>
            <Separator className="flex-1" />
          </div>

          {/* Carrier groups */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 py-6 text-center">
              <Users className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No carrier groups yet</p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                asChild
              >
                <a href="/admin/tms/exchange/carrier-groups">Create a carrier group</a>
              </Button>
            </div>
          ) : (
            <ScrollArea className="max-h-56">
              <div className="space-y-2 pr-3">
                {groups.map((group) => {
                  const selected = selectedGroupIds.includes(group.id);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                        selected
                          ? "border-blue-500/40 bg-blue-500/5"
                          : "border-border/60 hover:border-border"
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-md border ${
                          COLOR_MAP[group.color || "blue"] || COLOR_MAP.blue
                        }`}
                      >
                        {group.group_type === "dynamic" ? (
                          <Sparkles className="h-4.5 w-4.5" />
                        ) : (
                          <Folder className="h-4.5 w-4.5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {group.name}
                          </p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {group.group_type === "dynamic" ? "Dynamic" : "Static"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {group.group_type === "static"
                            ? `${group.member_count ?? 0} carrier${(group.member_count ?? 0) === 1 ? "" : "s"}`
                            : group.description || "Rule-based group"}
                        </p>
                      </div>
                      <Checkbox checked={selected} className="pointer-events-none" />
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* Expiry */}
          <div className="space-y-1.5">
            <Label htmlFor="expires" className="text-xs">
              Offer expires (optional)
            </Label>
            <Input
              id="expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <div className="flex-1 text-xs text-muted-foreground self-center">
            {totalTargets > 0 && (
              <span>
                {totalTargets} destination{totalTargets > 1 ? "s" : ""} selected
              </span>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={publishing}>
            Cancel
          </Button>
          <Button onClick={handlePublish} disabled={publishing || totalTargets === 0}>
            {publishing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Publish
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
