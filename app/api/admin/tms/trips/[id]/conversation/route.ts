import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/admin/tms/trips/[id]/conversation
// Retrieves or creates the conversation for this trip, returns messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await params
  const supabase = await createClient()

  // Find or create conversation for this trip
  let { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("context_type", "trip")
    .eq("context_id", tripId)
    .single()

  if (!conversation) {
    // Get trip reference for conversation title
    const { data: trip } = await supabase
      .from("trips")
      .select("reference_number")
      .eq("id", tripId)
      .single()

    // Create conversation
    const { data: newConversation, error: createError } = await supabase
      .from("conversations")
      .insert({
        context_type: "trip",
        context_id: tripId,
        type: "trip",
        title: `Trip ${trip?.reference_number || tripId.slice(0, 8)}`
      })
      .select("id")
      .single()

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }
    conversation = newConversation
  }

  // Fetch messages
  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, content, sender_type, sender_name, sender_id, created_at, message_type")
    .eq("conversation_id", conversation.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: conversation.id, messages: messages || [] })
}

// POST /api/admin/tms/trips/[id]/conversation
// Sends a message to the trip conversation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await params
  const supabase = await createClient()
  const body = await request.json()

  const { content } = body
  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 })
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get user profile for name
  const { data: profile } = await supabase
    .from("users")
    .select("email")
    .eq("id", user.id)
    .single()

  // Find conversation
  let { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("context_type", "trip")
    .eq("context_id", tripId)
    .single()

  if (!conversation) {
    // Get trip reference for conversation title
    const { data: trip } = await supabase
      .from("trips")
      .select("reference_number")
      .eq("id", tripId)
      .single()

    const { data: newConversation, error: createError } = await supabase
      .from("conversations")
      .insert({
        context_type: "trip",
        context_id: tripId,
        type: "trip",
        title: `Trip ${trip?.reference_number || tripId.slice(0, 8)}`,
        created_by_id: user.id,
        created_by_type: "admin"
      })
      .select("id")
      .single()

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }
    conversation = newConversation
  }

  // Insert message
  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      content: content.trim(),
      sender_type: "admin",
      sender_id: user.id,
      sender_name: profile?.email?.split("@")[0] || "Admin",
      message_type: "text"
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update conversation last_message
  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.trim().slice(0, 100),
      last_message_sender_name: profile?.email?.split("@")[0] || "Admin"
    })
    .eq("id", conversation.id)

  return NextResponse.json(message)
}
