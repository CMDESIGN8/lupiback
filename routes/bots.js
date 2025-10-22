import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// ✅ AGREGAR ESTA RUTA QUE FALTA - GET BOTS
router.get("/", async (req, res) => {
  try {
    console.log("📍 GET /bots - Buscando bots en Supabase...");
    
    const { data: bots, error } = await supabase
      .from("bots")
      .select("*")
      .order("level", { ascending: true });

    if (error) {
      console.error("❌ Error Supabase:", error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`✅ Encontrados ${bots.length} bots`);
    res.json({ 
      success: true,
      bots: bots 
    });
    
  } catch (error) {
    console.error("❌ Error en GET /bots:", error);
    res.status(500).json({ 
      error: "Error interno del servidor",
      details: error.message 
    });
  }
});

/* ===============================
   START MATCH
   =============================== */
router.post("/match", async (req, res) => {
  const { characterId, botId } = req.body;

  console.log("🎯 Iniciando partida contra bot:", { characterId, botId });

  try {
    // Validar que los IDs existan
    const { data: character, error: charError } = await supabase
      .from("characters")
      .select("id, user_id, nickname")
      .eq("id", characterId)
      .single();

    if (charError || !character) {
      console.error("❌ Personaje no encontrado:", charError);
      return res.status(404).json({ error: "Personaje no encontrado" });
    }

    const { data: bot, error: botError } = await supabase
      .from("bots")
      .select("id, name, level")
      .eq("id", botId)
      .single();

    if (botError || !bot) {
      console.error("❌ Bot no encontrado:", botError);
      return res.status(404).json({ error: "Bot no encontrado" });
    }

    // Crear partida
    const { data: insertedMatch, error: matchError } = await supabase
      .from("matches")
      .insert({
        player1_id: characterId,
        player2_id: botId,
        match_type: "bot",
        status: "in_progress",
      })
      .select("id, created_at")
      .single();

    if (matchError) {
      console.error("❌ Error creando partida:", matchError);
      throw matchError;
    }

    console.log("✅ Partida creada:", insertedMatch.id);
    res.json({ 
      success: true,
      match: insertedMatch, 
      bot, 
      message: `Partida contra ${bot.name} iniciada` 
    });
  } catch (err) {
    console.error("❌ Error iniciando partida:", err);
    res.status(500).json({ 
      success: false,
      error: "Error interno al iniciar partida" 
    });
  }
});

/* ===============================
   FINISH MATCH
   =============================== */
router.post("/:matchId/finish", async (req, res) => {
  const { matchId } = req.params;
  const { player1Score, player2Score } = req.body;

  console.log("🎯 Finalizando partida:", { matchId, player1Score, player2Score });

  if (!matchId || player1Score === undefined || player2Score === undefined) {
    return res.status(400).json({ 
      success: false,
      error: "Faltan datos para finalizar la partida" 
    });
  }

  try {
    // 1. Obtener y validar partida
    console.log("🔍 Buscando partida:", matchId);
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id, player1_id, player2_id, status")
      .eq("id", matchId)
      .single();

    if (matchError || !match) {
      console.error("❌ Partida no encontrada:", matchError);
      return res.status(404).json({ 
        success: false,
        error: "Partida no encontrada" 
      });
    }

    if (match.status !== "in_progress") {
      return res.status(400).json({ 
        success: false,
        error: "La partida no puede ser finalizada" 
      });
    }

    // 2. Obtener participantes
    console.log("👤 Buscando participantes...");
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

    if (playerError || botError) {
      console.error("❌ Error buscando participantes:", { playerError, botError });
      return res.status(404).json({ 
        success: false,
        error: "No se pudieron encontrar los participantes" 
      });
    }

    console.log("✅ Participantes encontrados:", { 
      player: player.nickname, 
      bot: bot.name 
    });
    
    // 3. Determinar ganador y recompensas
    const isDraw = player1Score === player2Score;
    const isWinner = !isDraw && player1Score > player2Score;
    const winnerId = isDraw ? null : (isWinner ? player.id : bot.id);
    
    const rewards = calculateRewards(bot.level, player.level || 1, isWinner, isDraw);

    console.log("🏆 Resultado:", { 
      score: `${player1Score}-${player2Score}`,
      winner: isWinner ? player.nickname : (isDraw ? 'Empate' : bot.name),
      rewards 
    });

    // 4. Actualizar partida
    console.log("💾 Actualizando partida en BD...");
    const { data: updatedMatch, error: updateError } = await supabase
      .from("matches")
      .update({
        player1_score: player1Score,
        player2_score: player2Score,
        winner_id: winnerId,
        status: "finished",
        finished_at: new Date(),
        rewards_exp: rewards.exp,
        rewards_coins: rewards.coins
      })
      .eq("id", matchId)
      .select()
      .single();

    if (updateError) {
      console.error("❌ Error actualizando partida:", updateError);
      throw updateError;
    }

    console.log("✅ Partida actualizada:", updatedMatch.id);

    // 5. ✅ SISTEMA DE NIVELES CORREGIDO
    const newExperience = (player.experience || 0) + rewards.exp;
    const { newLevel, leveledUp, levelsGained } = calculatePlayerLevel(newExperience, player.level || 1);
    
    console.log("📈 Progreso de nivel:", {
      experienciaAnterior: player.experience,
      experienciaNueva: newExperience,
      nivelAnterior: player.level,
      nivelNuevo: newLevel,
      subioNivel: leveledUp,
      nivelesGanados: levelsGained
    });

    // Actualizar personaje
    const { error: updateCharError } = await supabase
      .from("characters")
      .update({
        experience: newExperience,
        level: newLevel,
        available_skill_points: (player.available_skill_points || 0) + (leveledUp ? levelsGained : 0)
      })
      .eq("id", player.id);

    if (updateCharError) {
      console.error("❌ Error actualizando personaje:", updateCharError);
      throw updateCharError;
    }

    console.log("✅ Personaje actualizado");

    // 6. Procesar recompensas de monedas
    console.log("💰 Procesando recompensas de monedas...");
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("lupicoins")
      .eq("character_id", player.id)
      .single();

    let newLupicoins = rewards.coins;

    if (walletError && walletError.code !== 'PGRST116') {
      console.error("❌ Error buscando wallet:", walletError);
      throw walletError;
    }

    if (wallet) {
      newLupicoins = (parseFloat(wallet.lupicoins) || 0) + rewards.coins;
      const { error: updateWalletError } = await supabase
        .from("wallets")
        .update({ lupicoins: newLupicoins })
        .eq("character_id", player.id);

      if (updateWalletError) {
        console.error("❌ Error actualizando wallet:", updateWalletError);
        throw updateWalletError;
      }
    } else {
      const { error: insertWalletError } = await supabase
        .from("wallets")
        .insert([{ 
          character_id: player.id, 
          lupicoins: rewards.coins,
          address: `wallet_${player.id}_${Date.now()}`
        }]);

      if (insertWalletError) {
        console.error("❌ Error creando wallet:", insertWalletError);
        throw insertWalletError;
      }
    }

    console.log("✅ Wallet actualizada. Nuevos lupicoins:", newLupicoins);
    console.log("🎉 Partida finalizada exitosamente");

    res.json({
      success: true,
      message: "Partida finalizada y recompensas aplicadas.",
      matchResult: {
        score: `${player1Score}-${player2Score}`,
        winner: isWinner ? player.nickname : (isDraw ? 'Empate' : bot.name),
        isDraw,
        isWinner
      },
      rewards,
      progression: {
        oldExperience: player.experience,
        newExperience,
        oldLevel: player.level || 1,
        newLevel,
        leveledUp,
        levelsGained: leveledUp ? levelsGained : 0,
        skillPointsGained: leveledUp ? levelsGained : 0
      },
      wallet: {
        coinsEarned: rewards.coins,
        totalCoins: newLupicoins
      }
    });

  } catch (err) {
    console.error("❌ Error finalizando partida:", err);
    res.status(500).json({ 
      success: false,
      error: "Error interno al finalizar la partida",
      details: err.message 
    });
  }
});

// ✅ FUNCIÓN ÚNICA Y MEJORADA PARA RECOMPENSAS
function calculateRewards(botLevel, playerLevel = 1, isWinner = true, isDraw = false) {
  // Sistema base balanceado
  let baseExp, baseCoins;
  
  if (isDraw) {
    baseExp = 25;
    baseCoins = 35;
  } else if (isWinner) {
    baseExp = 50;
    baseCoins = 65;
  } else {
    baseExp = 15;
    baseCoins = 25;
  }
  
  // Bonus/penalización por diferencia de nivel
  const levelDifference = botLevel - playerLevel;
  let difficultyMultiplier = 1.0;
  
  if (levelDifference > 0) {
    // Bonus por enfrentar bots más fuertes (máximo +50%)
    difficultyMultiplier += Math.min(0.5, levelDifference * 0.1);
  } else if (levelDifference < 0) {
    // Pequeña penalización por bots más débiles (máximo -20%)
    difficultyMultiplier += Math.max(-0.2, levelDifference * 0.05);
  }
  
  const finalExp = Math.round(baseExp * difficultyMultiplier);
  const finalCoins = Math.round(baseCoins * difficultyMultiplier);
  
  return {
    exp: Math.max(10, finalExp),        // Mínimo 10 EXP
    coins: Math.max(15, finalCoins)     // Mínimo 15 monedas
  };
}

// ✅ SISTEMA DE NIVELES CORREGIDO Y SIMPLIFICADO
function calculatePlayerLevel(experience, currentLevel = 1) {
  const exp = experience || 0;
  
  // Tabla de niveles progresiva pero alcanzable
  const levelThresholds = [
    0,     // Nivel 1: 0 EXP
    100,   // Nivel 2: 100 EXP
    220,   // Nivel 3: 220 EXP  
    360,   // Nivel 4: 360 EXP
    520,   // Nivel 5: 520 EXP
    700,   // Nivel 6: 700 EXP
    900,   // Nivel 7: 900 EXP
    1120,  // Nivel 8: 1120 EXP
    1360,  // Nivel 9: 1360 EXP
    1620,  // Nivel 10: 1620 EXP
    1900,  // Nivel 11: 1900 EXP
    2200,  // Nivel 12: 2200 EXP
    2520,  // Nivel 13: 2520 EXP
    2860,  // Nivel 14: 2860 EXP
    3220,  // Nivel 15: 3220 EXP
    3600   // Nivel 16: 3600 EXP
  ];
  
  // Calcular nuevo nivel
  let newLevel = 1;
  for (let i = levelThresholds.length - 1; i >= 0; i--) {
    if (exp >= levelThresholds[i]) {
      newLevel = i + 1;
      break;
    }
  }
  
  const leveledUp = newLevel > currentLevel;
  const levelsGained = leveledUp ? (newLevel - currentLevel) : 0;
  
  return {
    newLevel,
    leveledUp,
    levelsGained
  };
}

// GET HISTORIAL DE PARTIDAS (mantener tu implementación existente)
router.get("/history/:characterId", async (req, res) => {
  const { characterId } = req.params;
  
  try {
    const { data: matches, error } = await supabase
      .from("matches")
      .select(`
        *,
        player1:player1_id(nickname),
        player2:player2_id(name),
        winner:winner_id(nickname, name)
      `)
      .or(`player1_id.eq.${characterId},player2_id.eq.${characterId}`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    res.json({
      success: true,
      matches: matches || []
    });
  } catch (error) {
    console.error("❌ Error obteniendo historial:", error);
    res.status(500).json({
      success: false,
      error: "Error al obtener historial de partidas"
    });
  }
});

export default router;
