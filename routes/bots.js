// ✅ backend/routes/bots.js
import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

/* ===============================
   GET BOTS
   =============================== */
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
      bots: bots,
    });
  } catch (error) {
    console.error("❌ Error en GET /bots:", error);
    res.status(500).json({
      error: "Error interno del servidor",
      details: error.message,
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
    const { data: character, error: charError } = await supabase
      .from("characters")
      .select("id, user_id, nickname")
      .eq("id", characterId)
      .single();

    if (charError || !character)
      return res.status(404).json({ error: "Personaje no encontrado" });

    const { data: bot, error: botError } = await supabase
      .from("bots")
      .select("id, name, level")
      .eq("id", botId)
      .single();

    if (botError || !bot)
      return res.status(404).json({ error: "Bot no encontrado" });

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

    if (matchError) throw matchError;

    console.log("✅ Partida creada:", insertedMatch.id);
    res.json({
      success: true,
      match: insertedMatch,
      bot,
      message: `Partida contra ${bot.name} iniciada`,
    });
  } catch (err) {
    console.error("❌ Error iniciando partida:", err);
    res.status(500).json({
      success: false,
      error: "Error interno al iniciar partida",
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
      error: "Faltan datos para finalizar la partida",
    });
  }

  try {
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id, player1_id, player2_id, status")
      .eq("id", matchId)
      .single();

    if (matchError || !match)
      return res.status(404).json({ success: false, error: "Partida no encontrada" });

    if (match.status !== "in_progress")
      return res.status(400).json({ success: false, error: "La partida no puede ser finalizada" });

    const { data: player, error: playerError } = await supabase
      .from("characters")
      .select("*")
      .eq("id", match.player1_id)
      .single();

    const { data: bot, error: botError } = await supabase
      .from("bots")
      .select("*")
      .eq("id", match.player2_id)
      .single();

    if (playerError || botError)
      return res.status(404).json({ success: false, error: "No se pudieron encontrar los participantes" });

    console.log("✅ Participantes encontrados:", { player: player.nickname, bot: bot.name });

    // Resultado y recompensas
    const isDraw = player1Score === player2Score;
    const isWinner = !isDraw && player1Score > player2Score;
    const winnerId = isDraw ? null : (isWinner ? player.id : bot.id);

    const rewards = calculateRewards(bot.level, player.level || 1, isWinner, isDraw);

    console.log("🏆 Resultado:", {
      score: `${player1Score}-${player2Score}`,
      winner: isWinner ? player.nickname : (isDraw ? "Empate" : bot.name),
      rewards,
    });

    // Actualizar partida
    await supabase
      .from("matches")
      .update({
        player1_score: player1Score,
        player2_score: player2Score,
        winner_id: winnerId,
        status: "finished",
        finished_at: new Date(),
        rewards_exp: rewards.exp,
        rewards_coins: rewards.coins,
      })
      .eq("id", matchId);

    // 📈 Sistema de niveles corregido
    const newExperience = (player.experience || 0) + rewards.exp;
    const { newLevel, leveledUp, levelsGained } = calculatePlayerLevel(
      newExperience,
      player.level || 1
    );

    // 🔒 Prevención de downgrade
    let finalLevel = newLevel;
    if (newLevel < player.level) {
      console.warn("⚠️ Nivel recalculado menor que el actual, manteniendo nivel anterior");
      finalLevel = player.level;
    }

    console.log("📈 Progreso de nivel:", {
      experienciaAnterior: player.experience,
      experienciaNueva: newExperience,
      nivelAnterior: player.level,
      nivelNuevo: finalLevel,
      subioNivel: finalLevel > player.level,
      nivelesGanados: levelsGained,
    });

    // Actualizar personaje
    await supabase
      .from("characters")
      .update({
        experience: newExperience,
        level: finalLevel,
        available_skill_points:
          (player.available_skill_points || 0) + (finalLevel > player.level ? levelsGained : 0),
      })
      .eq("id", player.id);

    // Monedas
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("lupicoins")
      .eq("character_id", player.id)
      .single();

    let newLupicoins = rewards.coins;

    if (walletError && walletError.code !== "PGRST116") throw walletError;

    if (wallet) {
      newLupicoins = (parseFloat(wallet.lupicoins) || 0) + rewards.coins;
      await supabase
        .from("wallets")
        .update({ lupicoins: newLupicoins })
        .eq("character_id", player.id);
    } else {
      await supabase
        .from("wallets")
        .insert([
          {
            character_id: player.id,
            lupicoins: rewards.coins,
            address: `wallet_${player.id}_${Date.now()}`,
          },
        ]);
    }

    console.log("✅ Wallet actualizada. Nuevos lupicoins:", newLupicoins);
    console.log("🎉 Partida finalizada exitosamente");

    res.json({
      success: true,
      message: "Partida finalizada y recompensas aplicadas.",
      matchResult: {
        score: `${player1Score}-${player2Score}`,
        winner: isWinner ? player.nickname : (isDraw ? "Empate" : bot.name),
        isDraw,
        isWinner,
      },
      rewards,
      progression: {
        oldExperience: player.experience,
        newExperience,
        oldLevel: player.level,
        newLevel: finalLevel,
        leveledUp: finalLevel > player.level,
        levelsGained: finalLevel > player.level ? levelsGained : 0,
        skillPointsGained: finalLevel > player.level ? levelsGained : 0,
      },
      wallet: {
        coinsEarned: rewards.coins,
        totalCoins: newLupicoins,
      },
    });
  } catch (err) {
    console.error("❌ Error finalizando partida:", err);
    res.status(500).json({
      success: false,
      error: "Error interno al finalizar la partida",
      details: err.message,
    });
  }
});

/* ===============================
   FUNCIONES DE CÁLCULO
   =============================== */
function calculateRewards(botLevel, playerLevel = 1, isWinner = true, isDraw = false) {
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

  const levelDifference = botLevel - playerLevel;
  let difficultyMultiplier = 1.0;

  if (levelDifference > 0) {
    difficultyMultiplier += Math.min(0.5, levelDifference * 0.1);
  } else if (levelDifference < 0) {
    difficultyMultiplier += Math.max(-0.2, levelDifference * 0.05);
  }

  const finalExp = Math.round(baseExp * difficultyMultiplier);
  const finalCoins = Math.round(baseCoins * difficultyMultiplier);

  return {
    exp: Math.max(10, finalExp),
    coins: Math.max(15, finalCoins),
  };
}

// ✅ SISTEMA DE NIVELES ESCALABLE (hasta nivel 100)
function calculatePlayerLevel(experience, currentLevel = 1) {
  const exp = experience || 0;

  // Genera tabla progresiva
  const levelThresholds = [0];
  let next = 100;
  for (let i = 1; i <= 100; i++) {
    levelThresholds.push(Math.round(levelThresholds[i - 1] + next));
    next *= 1.05;
  }

  // Buscar nivel alcanzado
  let newLevel = 1;
  for (let i = levelThresholds.length - 1; i >= 0; i--) {
    if (exp >= levelThresholds[i]) {
      newLevel = i + 1;
      break;
    }
  }

  const leveledUp = newLevel > currentLevel;
  const levelsGained = leveledUp ? newLevel - currentLevel : 0;

  return { newLevel, leveledUp, levelsGained };
}

/* ===============================
   HISTORIAL DE PARTIDAS
   =============================== */
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

    res.json({ success: true, matches: matches || [] });
  } catch (error) {
    console.error("❌ Error obteniendo historial:", error);
    res.status(500).json({
      success: false,
      error: "Error al obtener historial de partidas",
    });
  }
});

export default router;
