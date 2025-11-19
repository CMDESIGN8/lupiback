import { supabase } from "../supabaseClient.js";

export class ClubMember {
  static async joinClub({ club_id, character_id, role = 'member' }) {
    // Verificar si ya es miembro
    const { data: existing } = await supabase
      .from('club_members')
      .select('id')
      .eq('club_id', club_id)
      .eq('character_id', character_id)
      .single();

    if (existing) {
      throw new Error('El personaje ya es miembro de este club');
    }

    // Iniciar transacción
    const { data: member, error: memberError } = await supabase
      .from('club_members')
      .insert([{ club_id, character_id, role }])
      .select()
      .single();

    if (memberError) throw memberError;

    // Actualizar contador de miembros del club
    const { error: clubError } = await supabase.rpc('increment_member_count', {
      club_id
    });

    if (clubError) throw clubError;

    // Actualizar character con club_id
    const { error: charError } = await supabase
      .from('characters')
      .update({ club_id, club_role: role })
      .eq('id', character_id);

    if (charError) throw charError;

    return member;
  }

  static async leaveClub({ club_id, character_id }) {
    // Eliminar miembro
    const { error: memberError } = await supabase
      .from('club_members')
      .delete()
      .eq('club_id', club_id)
      .eq('character_id', character_id);

    if (memberError) throw memberError;

    // Decrementar contador de miembros
    const { error: clubError } = await supabase.rpc('decrement_member_count', {
      club_id
    });

    if (clubError) throw clubError;

    // Actualizar character (remover club)
    const { error: charError } = await supabase
      .from('characters')
      .update({ club_id: null, club_role: null })
      .eq('id', character_id);

    if (charError) throw charError;

    return true;
  }

  static async updateRole({ club_id, character_id, new_role }) {
    const { data, error } = await supabase
      .from('club_members')
      .update({ role: new_role })
      .eq('club_id', club_id)
      .eq('character_id', character_id)
      .select()
      .single();

    if (error) throw error;

    // Actualizar role en character también
    await supabase
      .from('characters')
      .update({ club_role: new_role })
      .eq('id', character_id);

    return data;
  }

  static async getMembers(clubId) {
    const { data, error } = await supabase
      .from('club_members')
      .select(`
        *,
        characters (
          id,
          nickname,
          level,
          experience,
          pase,
          tiro,
          regate,
          defensa
        )
      `)
      .eq('club_id', clubId)
      .order('weekly_contribution', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async addContribution({ club_id, character_id, amount }) {
    const { data, error } = await supabase
      .from('club_members')
      .update({
        weekly_contribution: supabase.raw('weekly_contribution + ?', [amount]),
        total_contribution: supabase.raw('total_contribution + ?', [amount]),
        last_contribution_date: new Date()
      })
      .eq('club_id', club_id)
      .eq('character_id', character_id)
      .select()
      .single();

    if (error) throw error;

    // Actualizar contribución total del club
    await supabase.rpc('increment_club_contributions', {
      club_id,
      amount
    });

    return data;
  }

  static async getWeeklyRanking(clubId) {
    const { data, error } = await supabase
      .from('club_members')
      .select(`
        weekly_contribution,
        characters (
          nickname,
          level
        )
      `)
      .eq('club_id', clubId)
      .order('weekly_contribution', { ascending: false })
      .limit(10);

    if (error) throw error;
    return data;
  }

  static async findByClubAndCharacter(clubId, characterId) {
  const { data, error } = await supabase
    .from('club_members')
    .select('*')
    .eq('club_id', clubId)
    .eq('character_id', characterId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    throw error;
  }
  
  return data; // Retorna null si no encuentra
}

  static async resetWeeklyContributions() {
    // Esto se ejecutaría semanalmente via cron job
    const { error } = await supabase
      .from('club_members')
      .update({ weekly_contribution: 0 })
      .neq('weekly_contribution', 0);

    if (error) throw error;
    return true;
  }
  static async getAdmins(clubId) {
  const { data, error } = await supabase
    .from('club_members')
    .select(`
      *,
      characters (
        nickname
      )
    `)
    .eq('club_id', clubId)
    .eq('role', 'admin');

  if (error) throw error;
  return data;
}
}
