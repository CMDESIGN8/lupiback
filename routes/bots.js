// routes/bots.js
import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

/* ===============================
   GET BOTS: Listar bots disponibles
   =============================== */
router.get("/", async (req, res) => {
  try {
    const { data: bots, error } = await supabase
      .from("bots")
      .select("*")
      .order("level", { ascending: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ bots });
  } catch (err) {
    console.error("❌ Error obteniendo bots:", err);
    return res.status(500).json({ error: "Error interno al obtener bots" });
  }
});

/* ===============================
   START BOT MATCH: Iniciar partida contra bot
   =============================== */
router.post("/match", async (req, res) => {
  const { characterId, botId } = req.body;

  try {
    // Verificar personaje
    const { data: character, error: charError } = await supabase
      .from("characters")
      .select("*")
      .eq("id", characterId)
      .single();

    if (charError || !character) {
      return res.status(404).json({ error: "Personaje no encontrado" });
    }

    // Obtener bot
    const { data: bot, error: botError } = await supabase
      .from("bots")
      .select("*")
      .eq("id", botId)
      .single();

    if (botError || !bot) {
      return res.status(404).json({ error: "Bot no encontrado" });
    }

    // Crear partida contra bot
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .insert([
        {
          player1_id: characterId,
          player2_id: botId,
          match_type: "bot",
          status: "in_progress",
          started_at: new Date(),
        },
      ])
      .select()
      .single();

    if (matchError) {
      return res.status(400).json({ error: matchError.message });
    }

    res.json({ 
      match, 
      bot,
      message: `Partida contra ${bot.name} iniciada` 
    });
  } catch (err) {
    console.error("❌ Error en bot match:", err);
    return res.status(500).json({ error: "Error interno al iniciar partida" });
  }
});

/* ===============================
   SIMULATE BOT MATCH: Simular resultado contra bot
   =============================== */
router.post("/:matchId/simulate", async (req, res) => {
  const { matchId } = req.params;

  try {
    // Obtener partida y datos
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select(`
        *,
        player1:player1_id(*),
        player2:player2_id(*)
      `)
      .eq("id", matchId)
      .single();

    if (matchError || !match) {
      return res.status(404).json({ error: "Partida no encontrada" });
    }

    if (match.status !== "in_progress") {
      return res.status(400).json({ error: "La partida ya terminó" });
    }

    // Simular partida
    const simulation = simulateBotMatch(match.player1, match.player2);
    
    // Actualizar partida con resultado
    const { data: updatedMatch, error: updateError } = await supabase
      .from("matches")
      .update({
        player1_score: simulation.player1Score,
        player2_score: simulation.player2Score,
        winner_id: simulation.winnerId,
        status: "finished",
        finished_at: new Date(),
      })
      .eq("id", matchId)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // Dar recompensas
    let rewards = null;
    if (simulation.winnerId === match.player1_id) {
      rewards = await giveMatchRewards(match.player1_id, true, match.player2.level);
    } else if (simulation.player1Score === simulation.player2Score) {
      rewards = await giveMatchRewards(match.player1_id, false, match.player2.level);
    }

    res.json({
      match: updatedMatch,
      simulation: {
        ...simulation,
        rewards
      },
      message: simulation.winnerId === match.player1_id ? 
        `¡Ganaste ${simulation.player1Score}-${simulation.player2Score}!` :
        simulation.player1Score === simulation.player2Score ?
        `Empate ${simulation.player1Score}-${simulation.player2Score}` :
        `Perdiste ${simulation.player1Score}-${simulation.player2Score}`
    });
  } catch (err) {
    console.error("❌ Error en simulate bot match:", err);
    return res.status(500).json({ error: "Error interno al simular partida" });
  }
});

/* ===============================
   FUNCIONES HELPER
   =============================== */

function simulateBotMatch(player, bot) {
  const playerStats = calculateAverageStats(player);
  const botStats = calculateAverageStats(bot);
  
  const levelDiff = (player.level || 1) - (bot.level || 1);
  const baseGoals = Math.floor(Math.random() * 3) + 1;
  
  let playerAdvantage = (playerStats - botStats) / 100;
  playerAdvantage += levelDiff * 0.1;
  
  let playerScore = baseGoals;
  let botScore = baseGoals;
  
  if (playerAdvantage > 0) {
    const advantageFactor = 1 + Math.min(playerAdvantage, 0.5);
    playerScore = Math.round(baseGoals * advantageFactor);
    botScore = Math.max(0, baseGoals - Math.floor(playerAdvantage * 2));
  } else {
    const disadvantageFactor = 1 + Math.min(Math.abs(playerAdvantage), 0.3);
    botScore = Math.round(baseGoals * disadvantageFactor);
    playerScore = Math.max(0, baseGoals - Math.floor(Math.abs(playerAdvantage) * 1.5));
  }
  
  if (playerScore === botScore && Math.random() > 0.5) {
    if (playerAdvantage > 0) {
      playerScore += 1;
    } else {
      botScore += 1;
    }
  }
  
  playerScore = Math.min(playerScore, 7);
  botScore = Math.min(botScore, 7);
  
  const winnerId = playerScore > botScore ? player.id : 
                  botScore > playerScore ? bot.id : null;

  return {
    player1Score: playerScore,
    player2Score: botScore,
    winnerId,
    stats: {
      playerAdvantage: (playerAdvantage * 100).toFixed(1) + '%',
      levelDifference: levelDiff
    }
  };
}

function calculateAverageStats(character) {
  const stats = ['pase', 'tiro', 'regate', 'velocidad', 'defensa', 'potencia'];
  const total = stats.reduce((sum, stat) => sum + (character[stat] || 50), 0);
  return total / stats.length;
}

async function giveMatchRewards(characterId, isWinner, botLevel) {
  const baseExp = isWinner ? 150 : 75;
  const baseCoins = isWinner ? 200 : 100;
  
  const { data: character } = await supabase
    .from("characters")
    .select("level")
    .eq("id", characterId)
    .single();

  let levelBonus = 0;
  if (character && botLevel > character.level) {
    levelBonus = (botLevel - character.level) * 0.1;
  }

  const expReward = Math.round(baseExp * (1 + levelBonus));
  const coinsReward = Math.round(baseCoins * (1 + levelBonus));

  // Actualizar experiencia
  const { data: currentChar } = await supabase
    .from("characters")
    .select("experience, level")
    .eq("id", characterId)
    .single();

  if (currentChar) {
    await supabase
      .from("characters")
      .update({ experience: currentChar.experience + expReward })
      .eq("id", characterId);
  }

  // Actualizar lupicoins
  const { data: wallet } = await supabase
    .from("wallets")
    .select("lupicoins")
    .eq("character_id", characterId)
    .single();

  if (wallet) {
    await supabase
      .from("wallets")
      .update({ lupicoins: wallet.lupicoins + coinsReward })
      .eq("character_id", characterId);
  }

  return { expReward, coinsReward, levelBonus };
}

// EXPORTACIÓN CORRECTA
export default router;
