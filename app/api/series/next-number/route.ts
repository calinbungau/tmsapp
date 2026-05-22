import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { entity_type, series_id, admin_id } = await request.json();

    if (!entity_type) {
      return NextResponse.json({ error: "entity_type is required" }, { status: 400 });
    }

    // Get the series to use - either specified or default
    let query = supabase
      .from("number_series")
      .select("*")
      .eq("entity_type", entity_type)
      .eq("is_active", true);

    // Filter by admin_id if provided
    if (admin_id) {
      query = query.eq("admin_id", admin_id);
    }

    if (series_id) {
      query = query.eq("id", series_id);
    } else {
      query = query.eq("is_default", true);
    }

    const { data: seriesArray, error: seriesError } = await query.limit(1);
    const series = seriesArray?.[0];

    if (seriesError || !series) {
      // No series configured - return a simple fallback
      const prefix = entity_type === "internal_order" ? "INT" 
        : entity_type === "forwarding_order" ? "FWD"
        : entity_type === "invoice" ? "INV"
        : "DOC";
      
      const year = new Date().getFullYear();
      const timestamp = Date.now().toString().slice(-6);
      
      return NextResponse.json({
        number: `${prefix}-${year}-${timestamp}`,
        series_id: null,
        fallback: true,
      });
    }

    // Get current year
    const currentYear = new Date().getFullYear().toString();
    
    // Get the current number from the JSONB field (or start_number if not set)
    const currentNumbers = series.current_numbers || {};
    const nextNumber = currentNumbers[currentYear] || series.start_number || 1;

    // Update the current_numbers JSONB to increment for this year
    const updatedNumbers = { ...currentNumbers, [currentYear]: nextNumber + 1 };
    
    await supabase
      .from("number_series")
      .update({ current_numbers: updatedNumbers })
      .eq("id", series.id);

    // Generate the number
    const yearStr = series.year_format === "YYYY" 
      ? currentYear 
      : currentYear.slice(-2);
    
    const numberStr = nextNumber.toString().padStart(series.number_padding || 4, "0");
    const yearSep = series.year_separator || "";
    const numSep = series.number_separator || "";

    let generatedNumber: string;
    
    if (!series.include_year) {
      // No year: PREFIX + numSep + NUMBER
      generatedNumber = `${series.prefix}${numSep}${numberStr}`;
    } else {
      // With year: PREFIX + yearSep + YEAR + numSep + NUMBER
      generatedNumber = `${series.prefix}${yearSep}${yearStr}${numSep}${numberStr}`;
    }

    return NextResponse.json({
      number: generatedNumber,
      series_id: series.id,
      series_name: series.name,
      next_number: nextNumber,
    });

  } catch (error) {
    console.error("[Series API] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate number" },
      { status: 500 }
    );
  }
}

// GET endpoint to preview what the next number would be without consuming it
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const entity_type = searchParams.get("entity_type");
    const admin_id = searchParams.get("admin_id");

    if (!entity_type) {
      return NextResponse.json({ error: "entity_type is required" }, { status: 400 });
    }

    // Get all active series for this entity type
    let query = supabase
      .from("number_series")
      .select("*")
      .eq("entity_type", entity_type)
      .eq("is_active", true);

    // Filter by admin_id if provided
    if (admin_id) {
      query = query.eq("admin_id", admin_id);
    }

    const { data: seriesArray, error } = await query.order("is_default", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const currentYear = new Date().getFullYear().toString();

    // Generate preview for each series
    const previews = (seriesArray || []).map(series => {
      const currentNumbers = series.current_numbers || {};
      const nextNumber = currentNumbers[currentYear] || series.start_number || 1;
      const yearStr = series.year_format === "YYYY" ? currentYear : currentYear.slice(-2);
      const numberStr = nextNumber.toString().padStart(series.number_padding || 4, "0");
      const yearSep = series.year_separator || "";
      const numSep = series.number_separator || "";

      let preview: string;
      if (!series.include_year) {
        preview = `${series.prefix}${numSep}${numberStr}`;
      } else {
        preview = `${series.prefix}${yearSep}${yearStr}${numSep}${numberStr}`;
      }

      return {
        id: series.id,
        name: series.name,
        prefix: series.prefix,
        is_default: series.is_default,
        preview,
        next_number: nextNumber,
      };
    });

    return NextResponse.json({ series: previews });

  } catch (error) {
    console.error("[Series API] Preview error:", error);
    return NextResponse.json(
      { error: "Failed to get series preview" },
      { status: 500 }
    );
  }
}
