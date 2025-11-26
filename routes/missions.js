const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Obtener misiones activas para un jugador
router.get('/:characterId', async (req, res) => {
    try {
        const { characterId } = req.params;

        // Obtener misiones activas
        const { data: missions, error: missionsError } = await supabase
            .from('missions')
            .select('*')
            .eq('is_active', true);

        if (missionsError) throw missionsError;

        // Obtener progreso del jugador
        const { data: progress, error: progressError } = await supabase
            .from('mission_progress')
            .select('*')
            .eq('character_id', characterId);

        if (progressError) throw progressError;

        // Combinar misiones con progreso
        const missionsWithProgress = missions.map(mission => {
            const missionProgress = progress.find(p => p.mission_id === mission.id) || {
                current_progress: 0,
                is_completed: false,
                claimed_reward: false
            };

            return {
                ...mission,
                progress: missionProgress.current_progress,
                isCompleted: missionProgress.is_completed,
                claimedReward: missionProgress.claimed_reward
            };
        });

        res.json(missionsWithProgress);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Actualizar progreso de misión
router.post('/progress', async (req, res) => {
    try {
        const { characterId, missionType, progressValue = 1, eventData } = req.body;

        // Encontrar misiones que coincidan con el tipo
        const { data: missions, error: missionsError } = await supabase
            .from('missions')
            .select('*')
            .eq('objective_type', missionType)
            .eq('is_active', true);

        if (missionsError) throw missionsError;

        const results = [];

        for (const mission of missions) {
            // Obtener o crear progreso
            let { data: progress, error: progressError } = await supabase
                .from('mission_progress')
                .select('*')
                .eq('character_id', characterId)
                .eq('mission_id', mission.id)
                .single();

            if (progressError && progressError.code !== 'PGRST116') throw progressError;

            if (!progress) {
                const { data: newProgress, error: createError } = await supabase
                    .from('mission_progress')
                    .insert([{
                        character_id: characterId,
                        mission_id: mission.id,
                        current_progress: 0
                    }])
                    .select()
                    .single();

                if (createError) throw createError;
                progress = newProgress;
            }

            // Si ya está completada, saltar
            if (progress.is_completed) continue;

            // Actualizar progreso
            const newProgress = Math.min(
                progress.current_progress + progressValue,
                mission.objective_value
            );

            const isCompleted = newProgress >= mission.objective_value;

            const { data: updatedProgress, error: updateError } = await supabase
                .from('mission_progress')
                .update({
                    current_progress: newProgress,
                    is_completed: isCompleted,
                    completed_at: isCompleted ? new Date().toISOString() : null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', progress.id)
                .select()
                .single();

            if (updateError) throw updateError;

            // Registrar evento
            await supabase
                .from('mission_events')
                .insert([{
                    character_id: characterId,
                    mission_id: mission.id,
                    event_type: missionType,
                    progress_value: progressValue
                }]);

            results.push({
                mission: mission,
                progress: updatedProgress,
                wasCompleted: isCompleted && !progress.is_completed
            });
        }

        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reclamar recompensa
router.post('/claim', async (req, res) => {
    try {
        const { characterId, missionId } = req.body;

        // Verificar que la misión está completada
        const { data: progress, error: progressError } = await supabase
            .from('mission_progress')
            .select('*, missions(*)')
            .eq('character_id', characterId)
            .eq('mission_id', missionId)
            .single();

        if (progressError) throw progressError;

        if (!progress.is_completed) {
            return res.status(400).json({ error: 'Mission not completed' });
        }

        if (progress.claimed_reward) {
            return res.status(400).json({ error: 'Reward already claimed' });
        }

        // Marcar recompensa como reclamada
        const { error: updateError } = await supabase
            .from('mission_progress')
            .update({ claimed_reward: true })
            .eq('id', progress.id);

        if (updateError) throw updateError;

        // Aquí agregarías la lógica para dar las recompensas al jugador
        const rewards = {
            xp: progress.missions.reward_xp,
            lupicoins: progress.missions.reward_lupicoins,
            item: progress.missions.reward_item
        };

        // Llamar a tu servicio de recompensas
        // await rewardService.giveRewards(characterId, rewards);

        res.json({ 
            success: true, 
            rewards: rewards 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
