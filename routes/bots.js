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

    console.log(`✅ Enviando ${bots.length} bots al frontend`);
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

  console.log("🎯 Creando partida:", { characterId, botId });

  try {
    // Validar que los IDs existan para evitar errores de FK
    const { data: character, error: charError } = await supabase
      .from("characters")
      .select("id, user_id")
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
        player2_id: botId,
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

/* ==========================================================
   NUEVO ENDPOINT: FINALIZAR Y GUARDAR RESULTADO DE PARTIDA
   Reemplaza al antiguo endpoint /simulate
   ========================================================== */
router.post("/:matchId/finish", async (req, res) => {
  const { matchId } = req.params;
  const { player1Score, player2Score } = req.body;

  console.log("🎯 FINISH MATCH recibido:", { matchId, player1Score, player2Score });

  if (!matchId || player1Score === undefined || player2Score === undefined) {
    console.error("❌ Datos faltantes");
    return res.status(400).json({ error: "Faltan datos para finalizar la partida" });
  }

  try {
    // 1. Obtener la partida y validar
    console.log("🔍 Buscando partida:", matchId);
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id, player1_id, player2_id, status")
      .eq("id", matchId)
      .single();

    if (matchError || !match) {
      console.error("❌ Partida no encontrada:", matchError);
      return res.status(404).json({ error: "Partida no encontrada" });
    }
    
    console.log("📋 Partida encontrada:", match);

    if (match.status !== "in_progress") {
      console.error("❌ Estado inválido:", match.status);
      return res.status(400).json({ error: "La partida no puede ser finalizada" });
    }

    // 2. Obtener datos de los participantes
    console.log("👤 Buscando participantes...");
    const { data: player, error: playerError } = await supabase
      .from('characters').select('*').eq('id', match.player1_id).single();
    
    const { data: bot, error: botError } = await supabase
      .from('bots').select('*').eq('id', match.player2_id).single();

    if (playerError || botError) {
      console.error("❌ Error buscando participantes:", { playerError, botError });
      return res.status(404).json({ error: "No se pudieron encontrar los participantes" });
    }

    console.log("✅ Participantes encontrados:", { 
      player: player.nickname, 
      bot: bot.name 
    });
    
    // 3. Determinar ganador y calcular recompensas (CORREGIDO)
    const winnerId = player1Score > player2Score ? player.id : (player2Score > player1Score ? bot.id : null);
    const isWinner = winnerId === player.id;
    const isDraw = player1Score === player2Score;
    
    // ✅ SISTEMA DE RECOMPENSAS CORREGIDO - MENOS GENEROSO
    const rewards = getBalancedRewards(bot.level, player.level || 1, isWinner, isDraw);

    console.log("🏆 Resultado:", { 
      score: `${player1Score}-${player2Score}`, 
      winnerId, 
      rewards 
    });

    // 4. Actualizar la partida con el resultado
    console.log("💾 Actualizando partida en BD...");
    const { data: updatedMatch, error: updateError } = await supabase
      .from("matches").update({
        player1_score: player1Score,
        player2_score: player2Score,
        winner_id: winnerId,
        status: "finished",
        finished_at: new Date(),
        rewards_exp: rewards.exp,
        rewards_coins: rewards.coins
      }).eq("id", matchId).select().single();

    if (updateError) {
      console.error("❌ Error actualizando partida:", updateError);
      throw updateError;
    }

    console.log("✅ Partida actualizada:", updatedMatch);

    // 5. ✅ SISTEMA DE NIVELES CORREGIDO - FIJADO
const newExperience = (player.experience || 0) + rewards.exp;

// Calcular nuevo nivel con el sistema fijo
const newLevel = calculateLevel(newExperience);
const oldLevel = player.level || 1;
const leveledUp = newLevel > oldLevel;
const skillPointsGained = leveledUp ? (newLevel - oldLevel) : 0; // Para múltiples niveles

console.log("📈 Experiencia y nivel:", {
  oldExp: player.experience,
  newExperience,
  oldLevel: oldLevel,
  newLevel,
  leveledUp,
  skillPointsGained
});

    // Actualizar personaje
    const { error: updateCharError } = await supabase
      .from("characters")
      .update({
        experience: newExperience,
        level: newLevel,
        available_skill_points: (player.available_skill_points || 0) + skillPointsGained
      })
      .eq("id", player.id);

    if (updateCharError) {
      console.error("❌ Error actualizando personaje:", updateCharError);
      throw updateCharError;
    }

    console.log("✅ Personaje actualizado");

    // 6. Aplicar recompensas de monedas (sin cambios)
    console.log("💰 Procesando recompensas de monedas...");
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("character_id", player.id)
      .single();

    if (walletError && walletError.code !== 'PGRST116') {
      console.error("❌ Error buscando wallet:", walletError);
      throw walletError;
    }

    if (wallet) {
      const newLupicoins = (parseFloat(wallet.lupicoins) || 0) + rewards.coins;
      const { error: updateWalletError } = await supabase
        .from("wallets")
        .update({ lupicoins: newLupicoins })
        .eq("character_id", player.id);

      if (updateWalletError) {
        console.error("❌ Error actualizando wallet:", updateWalletError);
        throw updateWalletError;
      }
      console.log("✅ Wallet actualizada. Nuevos lupicoins:", newLupicoins);
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
      console.log("✅ Nueva wallet creada con", rewards.coins, "lupicoins");
    }

    console.log("🎉 Partida finalizada exitosamente");
    res.json({
      message: "Partida finalizada y recompensas aplicadas.",
      matchResult: updatedMatch,
      rewards,
      levelUp: leveledUp,
      newLevel: newLevel,
      newExperience: newExperience,
      skillPointsGained: skillPointsGained
    });

  } catch (err) {
    console.error("❌ Error finalizando partida:", err);
    res.status(500).json({ 
      error: "Error interno al finalizar la partida",
      details: err.message 
    });
  }
});

// ✅ FUNCIÓN MEJORADA - SISTEMA DE RECOMPENSAS CLARO
function getBalancedRewards(botLevel, playerLevel = 1, isWinner = true, isDraw = false) {
  // Sistema base más simple
  let baseExp, baseCoins;
  
  if (isDraw) {
    baseExp = 30;
    baseCoins = 40;
  } else if (isWinner) {
    baseExp = 60;
    baseCoins = 80;
  } else {
    baseExp = 20;
    baseCoins = 30;
  }
  
  // Bonus por dificultad moderado
  const levelDifference = botLevel - playerLevel;
  let difficultyMultiplier = 1.0;
  
  if (levelDifference > 0) {
    // Bonus por enfrentar bots más fuertes
    difficultyMultiplier += Math.min(0.5, levelDifference * 0.1);
  } else if (levelDifference < 0) {
    // Pequeña penalización por bots más débiles
    difficultyMultiplier += Math.max(-0.2, levelDifference * 0.05);
  }
  
  const finalExp = Math.round(baseExp * difficultyMultiplier);
  const finalCoins = Math.round(baseCoins * difficultyMultiplier);
  
  return {
    exp: Math.max(15, finalExp),
    coins: Math.max(20, finalCoins)
  };
}

// ✅ ALTERNATIVA - SISTEMA PROGRESIVO SIMPLE
function calculateLevel(experience) {
  const exp = experience || 0;
  
  // Tabla de niveles fija
  const levelThresholds = [
    0,    // Nivel 1: 0 EXP
    100,  // Nivel 2: 100 EXP
    250,  // Nivel 3: 250 EXP
    450,  // Nivel 4: 450 EXP
    700,  // Nivel 5: 700 EXP
    1000, // Nivel 6: 1000 EXP
    1350, // Nivel 7: 1350 EXP
    1750, // Nivel 8: 1750 EXP
    2200, // Nivel 9: 2200 EXP
    2700, // Nivel 10: 2700 EXP
    3250, // Nivel 11: 3250 EXP
    3850, // Nivel 12: 3850 EXP
    4500, // Nivel 13: 4500 EXP
    5200, // Nivel 14: 5200 EXP
    5950, // Nivel 15: 5950 EXP
    6750  // Nivel 16: 6750 EXP
    // Puedes agregar más niveles según necesites
  ];
  
  // Encontrar el nivel máximo que puede alcanzar con la EXP actual
  for (let level = levelThresholds.length - 1; level >= 1; level--) {
    if (exp >= levelThresholds[level]) {
      return level + 1; // +1 porque el array empieza en nivel 1
    }
  }
  
  return 1; // Nivel por defecto
}

// GET HISTORIAL DE PARTIDAS (Sin cambios)
router.get("/history/:characterId", async (req, res) => { /* ... tu código existente ... */ });

// FUNCIONES AUXILIARES
function getRewards(botLevel, playerLevel = 1, isWinner = true) {
  const baseExp = isWinner ? 150 : 75;
  const baseLupicoins = isWinner ? 200 : 100; // Cambiar nombre para claridad
  const levelBonus = Math.max(0, botLevel - playerLevel) * 0.15;
  return {
    exp: Math.round(baseExp * (1 + levelBonus)),
    coins: Math.round(baseLupicoins * (1 + levelBonus)), // coins se refiere a lupicoins
  };
}

export default router;
