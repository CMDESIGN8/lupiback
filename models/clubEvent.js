// models/clubEvent.js - VERSIÓN CORREGIDA
import { supabase } from "../supabaseClient.js";

export class ClubEvent {
  static async create({ 
    club_id, 
    title, 
    description, 
    event_type = 'training', 
    start_date, 
    end_date = null, 
    max_participants = null, 
    location = null,
    price = 0,
    reward_lupicoins = 0,
    created_by 
  }) {
    const { data, error } = await supabase
      .from('club_events')
      .insert([
        {
          club_id,
          title,
          description,
          event_type,
          start_date,
          end_date,
          max_participants,
          location,
          price,
          reward_lupicoins,
          created_by,
          status: 'scheduled'
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findById(eventId) {
    const { data, error } = await supabase
      .from('club_events')
      .select(`
        *,
        clubs (
          name,
          logo_url
        )
      `)
      .eq('id', eventId)
      .single();

    if (error) throw error;
    return data;
  }

  static async findByClubId(clubId) {
    const { data, error } = await supabase
      .from('club_events')
      .select(`
        *,
        club_event_participants (
          character_id
        )
      `)
      .eq('club_id', clubId)
      .order('start_date', { ascending: true });

    if (error) throw error;
    return data;
  }

  static async update(eventId, updates) {
    const { data, error } = await supabase
      .from('club_events')
      .update({ ...updates, updated_at: new Date() })
      .eq('id', eventId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async delete(eventId) {
    const { error } = await supabase
      .from('club_events')
      .delete()
      .eq('id', eventId);

    if (error) throw error;
    return true;
  }

  static async updateStatus(eventId, status) {
    const { data, error } = await supabase
      .from('club_events')
      .update({ status, updated_at: new Date() })
      .eq('id', eventId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getParticipantCount(eventId) {
    const { count, error } = await supabase
      .from('club_event_participants')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);

    if (error) throw error;
    return count;
  }
}