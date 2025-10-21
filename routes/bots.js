import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// GET BOTS (Sin cambios)
router.get("/", async (req, res) => { /* ... tu código existente ... */ });

// START MATCH (Sin cambios)
router.post("/match", async (req, res) => { /* ... tu código existente ... */ });

/* ==========================================================
   NUEVO ENDPOINT: FINALIZAR Y GUARDAR RESULTADO DE PARTIDA
   Reemplaza al antiguo endpoint /simulate
   ========================================================== */
router.post("/:matchId/finish", async (req, res) => {
  const { matchId } = req.params;
  const { player1Score, player2Score } = req.body; // Recibimos el resultado del frontend

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
    
    // 3. Determinar ganador y calcular recompensas (usando tus funciones auxiliares)
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

    // 5. Aplicar EXP y sistema de niveles (tu código, sin cambios)
    const newExperience = (player.experience || 0) + rewards.exp;
    // ... (resto de tu lógica de cálculo de niveles)
    // ... (lógica para actualizar la tabla 'characters')

    // 6. Aplicar recompensas de monedas (tu código, sin cambios)
    // ... (lógica para buscar y actualizar/crear en la tabla 'wallets')

    // ... (Mensaje de éxito y respuesta JSON)
    res.json({
      message: "Partida finalizada y recompensas aplicadas.",
      matchResult: updatedMatch,
      rewards,
      // ... (cualquier otro dato que quieras devolver sobre el leveleo)
    });

  } catch (err) {
    console.error("❌ Error finalizando partida:", err);
    res.status(500).json({ error: "Error interno al finalizar la partida" });
  }
});


// GET HISTORIAL DE PARTIDAS (Sin cambios)
router.get("/history/:characterId", async (req, res) => { /* ... tu código existente ... */ });


// FUNCIONES AUXILIARES (Sin la simulación, solo se necesitan las recompensas)
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
