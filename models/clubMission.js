import { supabase } from "../supabaseClient.js";

export class ClubMission {
  static async create({
    club_id,
    title,
    description,
    reward_exp = 100,
    reward_coins = 200,
    target_value,
    mission_type = 'general',
    deadline,
    created_by
  }) {
    const { data, error } = await supabase
      .from('club_missions')
      .insert([
        {
          club_id,
          title,
          description,
          reward_exp,
          reward_coins,
          target_value,
          mission_type,
          deadline,
          created_by,
          status: 'active'
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getClubMissions(clubId, status = 'active') {
    let query = supabase
      .from('club_missions')
      .select(`
        *,
        club_mission_progress (
          character_id,
          progress_value,
          completed_at
        )
      `)
      .eq('club_id', clubId);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async updateProgress({ mission_id, character_id, progress_value }) {
    const { data: mission, error: missionError } = await supabase
      .from('club_missions')
      .select('*')
      .eq('id', mission_id)
      .single();

    if (missionError) throw missionError;

    // Verificar si ya existe progreso
    const { data: existingProgress } = await supabase
      .from('club_mission_progress')
      .select('*')
      .eq('mission_id', mission_id)
      .eq('character_id', character_id)
      .single();

    let result;
    if (existingProgress) {
      // Actualizar progreso existente
      const newProgress = Math.min(existingProgress.progress_value + progress_value, mission.target_value);
      const isCompleted = newProgress >= mission.target_value && !existingProgress.completed_at;

      const { data, error } = await supabase
        .from('club_mission_progress')
        .update({
          progress_value: newProgress,
          completed_at: isCompleted ? new Date() : null
        })
        .eq('id', existingProgress.id)
        .select()
        .single();

      if (error) throw error;
      result = data;

      // Si se completó, dar recompensas
      if (isCompleted) {
        await this.#giveMissionRewards(mission, character_id);
      }
    } else {
      // Crear nuevo progreso
      const isCompleted = progress_value >= mission.target_value;
      
      const { data, error } = await supabase
        .from('club_mission_progress')
        .insert([
          {
            mission_id,
            character_id,
            progress_value,
            completed_at: isCompleted ? new Date() : null
          }
        ])
        .select()
        .single();

      if (error) throw error;
      result = data;

      // Si se completó, dar recompensas
      if (isCompleted) {
        await this.#giveMissionRewards(mission, character_id);
      }
    }

    // Actualizar progreso total de la misión
    await this.#updateMissionProgress(mission_id);

    return result;
  }

  static async #giveMissionRewards(mission, character_id) {
    // Dar EXP al personaje
    const { data: character } = await supabase
      .from('characters')
      .select('*')
      .eq('id', character_id)
      .single();

    const newExperience = (character.experience || 0) + mission.reward_exp;
    let newLevel = character.level || 1;
    let remainingExp = newExperience;

    // Calcular nuevo nivel
    while (remainingExp >= newLevel * 100) {
      remainingExp -= newLevel * 100;
      newLevel++;
    }

    await supabase
      .from('characters')
      .update({
        experience: newExperience,
        level: newLevel,
        available_skill_points: (character.available_skill_points || 0) + (newLevel > character.level ? 1 : 0)
      })
      .eq('id', character_id);

    // Dar Lupicoins
    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('character_id', character_id)
      .single();

    if (wallet) {
      await supabase
        .from('wallets')
        .update({ lupicoins: (parseFloat(wallet.lupicoins) || 0) + mission.reward_coins })
        .eq('character_id', character_id);
    } else {
      await supabase
        .from('wallets')
        .insert([{ 
          character_id, 
          lupicoins: mission.reward_coins,
          address: `wallet_${character_id}_${Date.now()}`
        }]);
    }
  }

  static async #updateMissionProgress(mission_id) {
    // Calcular progreso total de la misión
    const { data: progress } = await supabase
      .from('club_mission_progress')
      .select('progress_value')
      .eq('mission_id', mission_id);

    const totalProgress = progress.reduce((sum, p) => sum + p.progress_value, 0);
    
    const { data: mission } = await supabase
      .from('club_missions')
      .select('target_value')
      .eq('id', mission_id)
      .single();

    const currentValue = Math.min(totalProgress, mission.target_value);
    const isCompleted = currentValue >= mission.target_value;

    await supabase
      .from('club_missions')
      .update({
        current_value: currentValue,
        status: isCompleted ? 'completed' : 'active'
      })
      .eq('id', mission_id);
  }
}
