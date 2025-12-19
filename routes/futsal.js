// routes/futsal.js
import express from 'express';
import { supabase } from '../supabaseClient.js';

const router = express.Router();

// Iniciar partido de futsal
router.post('/matches/start', async (req, res) => {
  try {
    const { player1_id, bot_id, match_type } = req.body;
    
    const { data: match, error } = await supabase
      .from('futsal_matches')
      .insert([{
        player1_id,
        bot_id,
        match_type: match_type || 'futsal_simulation',
        status: 'pending',
        created_at: new Date()
      }])
      .select()
      .single();
      
    if (error) throw error;
    
    res.json(match);
  } catch (error) {
    console.error('Error starting futsal match:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener bot oponente
router.get('/bots/opponent', async (req, res) => {
  try {
    const { playerLevel } = req.query;
    const targetLevel = Math.max(1, Math.min(10, Math.round(playerLevel || 1)));
    
    const { data: bots, error } = await supabase
      .from('bots')
      .select('*')
      .eq('difficulty', 'medium')
      .order('level', { ascending: true })
      .limit(10);
      
    if (error) throw error;
    
    // Seleccionar bot con nivel similar
    const suitableBots = bots.filter(bot => 
      Math.abs(bot.level - targetLevel) <= 2
    );
    
    const selectedBot = suitableBots.length > 0 
      ? suitableBots[Math.floor(Math.random() * suitableBots.length)]
      : bots[0];
      
    res.json(selectedBot);
  } catch (error) {
    console.error('Error getting bot opponent:', error);
    res.status(500).json({ error: error.message });
  }
});

// Actualizar partido
router.put('/matches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const { data: match, error } = await supabase
      .from('futsal_matches')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    
    // Si el partido se completó, actualizar personaje
    if (updates.status === 'completed' && updates.winner_id) {
      await updateCharacterAfterMatch(updates);
    }
    
    res.json(match);
  } catch (error) {
    console.error('Error updating futsal match:', error);
    res.status(500).json({ error: error.message });
  }
});

// Guardar estadísticas del partido
router.post('/matches/stats', async (req, res) => {
  try {
    const { match_id, character_id, ...stats } = req.body;
    
    const { data: matchStats, error } = await supabase
      .from('futsal_match_stats')
      .insert([{
        match_id,
        character_id,
        ...stats,
        created_at: new Date()
      }])
      .select()
      .single();
      
    if (error) throw error;
    
    res.json(matchStats);
  } catch (error) {
    console.error('Error saving match stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// routes/futsal.js - Agrega esta ruta
router.get("/bots/opponent", async (req, res) => {
  try {
    const { playerLevel } = req.query;
    const targetLevel = Math.max(1, Math.min(10, Math.round(playerLevel || 1)));
    
    console.log("🤖 Buscando bot para nivel:", targetLevel);
    
    // Usar la tabla 'bots' que ya tienes en tu schema
    const { data: bots, error } = await supabase
      .from("bots")
      .select("*")
      .order("level", { ascending: true })
      .limit(10);
      
    if (error) {
      console.error("❌ Error Supabase:", error);
      throw error;
    }
    
    if (!bots || bots.length === 0) {
      // Si no hay bots, crear uno por defecto
      const defaultBot = {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Bot Estándar",
        level: Math.max(1, Math.min(targetLevel, 10)),
        difficulty: "medium",
        pase: 50,
        tiro: 50,
        regate: 50,
        velocidad: 50,
        defensa: 50,
        potencia: 50
      };
      console.log("✅ Usando bot por defecto:", defaultBot.name);
      return res.json(defaultBot);
    }
    
    // Seleccionar bot con nivel similar
    const suitableBots = bots.filter(bot => 
      Math.abs(bot.level - targetLevel) <= 3
    );
    
    const selectedBot = suitableBots.length > 0 
      ? suitableBots[Math.floor(Math.random() * suitableBots.length)]
      : bots[0];
    
    console.log("✅ Bot seleccionado:", selectedBot.name, "nivel", selectedBot.level);
    res.json(selectedBot);
    
  } catch (error) {
    console.error("❌ Error en get bot opponent:", error);
    
    // Bot de fallback para evitar errores
    const fallbackBot = {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Bot Rápido",
      level: Math.max(1, Math.round((playerLevel || 1) / 2)),
      difficulty: "medium",
      pase: 60,
      tiro: 55,
      regate: 65,
      velocidad: 70,
      defensa: 45,
      potencia: 50
    };
    
    res.json(fallbackBot);
  }
});

// Historial de partidos
router.get('/matches/history/:characterId', async (req, res) => {
  try {
    const { characterId } = req.params;
    
    const { data: matches, error } = await supabase
      .from('futsal_matches')
      .select(`
        *,
        bots (*)
      `)
      .or(`player1_id.eq.${characterId},player2_id.eq.${characterId}`)
      .order('created_at', { ascending: false })
      .limit(20);
      
    if (error) throw error;
    
    res.json(matches);
  } catch (error) {
    console.error('Error getting match history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Estadísticas del jugador
router.get('/stats/:characterId', async (req, res) => {
  try {
    const { characterId } = req.params;
    
    const { data: stats, error } = await supabase
      .from('futsal_match_stats')
      .select('*')
      .eq('character_id', characterId);
      
    if (error) throw error;
    
    const totals = stats.reduce((acc, stat) => ({
      goals: acc.goals + (stat.goals || 0),
      assists: acc.assists + (stat.assists || 0),
      shots: acc.shots + (stat.shots || 0),
      passes: acc.passes + (stat.passes || 0),
      matches: acc.matches + 1
    }), { goals: 0, assists: 0, shots: 0, passes: 0, matches: 0 });
    
    res.json(totals);
  } catch (error) {
    console.error('Error getting player stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Función auxiliar para actualizar personaje después del partido
async function updateCharacterAfterMatch(matchData) {
  try {
    const { data: character, error: charError } = await supabase
      .from('characters')
      .select('*')
      .eq('id', matchData.winner_id)
      .single();
      
    if (charError) throw charError;
    
    const newExperience = (character.experience || 0) + (matchData.rewards_exp || 0);
    const newCoins = (character.lupicoins || 0) + (matchData.rewards_coins || 0);
    
    // Actualizar personaje
    const { error: updateError } = await supabase
      .from('characters')
      .update({
        experience: newExperience,
        lupicoins: newCoins
      })
      .eq('id', matchData.winner_id);
      
    if (updateError) throw updateError;
    
    // Actualizar wallet si existe
    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('character_id', matchData.winner_id)
      .single();
      
    if (wallet) {
      await supabase
        .from('wallets')
        .update({ 
          lupicoins: parseFloat(wallet.lupicoins || 0) + (matchData.rewards_coins || 0)
        })
        .eq('character_id', matchData.winner_id);
    }
  } catch (error) {
    console.error('Error updating character after match:', error);
  }
}

export default router;
