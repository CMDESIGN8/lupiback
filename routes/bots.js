import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

/* ===============================
   GET BOTS
   =============================== */
router.get("/", async (req, res) => {
  try {
    const { data: bots, error } = await supabase
      .from("bots")
      .select("*")
      .order("level", { ascending: true });

    if (error) throw error;

    res.json({ bots });
  } catch (err) {
    console.error("❌ Error obteniendo bots:", err);
    res.status(500).json({ error: "Error interno al obtener bots" });
  }
});

/* ===============================
   START MATCH
   =============================== */
router.post("/match", async (req, res) => {
  const { characterId, botId } = req.body;

  console.log("🎯 Creando partida:", { characterId, botId });

  try {
    // Validar que los IDs existan para evitar errores de FK
    const { data: character, error: charError } = await supabase
      .from("characters")
      .select("id")
      .eq("id", characterId)
      .single();

    if (charError || !character) {
      console.error("❌ Error buscando personaje:", charError);
      return res.status(404).json({ error: "Personaje no encontrado" });
    }

    const { data: bot, error: botError } = await supabase
      .from("bots")
      .select("id, name")
      .eq("id", botId)
      .single();

    if (botError || !bot) {
      console.error("❌ Error buscando bot:", botError);
      return res.status(404).json({ error: "Bot no encontrado" });
    }

    const { data: insertedMatch, error: matchError } = await supabase
      .from("matches")
      .insert({
        player1_id: characterId,
        player2_id: botId, // Guardamos el ID del bot
        match_type: "bot",
        status: "in_progress",
      })
      .select("id")
      .single();

    if (matchError) {
      console.error("❌ Error insertando partida:", matchError);
      throw matchError;
    }

    console.log("✅ Match creado exitosamente:", insertedMatch);

    res.json({ 
      match: insertedMatch, 
      bot, 
      message: `Partida contra ${bot.name} iniciada` 
    });
  } catch (err) {
    console.error("❌ Error iniciando partida:", err);
    res.status(500).json({ error: "Error interno al iniciar partida" });
  }
});

/* ===============================
   SIMULATE MATCH
   =============================== */
router.post("/:matchId/simulate", async (req, res) => {
  // CORRECCIÓN: El ID de la partida es un UUID (string), no un número.
  // Se elimina la conversión con parseInt.
  const { matchId } = req.params;

  // Validamos que el ID no esté vacío.
  if (!matchId) {
    return res.status(400).json({ error: "ID de partida inválido" });
  }

  try {
    // 1. Obtener la partida usando el matchId como string
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id, player1_id, player2_id, status")
      .eq("id", matchId)
      .single();

    if (matchError || !match) {
      console.error("❌ Error buscando partida para simular:", matchError);
      return res.status(404).json({ error: "Partida no encontrada" });
    }

    if (match.status !== "in_progress") {
      return res.status(400).json({ error: "La partida ya ha finalizado" });
    }

    // 2. Obtener datos del personaje y del bot por separado
    const { data: player, error: playerError } = await supabase
      .from('characters')
      .select('*')
      .eq('id', match.player1_id)
      .single();

    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('*')
      .eq('id', match.player2_id)
      .single();

    if (playerError || botError || !player || !bot) {
      console.error("❌ Error obteniendo participantes:", { playerError, botError });
      return res.status(404).json({ error: "No se pudieron encontrar los participantes de la partida" });
    }

    // 3. Simular el resultado
    const simulation = simulateBotMatch(player, bot);
    const isWinner = simulation.winnerId === player.id;
    const rewards = getRewards(bot.level, player.level, isWinner);

    // 4. Actualizar la partida con el resultado
    const { data: updatedMatch, error: updateError } = await supabase
      .from("matches")
      .update({
        player1_score: simulation.player1Score,
        player2_score: simulation.player2Score,
        winner_id: simulation.winnerId,
        status: "finished",
        finished_at: new Date(),
        rewards_exp: rewards.exp,
        rewards_coins: rewards.coins
      })
      .eq("id", matchId)
      .select("*")
      .single();

    if (updateError) {
      console.error("❌ Error actualizando partida:", updateError);
      throw updateError;
    }
    
    // 5. Aplicar recompensas al personaje (usando una función de base de datos para seguridad)
    const { error: rpcError } = await supabase.rpc('update_character_stats', {
      character_id: player.id,
      experience_to_add: rewards.exp,
      coins_to_add: rewards.coins,
    });

    if (rpcError) {
      console.error("❌ Error aplicando recompensas con RPC:", rpcError);
      // No devolvemos un error fatal, pero lo registramos. La partida terminó igualmente.
    }

    const message =
        simulation.winnerId === player.id
            ? `¡Ganaste ${simulation.player1Score}-${simulation.player2Score}!`
            : simulation.player1Score === simulation.player2Score
          ? `Perdiste ${simulation.player1Score}-${simulation.player2Score}`
          : `Empate ${simulation.player1Score}-${simulation.player2Score}`;


    res.json({
      match: updatedMatch,
      simulation,
      rewards,
      message
    });
  } catch (err) {
    console.error("❌ Error fatal simulando partida:", err);
    res.status(500).json({ error: "Error interno al simular partida" });
  }
});

/* ===============================
   FUNCIONES AUXILIARES
   =============================== */
function simulateBotMatch(player, bot) {
  const playerStats = averageStats(player);
  const botStats = averageStats(bot);
  const levelDiff = (player.level || 1) - (bot.level || 1);

  let playerScore = 0;
  let botScore = 0;
  
  // Simulación un poco más interesante
  for (let i = 0; i < 5; i++) {
    const playerRoll = Math.random() * playerStats + Math.random() * levelDiff * 2;
    const botRoll = Math.random() * botStats;

    if (playerRoll > botRoll) {
      playerScore++;
    } else {
      botScore++;
    }
  }

  const winnerId = playerScore > botScore ? player.id : (botScore > playerScore ? bot.id : null);

  return { player1Score: playerScore, player2Score: botScore, winnerId };
}

function averageStats(c) {
  const stats = ["pase", "tiro", "regate", "velocidad", "defensa", "potencia"];
  return stats.reduce((sum, s) => sum + (c[s] || 50), 0) / stats.length;
}

// Lógica de recompensas ahora en el backend para mayor seguridad
function getRewards(botLevel, playerLevel = 1, isWinner = true) {
  const baseExp = isWinner ? 150 : 75;
  const baseCoins = isWinner ? 200 : 100;
  // La bonificación es mayor si el bot tiene más nivel que el jugador
  const levelBonus = Math.max(0, botLevel - playerLevel) * 0.15;
  return {
    exp: Math.round(baseExp * (1 + levelBonus)),
    coins: Math.round(baseCoins * (1 + levelBonus)),
  };
}

export default router;
