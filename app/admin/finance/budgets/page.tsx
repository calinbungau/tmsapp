"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PiggyBank, Plus, Calendar, Target } from "lucide-react";
import Link from "next/link";

export default function BudgetsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PiggyBank className="h-6 w-6" />
            Budgets
          </h1>
          <p className="text-sm text-muted-foreground">
            Plan and track your fleet operating budgets
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Budget
        </Button>
      </div>

      {/* Coming Soon */}
      <Card>
        <CardContent className="p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-4">
            <PiggyBank className="h-8 w-8 text-blue-500" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Budget Management Coming Soon</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Create annual, quarterly, and monthly budgets by cost group.
            Track actual spending against budget with variance alerts
            when thresholds are exceeded.
          </p>
          <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>Period-based budgets</span>
            </div>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              <span>Variance tracking</span>
            </div>
          </div>
          <div className="mt-8">
            <Link href="/admin/finance/cost-entries">
              <Button variant="outline">
                Start by Adding Cost Entries
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
