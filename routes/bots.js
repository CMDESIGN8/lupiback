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

  if (!matchId || player1Score === undefined || player2Score === undefined) {
    return res.status(400).json({ error: "Faltan datos para finalizar la partida" });
  }

  try {
    // 1. Obtener la partida y validar
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id, player1_id, player2_id, status")
      .eq("id", matchId)
      .single();

    if (matchError || !match) {
      return res.status(404).json({ error: "Partida no encontrada" });
    }
    if (match.status !== "in_progress") {
      return res.status(400).json({ error: "La partida no puede ser finalizada" });
    }

    // 2. Obtener datos de los participantes
    const { data: player, error: playerError } = await supabase
      .from('characters').select('*').eq('id', match.player1_id).single();
    const { data: bot, error: botError } = await supabase
      .from('bots').select('*').eq('id', match.player2_id).single();

    if (playerError || botError) {
      return res.status(404).json({ error: "No se pudieron encontrar los participantes" });
    }
    
    // 3. Determinar ganador y calcular recompensas
    const winnerId = player1Score > player2Score ? player.id : (player2Score > player1Score ? bot.id : null);
    const isWinner = winnerId === player.id;
    const rewards = getRewards(bot.level, player.level, isWinner);

    // 4. Actualizar la partida con el resultado
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

    if (updateError) throw updateError;

    // 5. Aplicar EXP y sistema de niveles
    const newExperience = (player.experience || 0) + rewards.exp;
    let newLevel = player.level || 1;
    let remainingExp = newExperience;
    
    // Calcular nuevo nivel basado en EXP
    while (remainingExp >= newLevel * 100) {
      remainingExp -= newLevel * 100;
      newLevel++;
    }

    // Actualizar personaje
    const { error: updateCharError } = await supabase
      .from("characters")
      .update({
        experience: newExperience,
        level: newLevel,
        available_skill_points: (player.available_skill_points || 0) + (newLevel > player.level ? 1 : 0)
      })
      .eq("id", player.id);

    if (updateCharError) throw updateCharError;

    // 6. Aplicar recompensas de monedas
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("character_id", player.id)
      .single();

    if (walletError && walletError.code !== 'PGRST116') throw walletError;

    if (wallet) {
      // Actualizar wallet existente
      const { error: updateWalletError } = await supabase
        .from("wallets")
        .update({ coins: (wallet.coins || 0) + rewards.coins })
        .eq("character_id", player.id);

      if (updateWalletError) throw updateWalletError;
    } else {
      // Crear nueva wallet
      const { error: insertWalletError } = await supabase
        .from("wallets")
        .insert([{ character_id: player.id, coins: rewards.coins }]);

      if (insertWalletError) throw insertWalletError;
    }

    res.json({
      message: "Partida finalizada y recompensas aplicadas.",
      matchResult: updatedMatch,
      rewards,
      levelUp: newLevel > player.level,
      newLevel: newLevel,
      newExperience: newExperience
    });

  } catch (err) {
    console.error("❌ Error finalizando partida:", err);
    res.status(500).json({ error: "Error interno al finalizar la partida" });
  }
});

// GET HISTORIAL DE PARTIDAS (Sin cambios)
router.get("/history/:characterId", async (req, res) => { /* ... tu código existente ... */ });

// FUNCIONES AUXILIARES
function getRewards(botLevel, playerLevel = 1, isWinner = true) {
  const baseExp = isWinner ? 150 : 75;
  const baseCoins = isWinner ? 200 : 100;
  const levelBonus = Math.max(0, botLevel - playerLevel) * 0.15;
  return {
    exp: Math.round(baseExp * (1 + levelBonus)),
    coins: Math.round(baseCoins * (1 + levelBonus)),
  };
}

export default router;
