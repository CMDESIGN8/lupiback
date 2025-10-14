const { supabase } = require('../config/supabase');

const getAvailableMissions = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: missions, error } = await supabase
      .from('missions')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true });

    if (error) throw error;

    const { data: progress, error: progressError } = await supabase
      .from('player_missions')
      .select('*')
      .eq('player_id', userId);

    if (progressError) throw progressError;

    const missionsWithProgress = missions.map(mission => {
      const userProgress = progress.find(p => p.mission_id === mission.id);
      return {
        ...mission,
        user_progress: userProgress || null,
        completed: userProgress?.is_completed || false,
        current_progress: userProgress?.progress || 0
      };
    });

    res.json(missionsWithProgress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateMissionProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { missionId, progress } = req.body;

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('*')
      .eq('id', missionId)
      .single();

    if (missionError) throw missionError;

    const isCompleted = progress >= mission.required_value;

    const { data, error } = await supabase
      .from('player_missions')
      .upsert({
        player_id: userId,
        mission_id: missionId,
        progress: Math.min(progress, mission.required_value),
        is_completed: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null
      })
      .select()
      .single();

    if (error) throw error;

    if (isCompleted) {
      await grantMissionRewards(userId, mission);
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const grantMissionRewards = async (userId, mission) => {
  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', userId)
    .single();

  const updates = {
    experience: player.experience + mission.xp_reward,
    skill_points: player.skill_points + mission.skill_points_reward,
    lupi_coins: player.lupi_coins + mission.lupicoins_reward
  };

  await supabase
    .from('players')
    .update(updates)
    .eq('id', userId);

  if (mission.is_daily) {
    await supabase
      .from('players')
      .update({
        daily_missions_completed: player.daily_missions_completed + 1
      })
      .eq('id', userId);
  }
};

const getDailyMissions = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: missions, error } = await supabase
      .from('missions')
      .select('*')
      .eq('is_daily', true)
      .eq('is_active', true);

    if (error) throw error;

    const { data: progress } = await supabase
      .from('player_missions')
      .select('*')
      .eq('player_id', userId)
      .in('mission_id', missions.map(m => m.id));

    const missionsWithProgress = missions.map(mission => {
      const userProgress = progress?.find(p => p.mission_id === mission.id);
      return {
        ...mission,
        user_progress: userProgress || null
      };
    });

    res.json(missionsWithProgress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getCompletedMissions = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: missions, error } = await supabase
      .from('player_missions')
      .select(`
        mission_id,
        completed_at,
        progress,
        missions (*)
      `)
      .eq('player_id', userId)
      .eq('is_completed', true)
      .order('completed_at', { ascending: false });

    if (error) throw error;

    res.json(missions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAvailableMissions,
  updateMissionProgress,
  getDailyMissions,
  getCompletedMissions
};