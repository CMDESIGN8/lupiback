import { supabase } from "../supabaseClient.js";

export class Club {
  static async create({ name, description, created_by, logo_url = null, is_public = true }) {
    const { data, error } = await supabase
      .from('clubs')
      .insert([
        {
          name,
          description,
          created_by,
          logo_url,
          is_public,
          member_count: 1,
          level: 1
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findById(clubId) {
    const { data, error } = await supabase
      .from('clubs')
      .select(`
        *,
        club_members (
          character_id,
          role,
          characters (
            nickname,
            level
          )
        )
      `)
      .eq('id', clubId)
      .single();

    if (error) throw error;
    return data;
  }

  static async findAll({ page = 1, limit = 20, search = '' } = {}) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('clubs')
      .select('*', { count: 'exact' })
      .eq('is_public', true)
      .range(from, to)
      .order('member_count', { ascending: false });

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;
    return { clubs: data, total: count };
  }

  static async update(clubId, updates) {
    const { data, error } = await supabase
      .from('clubs')
      .update({ ...updates, updated_at: new Date() })
      .eq('id', clubId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async delete(clubId) {
    const { error } = await supabase
      .from('clubs')
      .delete()
      .eq('id', clubId);

    if (error) throw error;
    return true;
  }
}
